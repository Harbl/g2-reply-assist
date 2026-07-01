import 'dotenv/config'
import { IncomingMessage } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { config, printConfig } from './config.js'
import { LocalSttSession } from './localStt.js'
import { GoogleSttSession } from './googleStt.js'
import { generateReplySuggestions, type ReplySuggestion } from './suggest.js'

const PORT = Number(process.env.PORT ?? 8787)
const WS_TOKEN = process.env.WS_TOKEN
const MAX_CONNECTIONS = 3
// PCM at 16 kHz 16-bit mono = 32 KB/s. Allow 3× headroom for chunking bursts.
const PCM_RATE_LIMIT_BYTES_PER_SEC = 96_000

if (!WS_TOKEN) {
  console.error('WS_TOKEN is not set — refusing to start without auth.')
  process.exit(1)
}

printConfig()

function verifyClient(
  { req }: { req: IncomingMessage },
  cb: (result: boolean, code?: number, message?: string) => void,
) {
  if (wss.clients.size >= MAX_CONNECTIONS) {
    cb(false, 503, 'Too many connections')
    return
  }
  const url = new URL(req.url ?? '/', `ws://localhost`)
  if (url.searchParams.get('token') !== WS_TOKEN) {
    cb(false, 401, 'Unauthorized')
    return
  }
  cb(true)
}

const wss = new WebSocketServer({ port: PORT, maxPayload: 65_536, verifyClient })

console.log(`g2-reply-assist backend listening on ws://0.0.0.0:${PORT}`)

// ── Helpers ────────────────────────────────────────────────────────────────

function normalize(s: string) {
  return s.replace(/[\s、。！？!?,.　]/g, '').toLowerCase()
}

function charOverlap(utterance: string, suggestion: string): number {
  if (!utterance.length) return 0
  const pool = [...suggestion]
  let matched = 0
  for (const ch of utterance) {
    const idx = pool.indexOf(ch)
    if (idx !== -1) { matched++; pool.splice(idx, 1) }
  }
  return matched / utterance.length
}

function isUserReply(utterance: string, suggestions: ReplySuggestion[]): boolean {
  const u = normalize(utterance)
  if (!u) return false
  return suggestions.some(s => {
    const sj = normalize(s.japanese)
    return u === sj || u.includes(sj) || sj.includes(u) || charOverlap(u, sj) >= 0.75
  })
}

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload))
}

// ── Per-connection handler ─────────────────────────────────────────────────

wss.on('connection', ws => {
  console.log(`glasses connected (${wss.clients.size} active)`)
  const stt = config.sttProvider === 'google' ? new GoogleSttSession() : new LocalSttSession()
  let utteranceId = 0
  let activeSuggestions: ReplySuggestion[] = []

  // PCM rate limiter — reset byte counter every second.
  let bytesThisSecond = 0
  const rateTimer = setInterval(() => { bytesThisSecond = 0 }, 1000)

  stt.on('interim', text => {
    send(ws, { type: 'transcript', finalText: '', interimText: text, finished: false })
  })

  stt.on('final', text => {
    const heard = text.trim()
    const thisUtterance = ++utteranceId
    send(ws, { type: 'listening' })

    if (heard && isUserReply(heard, activeSuggestions)) {
      activeSuggestions = []
      return
    }

    activeSuggestions = []
    send(ws, { type: 'transcript', finalText: text, interimText: '', finished: true })

    if (!heard) return
    generateReplySuggestions(heard)
      .then(({ heardEnglish, suggestions }) => {
        if (thisUtterance !== utteranceId) return
        activeSuggestions = suggestions
        send(ws, { type: 'suggestions', heard, heardEnglish, options: suggestions })
      })
      .catch(err => {
        console.error('suggestion generation failed:', err)
        if (thisUtterance === utteranceId) {
          send(ws, { type: 'error', message: 'Could not generate suggestions.' })
        }
      })
  })

  stt.on('error', err => {
    console.error('STT error:', err)
    send(ws, { type: 'error', message: 'Speech recognition error.' })
  })

  stt.start()

  ws.on('message', (data, isBinary) => {
    if (!isBinary || !Buffer.isBuffer(data)) return
    bytesThisSecond += data.length
    if (bytesThisSecond > PCM_RATE_LIMIT_BYTES_PER_SEC) {
      console.warn('PCM rate limit exceeded — dropping connection')
      ws.close(1008, 'Rate limit exceeded')
      return
    }
    stt.sendPcm(data)
  })

  ws.on('close', () => {
    console.log(`glasses disconnected (${wss.clients.size} remaining)`)
    clearInterval(rateTimer)
    stt.stop()
  })
})
