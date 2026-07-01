// WebSocket client for the g2-reply-assist backend.
//
// The G2 mic emits PCM s16le @ 16 kHz, mono via `bridge.audioControl(true)`.
// Each chunk is forwarded as a binary WebSocket frame. The backend handles
// speech-to-text (local Whisper or Google Cloud STT) and reply suggestion
// generation (Ollama, OpenAI, or Anthropic) — credentials stay server-side.

export interface ReplySuggestion {
  japanese: string
  romaji: string
  gloss: string
}

export type BackendMessage =
  | { type: 'transcript'; finalText: string; interimText: string; finished: boolean }
  | { type: 'suggestions'; heard: string; heardEnglish: string; options: ReplySuggestion[] }
  | { type: 'listening' }
  | { type: 'error'; message: string }

export interface BackendClient {
  sendPcm(chunk: Uint8Array): void
  close(): void
}

export function connectBackend(
  url: string,
  onMessage: (msg: BackendMessage) => void,
  onError?: (err: unknown) => void,
): BackendClient {
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  let queue: Uint8Array[] = []
  ws.addEventListener('open', () => {
    for (const chunk of queue) ws.send(chunk)
    queue = []
  })

  ws.addEventListener('message', event => {
    try {
      onMessage(JSON.parse(event.data as string) as BackendMessage)
    } catch (err) {
      onError?.(err)
    }
  })

  ws.addEventListener('error', err => onError?.(err))

  return {
    sendPcm(chunk) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk)
      } else {
        queue.push(chunk)
      }
    },
    close() {
      ws.close()
    },
  }
}
