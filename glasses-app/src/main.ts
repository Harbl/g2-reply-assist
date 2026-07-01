import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { connectBackend, type ReplySuggestion } from './asr/stt'
import { mountUi, mountSetupScreen, setStatus, setTranscript, setSuggestions } from './ui'

// Native bridge storage keys — persists across app sessions unlike WebView localStorage
const KEY_SERVER_URL = 'g2ra.serverUrl'
const KEY_TOKEN = 'g2ra.token'

function buildWsUrl(serverUrl: string, token: string): string {
  const u = new URL(serverUrl)
  u.searchParams.set('token', token)
  return u.toString()
}

// ── Entry point ────────────────────────────────────────────────────────────

;(async () => {
  // Get bridge first — native bridge.getLocalStorage/setLocalStorage persists
  // across app sessions. Even Hub clears WebView localStorage on close.
  document.getElementById('app')!.innerHTML =
    '<div style="padding:24px;font-family:sans-serif;color:#555;">Starting…</div>'
  const bridge = await waitForEvenAppBridge()

  const [serverUrl, token] = await Promise.all([
    bridge.getLocalStorage(KEY_SERVER_URL),
    bridge.getLocalStorage(KEY_TOKEN),
  ])

  if (!serverUrl || !token) {
    mountSetupScreen(async ({ serverUrl: sv, token: tok }) => {
      await Promise.all([
        bridge.setLocalStorage(KEY_SERVER_URL, sv),
        bridge.setLocalStorage(KEY_TOKEN, tok),
      ])
      location.reload()
    })
    return
  }

  // ── Normal app flow ──────────────────────────────────────────────────────
  const initServerUrl = serverUrl
  const initToken = token

  mountUi()

  const main = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 4,
    containerID: 1,
    containerName: 'main',
    content: 'Listening…',
    isEventCapture: 1,
  })

  const created = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({ containerTotalNum: 1, textObject: [main] }),
  )
  if (created !== 0) {
    setStatus('error', `createStartUpPageContainer failed: ${created}`)
    console.error('Failed to create startup page')
  }

  // ── Display state ────────────────────────────────────────────────────────
  type Mode = 'listening' | 'suggestions'
  let mode: Mode = 'listening'
  let heardEnglish = ''
  let suggestions: ReplySuggestion[] = []
  let pageIndex = 0

  let lastRender = ''
  let renderTimer: number | null = null

  function scheduleGlassesRender() {
    if (renderTimer !== null) return
    renderTimer = window.setTimeout(async () => {
      renderTimer = null
      const content = render()
      if (content === lastRender) return
      lastRender = content
      await bridge.textContainerUpgrade(
        new TextContainerUpgrade({ containerID: 1, containerName: 'main', content }),
      )
    }, 120)
  }

  function render(): string {
    if (mode === 'suggestions' && suggestions.length > 0) {
      const s = suggestions[pageIndex]
      return (
        `"${heardEnglish}"\n\n` +
        `[${pageIndex + 1}/${suggestions.length}]\n` +
        `${s.japanese}\n${s.romaji}\n(${s.gloss})\n\n` +
        `‹swipe for more›`
      )
    }
    return 'Listening…'
  }

  const wsUrl = buildWsUrl(initServerUrl, initToken)

  const backend = connectBackend(
    wsUrl,
    msg => {
      switch (msg.type) {
        case 'transcript':
          setTranscript(msg.finalText, msg.interimText)
          scheduleGlassesRender()
          break
        case 'listening':
          mode = 'listening'
          heardEnglish = ''
          suggestions = []
          pageIndex = 0
          scheduleGlassesRender()
          break
        case 'suggestions':
          mode = 'suggestions'
          heardEnglish = msg.heardEnglish
          suggestions = msg.options
          pageIndex = 0
          setSuggestions(msg.heardEnglish, msg.options)
          scheduleGlassesRender()
          break
        case 'error':
          setStatus('error', msg.message)
          console.error('Backend error:', msg.message)
          break
      }
    },
    err => {
      const msg = (err as Error)?.message ?? String(err)
      setStatus('error', `Connection failed: ${msg}`)
      console.error('Backend connection error:', err)
      offerReconfigure()
    },
  )

  function offerReconfigure() {
    const app = document.querySelector<HTMLDivElement>('#app')
    if (!app || app.querySelector('.reconfigure-btn')) return
    const btn = document.createElement('button')
    btn.className = 'reconfigure-btn'
    btn.textContent = 'Change server settings'
    btn.style.cssText = [
      'display:block', 'margin:16px auto 0', 'background:#3E3E3E',
      'color:#E5E5E5', 'border:1px solid #5E5E5E', 'border-radius:10px',
      'font-size:13px', 'padding:10px 18px', 'cursor:pointer',
    ].join(';')
    btn.addEventListener('click', () => {
      mountSetupScreen(
        async ({ serverUrl: sv, token: tok }) => {
          await Promise.all([
            bridge.setLocalStorage(KEY_SERVER_URL, sv),
            bridge.setLocalStorage(KEY_TOKEN, tok),
          ])
          location.reload()
        },
        { serverUrl: initServerUrl, token: initToken },
      )
    })
    app.appendChild(btn)
  }

  await bridge.audioControl(true)
  setStatus('listening', 'Microphone live · double-tap the temple to exit')

  let cleanedUp = false
  function cleanup() {
    if (cleanedUp) return
    cleanedUp = true
    bridge.audioControl(false)
    backend.close()
    unsubscribe()
  }

  // Event routing, critical details:
  //   • Protobuf omits zero-value fields on the wire, so CLICK_EVENT (0)
  //     arrives as `undefined`. Always coalesce with `?? 0` before comparing.
  //   • Taps/double-taps/lifecycle come through `event.sysEvent`.
  //     Swipe up/down on the active text container comes through
  //     `event.textEvent` — that's how suggestion pages are cycled.
  //     Audio PCM frames come through `event.audioEvent` — separate branch.
  //   • Double-tap → `shutDownPageContainer(1)` is a root-level check: it
  //     must fire no matter which envelope the event arrives in, so users
  //     can always exit the app. System exit confirmation dialog appears;
  //     SYSTEM_EXIT_EVENT fires on confirm and we clean up there.
  const unsubscribe = bridge.onEvenHubEvent(event => {
    const pcm = event.audioEvent?.audioPcm
    if (pcm) backend.sendPcm(pcm)

    const sysType = event.sysEvent?.eventType ?? null
    const textType = event.textEvent?.eventType ?? null

    if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      bridge.shutDownPageContainer(1)
      return
    }

    if (mode === 'suggestions' && suggestions.length > 0) {
      if (textType === OsEventTypeList.SCROLL_TOP_EVENT) {
        pageIndex = (pageIndex - 1 + suggestions.length) % suggestions.length
        scheduleGlassesRender()
      } else if (textType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
        pageIndex = (pageIndex + 1) % suggestions.length
        scheduleGlassesRender()
      }
    }

    if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      cleanup()
    }
  })

  window.addEventListener('beforeunload', cleanup)
})()
