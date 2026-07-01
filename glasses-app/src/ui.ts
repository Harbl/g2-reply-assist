import type { ReplySuggestion } from './asr/stt'

type Status = 'connecting' | 'listening' | 'error'

let statusEl: HTMLDivElement
let finalEl: HTMLSpanElement
let interimEl: HTMLSpanElement
let suggestionsEl: HTMLDivElement

export function mountUi() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `
    <main class="panel">
      <header>
        <h1>G2 Reply Assist</h1>
        <div id="status" class="status status-connecting">Connecting…</div>
      </header>
      <section class="transcript" aria-live="polite">
        <span id="final"></span><span id="interim" class="interim"></span>
      </section>
      <section id="suggestions" class="suggestions"></section>
      <footer>Swipe to cycle suggestions · double-tap the temple to exit.</footer>
    </main>
  `
  statusEl = app.querySelector<HTMLDivElement>('#status')!
  finalEl = app.querySelector<HTMLSpanElement>('#final')!
  interimEl = app.querySelector<HTMLSpanElement>('#interim')!
  suggestionsEl = app.querySelector<HTMLDivElement>('#suggestions')!
  injectStyles()
}

export function setStatus(kind: Status, text: string) {
  if (!statusEl) return
  statusEl.className = `status status-${kind}`
  statusEl.textContent = text
}

export function setTranscript(finalText: string, interimText: string) {
  if (!finalEl) return
  finalEl.textContent = finalText
  interimEl.textContent = interimText
}

export function setSuggestions(heard: string, options: ReplySuggestion[]) {
  if (!suggestionsEl) return
  suggestionsEl.innerHTML =
    `<div class="heard">Heard: ${escapeHtml(heard)}</div>` +
    options
      .map(
        o =>
          `<div class="suggestion">
            <div class="ja">${escapeHtml(o.japanese)}</div>
            <div class="romaji">${escapeHtml(o.romaji)}</div>
            <div class="gloss">${escapeHtml(o.gloss)}</div>
          </div>`,
      )
      .join('')
}

// ── Setup screen ───────────────────────────────────────────────────────────

export interface SetupValues {
  serverUrl: string
  token: string
}

export function mountSetupScreen(
  onSave: (values: SetupValues) => void,
  existingValues?: Partial<SetupValues>,
) {
  const app = document.querySelector<HTMLDivElement>('#app')!
  const isReconfigure = !!existingValues?.serverUrl

  app.innerHTML = `
    <main class="setup-panel">

      <div class="setup-hero">
        <h1 class="setup-title">G2 Reply Assist</h1>
        <p class="setup-tagline">
          Real-time Japanese reply suggestions on your G2 glasses.
          Hear something — see three natural responses in seconds.
        </p>
      </div>

      <div class="setup-steps">

        <div class="setup-step">
          <div class="step-badge">1</div>
          <div class="step-body">
            <div class="step-heading">Run the backend server</div>
            <p class="step-text">
              This app needs a backend you run on your own hardware or VPS.
              It handles speech recognition and AI — your credentials stay
              off the glasses entirely.
            </p>
            <a class="repo-link"
               href="https://github.com/Harbl/g2-reply-assist-backend"
               target="_blank"
               rel="noopener noreferrer">
              github.com/Harbl/g2-reply-assist-backend
            </a>
            <p class="step-text step-providers">
              Supports <strong>local Whisper + Ollama</strong> (free, runs on your GPU)
              or <strong>Google STT + Claude / OpenAI</strong> (cloud, no GPU needed).
            </p>
          </div>
        </div>

        <div class="setup-step">
          <div class="step-badge">2</div>
          <div class="step-body">
            <div class="step-heading">${isReconfigure ? 'Update your server details' : 'Enter your server details'}</div>

            <div class="field-group">
              <label for="serverUrl">Backend URL</label>
              <input
                id="serverUrl"
                type="url"
                autocomplete="off"
                spellcheck="false"
                placeholder="wss://g2.yourdomain.com"
                value="${escapeAttr(existingValues?.serverUrl ?? '')}"
              />
              <span class="field-hint">WebSocket address of your backend server</span>
            </div>

            <div class="field-group">
              <label for="token">Auth token</label>
              <input
                id="token"
                type="text"
                autocomplete="off"
                spellcheck="false"
                placeholder="Paste your WS_TOKEN here"
                value="${escapeAttr(existingValues?.token ?? '')}"
              />
              <span class="field-hint">The <code>WS_TOKEN</code> value from your backend <code>.env</code></span>
            </div>

          </div>
        </div>

      </div>

      <div id="setup-error" class="setup-error" hidden></div>

      <button id="saveBtn" class="save-btn">
        ${isReconfigure ? 'Reconnect' : 'Save &amp; Connect'}
      </button>

      ${isReconfigure ? '' : `
      <p class="setup-footer">
        Your settings are saved locally on this device and never shared.
      </p>
      `}

    </main>
  `

  injectSetupStyles()

  const saveBtn = app.querySelector<HTMLButtonElement>('#saveBtn')!
  const errorEl = app.querySelector<HTMLDivElement>('#setup-error')!

  saveBtn.addEventListener('click', () => {
    const serverUrl = (app.querySelector<HTMLInputElement>('#serverUrl')!).value.trim()
    const token = (app.querySelector<HTMLInputElement>('#token')!).value.trim()

    if (!serverUrl) {
      showError(errorEl, 'Backend URL is required.')
      return
    }
    if (!serverUrl.startsWith('ws://') && !serverUrl.startsWith('wss://')) {
      showError(errorEl, 'URL must start with ws:// or wss://')
      return
    }
    if (!token) {
      showError(errorEl, 'Auth token is required.')
      return
    }

    errorEl.hidden = true
    onSave({ serverUrl, token })
  })
}

function showError(el: HTMLDivElement, msg: string) {
  el.textContent = msg
  el.hidden = false
}

function escapeHtml(s: string) {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

function escapeAttr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

// ── Styles ─────────────────────────────────────────────────────────────────

function injectStyles() {
  // ER brand dark-theme surfaces: #232323 / #2E2E2E / #3E3E3E.
  // ER OS green (#3CFA44) + signal red (#FF453A) for state chips.
  const css = `
    :root { color-scheme: dark; }
    html, body { margin: 0; height: 100%; background: #232323; color: #E5E5E5;
      font: 16px/1.4 -apple-system, BlinkMacSystemFont, 'Helvetica Neue', system-ui, sans-serif;
      touch-action: manipulation; -webkit-text-size-adjust: 100%;
      overscroll-behavior: none; }
    #app { display: flex; height: 100%; }
    .panel { display: flex; flex-direction: column; gap: 16px;
      width: 100%; max-width: 640px; margin: 0 auto; padding: 24px; box-sizing: border-box; }
    header { display: flex; align-items: center; justify-content: space-between; }
    h1 { font-size: 18px; font-weight: 600; margin: 0; letter-spacing: 0.02em; }
    .status { font-size: 12px; padding: 4px 10px; border-radius: 999px;
      border: 1px solid transparent; letter-spacing: 0.04em; text-transform: uppercase; }
    .status-connecting { color: #A7A7A7; border-color: #3E3E3E; }
    .status-listening  { color: #3CFA44; border-color: #3CFA44; background: rgba(60,250,68,0.08); }
    .status-error      { color: #FF453A; border-color: #FF453A; background: rgba(255,69,58,0.08); }
    .transcript { flex: 1; overflow: auto; background: #2E2E2E; border: 1px solid #3E3E3E;
      color: #E5E5E5; border-radius: 12px; padding: 20px; font-size: 18px; line-height: 1.5;
      min-height: 180px; white-space: pre-wrap; word-break: break-word; }
    .interim { color: #919191; }
    .suggestions { display: flex; flex-direction: column; gap: 10px; }
    .heard { font-size: 13px; color: #919191; }
    .suggestion { background: #2E2E2E; border: 1px solid #3E3E3E; border-radius: 10px;
      padding: 12px 16px; }
    .suggestion .ja { font-size: 18px; }
    .suggestion .romaji { font-size: 14px; color: #3CFA44; margin-top: 2px; }
    .suggestion .gloss { font-size: 12px; color: #919191; margin-top: 2px; }
    footer { font-size: 12px; color: #7B7B7B; text-align: center; }
  `
  addStyle(css)
}

function injectSetupStyles() {
  const css = `
    :root { color-scheme: dark; }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; background: #1A1A1A; color: #E5E5E5;
      font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Helvetica Neue', system-ui, sans-serif;
      touch-action: manipulation; -webkit-text-size-adjust: 100%;
      overscroll-behavior: none;
    }
    #app { display: flex; min-height: 100vh; }

    /* ── Layout ── */
    .setup-panel {
      width: 100%; max-width: 560px; margin: 0 auto;
      padding: 32px 20px 48px;
      display: flex; flex-direction: column; gap: 28px;
    }

    /* ── Hero ── */
    .setup-hero { display: flex; flex-direction: column; gap: 8px; }
    .setup-title {
      margin: 0; font-size: 26px; font-weight: 700;
      letter-spacing: -0.01em; color: #F0F0F0;
    }
    .setup-tagline {
      margin: 0; font-size: 14px; line-height: 1.6; color: #A0A0A0;
    }

    /* ── Steps ── */
    .setup-steps { display: flex; flex-direction: column; gap: 0; }
    .setup-step {
      display: flex; gap: 16px; padding: 24px 0;
      border-top: 1px solid #2A2A2A;
    }
    .setup-step:last-child { border-bottom: 1px solid #2A2A2A; }

    .step-badge {
      flex-shrink: 0;
      width: 30px; height: 30px; border-radius: 50%;
      border: 1.5px solid #3CFA44; color: #3CFA44;
      font-size: 13px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      margin-top: 2px;
    }
    .step-body { display: flex; flex-direction: column; gap: 10px; flex: 1; min-width: 0; }
    .step-heading { font-size: 15px; font-weight: 700; color: #F0F0F0; }
    .step-text { margin: 0; font-size: 13px; color: #A0A0A0; line-height: 1.6; }
    .step-providers { border-left: 2px solid #2E2E2E; padding-left: 10px; margin-top: 2px; }
    .step-providers strong { color: #C8C8C8; }

    /* ── Repo link ── */
    .repo-link {
      display: inline-block;
      background: rgba(60, 250, 68, 0.08);
      border: 1px solid rgba(60, 250, 68, 0.3);
      border-radius: 8px;
      padding: 8px 12px;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: 12px; color: #3CFA44;
      text-decoration: none;
      word-break: break-all;
      transition: background 0.15s, border-color 0.15s;
    }
    .repo-link:hover { background: rgba(60,250,68,0.14); border-color: rgba(60,250,68,0.55); }

    /* ── Fields ── */
    .field-group { display: flex; flex-direction: column; gap: 5px; }
    label { font-size: 12px; font-weight: 600; color: #909090; letter-spacing: 0.06em; text-transform: uppercase; }
    input {
      background: #242424; border: 1px solid #333; border-radius: 10px;
      color: #E5E5E5; font-size: 15px; padding: 12px 14px; width: 100%;
      outline: none; transition: border-color 0.15s;
      font-family: inherit;
    }
    input:focus { border-color: #3CFA44; background: #262626; }
    input::placeholder { color: #484848; }
    .field-hint { font-size: 12px; color: #606060; }
    code { background: #2E2E2E; border-radius: 4px; padding: 1px 5px; font-size: 11px; font-family: ui-monospace, monospace; }

    /* ── Error ── */
    .setup-error {
      background: rgba(255, 69, 58, 0.1); border: 1px solid rgba(255, 69, 58, 0.4);
      border-radius: 8px; color: #FF6B63; font-size: 13px; padding: 11px 14px;
    }

    /* ── Save button ── */
    .save-btn {
      background: #3CFA44; color: #0A0A0A; border: none; border-radius: 12px;
      font-size: 16px; font-weight: 700; padding: 15px;
      cursor: pointer; letter-spacing: 0.01em;
      transition: opacity 0.15s, transform 0.1s;
      width: 100%;
    }
    .save-btn:active { opacity: 0.8; transform: scale(0.99); }

    /* ── Footer note ── */
    .setup-footer {
      margin: 0; text-align: center;
      font-size: 12px; color: #484848; line-height: 1.5;
    }
  `
  addStyle(css)
}

function addStyle(css: string) {
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
}
