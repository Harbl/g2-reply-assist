import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { connectBackend, type ReplySuggestion } from './asr/stt'
import { mountUi, setStatus, setTranscript, setSuggestions } from './ui'

mountUi()

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string
if (!BACKEND_URL) {
  setStatus('error', 'VITE_BACKEND_URL not set — copy .env.example to .env.local')
  console.warn('VITE_BACKEND_URL is not set.')
}

const bridge = await waitForEvenAppBridge()

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

// ── Display state ──────────────────────────────────────────────────────
// 'listening' shows the live interim transcript. 'suggestions' shows one
// reply option at a time, paginated by swipe. The backend pushes a
// `{ type: 'listening' }` reset the instant a new utterance starts — ours
// or theirs — so stale suggestions never just hang on screen.
type Mode = 'listening' | 'suggestions'
let mode: Mode = 'listening'
let interimText = ''
let heard = ''
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
  }, 120) // debounce display writes — BLE render queue is slow
}

function render(): string {
  if (mode === 'suggestions' && suggestions.length > 0) {
    const s = suggestions[pageIndex]
    return (
      `Heard: ${heard}\n\n` +
      `[${pageIndex + 1}/${suggestions.length}]\n` +
      `${s.japanese}\n${s.romaji}\n(${s.gloss})\n\n` +
      `‹swipe for more›`
    )
  }
  return interimText ? `Listening…\n\n${interimText}` : 'Listening…'
}

const backend = connectBackend(
  BACKEND_URL,
  msg => {
    switch (msg.type) {
      case 'transcript':
        interimText = (msg.finalText + msg.interimText).trim()
        setTranscript(msg.finalText, msg.interimText)
        scheduleGlassesRender()
        break
      case 'listening':
        mode = 'listening'
        interimText = ''
        suggestions = []
        pageIndex = 0
        scheduleGlassesRender()
        break
      case 'suggestions':
        mode = 'suggestions'
        heard = msg.heard
        suggestions = msg.options
        pageIndex = 0
        setSuggestions(msg.heard, msg.options)
        scheduleGlassesRender()
        break
      case 'error':
        setStatus('error', msg.message)
        console.error('Backend error:', msg.message)
        break
    }
  },
  err => {
    setStatus('error', `Backend connection error: ${(err as Error)?.message ?? err}`)
    console.error('Backend connection error:', err)
  },
)

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
