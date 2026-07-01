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
  app.innerHTML = `
    <main class="setup-panel">
      <header class="setup-header">
        <h1>G2 Reply Assist</h1>
        <p class="setup-sub">First-time setup · use your phone to fill this in</p>
      </header>

      <div class="field-group">
        <label for="serverUrl">Backend server URL</label>
        <input id="serverUrl" type="url" autocomplete="off" spellcheck="false"
          placeholder="wss://your-server.com  or  ws://192.168.x.x:8787"
          value="${escapeAttr(existingValues?.serverUrl ?? '')}" />
        <span class="hint">WebSocket URL of your g2-reply-assist backend</span>
      </div>

      <div class="field-group">
        <label for="token">Auth token</label>
        <input id="token" type="text" autocomplete="off" spellcheck="false"
          placeholder="Paste your WS_TOKEN here"
          value="${escapeAttr(existingValues?.token ?? '')}" />
        <span class="hint">Matches WS_TOKEN in your backend .env</span>
      </div>

      <div id="setup-error" class="setup-error" hidden></div>

      <button id="saveBtn" class="save-btn">Save &amp; Connect</button>

      <details class="setup-help">
        <summary>Setup guide</summary>
        <p>1. Clone <code>g2-reply-assist</code> and follow SETUP.txt to run the backend on your server.</p>
        <p>2. Choose STT: local Whisper (faster-whisper-server) or Google Cloud STT.</p>
        <p>3. Choose LLM: Ollama/OpenAI-compatible or Anthropic Claude.</p>
        <p>4. Set <code>STT_PROVIDER</code>, <code>LLM_PROVIDER</code>, and credentials in <code>backend/.env</code>.</p>
        <p>5. Expose port 8787 via Cloudflare Tunnel or direct port forwarding for WSS.</p>
        <p>6. Enter the WSS URL and your WS_TOKEN above, then tap Save.</p>
      </details>
    </main>
  `
  injectSetupStyles()

  const saveBtn = app.querySelector<HTMLButtonElement>('#saveBtn')!
  const errorEl = app.querySelector<HTMLDivElement>('#setup-error')!

  saveBtn.addEventListener('click', () => {
    const serverUrl = (app.querySelector<HTMLInputElement>('#serverUrl')!).value.trim()
    const token = (app.querySelector<HTMLInputElement>('#token')!).value.trim()

    if (!serverUrl) {
      showError(errorEl, 'Server URL is required.')
      return
    }
    try {
      new URL(serverUrl)
    } catch {
      showError(errorEl, 'Server URL does not look valid — check the format.')
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
      color: #E5E5E5;
      border-radius: 12px; padding: 20px; font-size: 18px; line-height: 1.5;
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
    html, body { margin: 0; height: 100%; background: #232323; color: #E5E5E5;
      font: 16px/1.5 -apple-system, BlinkMacSystemFont, 'Helvetica Neue', system-ui, sans-serif;
      touch-action: manipulation; -webkit-text-size-adjust: 100%;
      overscroll-behavior: none; }
    #app { display: flex; min-height: 100%; }
    .setup-panel { width: 100%; max-width: 600px; margin: 0 auto;
      padding: 28px 24px 40px; display: flex; flex-direction: column; gap: 20px; }
    .setup-header { display: flex; flex-direction: column; gap: 4px; }
    .setup-header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.02em; }
    .setup-sub { margin: 0; font-size: 13px; color: #919191; }
    .field-group { display: flex; flex-direction: column; gap: 6px; }
    label { font-size: 13px; font-weight: 600; color: #C0C0C0; letter-spacing: 0.03em; }
    input { background: #2E2E2E; border: 1px solid #3E3E3E; border-radius: 10px;
      color: #E5E5E5; font-size: 15px; padding: 12px 14px; width: 100%;
      outline: none; transition: border-color 0.15s; }
    input:focus { border-color: #3CFA44; }
    input::placeholder { color: #5E5E5E; }
    .hint { font-size: 12px; color: #7B7B7B; }
    .setup-error { background: rgba(255,69,58,0.12); border: 1px solid #FF453A;
      border-radius: 8px; color: #FF453A; font-size: 13px; padding: 10px 14px; }
    .save-btn { background: #3CFA44; color: #111; border: none; border-radius: 12px;
      font-size: 16px; font-weight: 700; padding: 14px; cursor: pointer;
      letter-spacing: 0.02em; transition: opacity 0.15s; }
    .save-btn:active { opacity: 0.75; }
    .setup-help { background: #2E2E2E; border: 1px solid #3E3E3E; border-radius: 10px;
      padding: 12px 16px; font-size: 13px; color: #C0C0C0; }
    .setup-help summary { cursor: pointer; font-weight: 600; color: #E5E5E5;
      list-style: none; }
    .setup-help summary::-webkit-details-marker { display: none; }
    .setup-help summary::before { content: '▶ '; font-size: 10px; }
    details[open] .setup-help summary::before { content: '▼ '; }
    .setup-help p { margin: 8px 0 0; }
    code { background: #3E3E3E; border-radius: 4px; padding: 1px 5px; font-size: 12px; }
  `
  addStyle(css)
}

function addStyle(css: string) {
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
}
