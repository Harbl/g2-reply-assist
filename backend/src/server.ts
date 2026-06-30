import 'dotenv/config'
import { WebSocket, WebSocketServer } from 'ws'
import { GoogleSttSession } from './googleStt.js'
import { generateReplySuggestions } from './suggest.js'

const PORT = Number(process.env.PORT ?? 8787)
const wss = new WebSocketServer({ port: PORT })

console.log(`g2-reply-assist backend listening on ws://0.0.0.0:${PORT}`)

wss.on('connection', ws => {
  console.log('glasses connected')
  const stt = new GoogleSttSession()
  let utteranceId = 0

  stt.on('interim', text => {
    send(ws, { type: 'transcript', finalText: '', interimText: text, finished: false })
  })

  stt.on('final', text => {
    // New speech — ours or theirs — makes any suggestions on screen stale.
    // Clear immediately rather than waiting on the (slower) Claude round trip.
    const thisUtterance = ++utteranceId
    send(ws, { type: 'listening' })
    send(ws, { type: 'transcript', finalText: text, interimText: '', finished: true })

    const heard = text.trim()
    if (!heard) return
    generateReplySuggestions(heard)
      .then(options => {
        // A newer utterance superseded this one while Claude was thinking — drop it.
        if (thisUtterance !== utteranceId) return
        send(ws, { type: 'suggestions', heard, options })
      })
      .catch(err => {
        console.error('suggestion generation failed:', err)
        if (thisUtterance === utteranceId) {
          send(ws, { type: 'error', message: 'Could not generate suggestions.' })
        }
      })
  })

  stt.on('error', err => {
    console.error('Google STT error:', err)
    send(ws, { type: 'error', message: 'Speech recognition error.' })
  })

  stt.start()

  ws.on('message', data => {
    if (Buffer.isBuffer(data)) stt.sendPcm(data)
  })

  ws.on('close', () => {
    console.log('glasses disconnected')
    stt.stop()
  })
})

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload))
}
