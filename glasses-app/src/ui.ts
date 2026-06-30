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

function escapeHtml(s: string) {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

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
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
}
