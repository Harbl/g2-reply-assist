import { EventEmitter } from 'node:events'

const SAMPLE_RATE = 16_000
const BYTES_PER_SAMPLE = 2

const SPEECH_THRESHOLD_RMS = 600  // tune up if background noise trips it
const SILENCE_DURATION_MS = 1_200
const MIN_SPEECH_MS = 350
const MAX_UTTERANCE_MS = 30_000

const WHISPER_URL = process.env.WHISPER_URL ?? 'http://localhost:8000'
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? 'Systran/faster-whisper-large-v3'

function rmsOfChunk(pcm: Buffer): number {
  const samples = Math.floor(pcm.length / BYTES_PER_SAMPLE)
  if (samples === 0) return 0
  let sum = 0
  for (let i = 0; i < samples * 2; i += 2) {
    const s = pcm.readInt16LE(i)
    sum += s * s
  }
  return Math.sqrt(sum / samples)
}

function buildWav(pcm: Buffer): Buffer {
  const header = Buffer.allocUnsafe(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)   // PCM
  header.writeUInt16LE(1, 22)   // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28)
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32)
  header.writeUInt16LE(16, 34)  // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

type VadState = 'idle' | 'speaking' | 'silence_wait'

export class LocalSttSession extends EventEmitter {
  private state: VadState = 'idle'
  private speechBuffers: Buffer[] = []
  private speechStartMs = 0
  private silenceTimer: NodeJS.Timeout | null = null
  private maxTimer: NodeJS.Timeout | null = null
  private stopped = false

  start() {
    this.stopped = false
    this.reset()
  }

  sendPcm(chunk: Buffer) {
    if (this.stopped) return
    const energy = rmsOfChunk(chunk)

    switch (this.state) {
      case 'idle':
        if (energy > SPEECH_THRESHOLD_RMS) {
          this.state = 'speaking'
          this.speechStartMs = Date.now()
          this.speechBuffers = [chunk]
          this.maxTimer = setTimeout(() => this.endUtterance(), MAX_UTTERANCE_MS)
        }
        break

      case 'speaking':
        this.speechBuffers.push(chunk)
        if (energy < SPEECH_THRESHOLD_RMS) {
          this.state = 'silence_wait'
          this.silenceTimer = setTimeout(() => this.endUtterance(), SILENCE_DURATION_MS)
        }
        break

      case 'silence_wait':
        this.speechBuffers.push(chunk)
        if (energy > SPEECH_THRESHOLD_RMS) {
          this.state = 'speaking'
          if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null }
        }
        break
    }
  }

  private endUtterance() {
    const durationMs = Date.now() - this.speechStartMs
    const pcm = Buffer.concat(this.speechBuffers)
    this.reset()

    if (durationMs < MIN_SPEECH_MS || pcm.length === 0) return

    this.transcribe(pcm).catch(err => this.emit('error', err as Error))
  }

  private async transcribe(pcm: Buffer) {
    const wav = buildWav(pcm)
    const form = new FormData()
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'audio.wav')
    form.append('model', WHISPER_MODEL)
    form.append('language', 'ja')
    form.append('response_format', 'json')

    const res = await fetch(`${WHISPER_URL}/v1/audio/transcriptions`, {
      method: 'POST',
      body: form,
    })

    if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`)

    const data = (await res.json()) as { text?: string }
    const transcript = data.text?.trim()
    // Ignore results that are only punctuation / noise tokens
    if (transcript && /\p{L}/u.test(transcript)) {
      this.emit('final', transcript)
    }
  }

  stop() {
    this.stopped = true
    this.reset()
  }

  private reset() {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null }
    if (this.maxTimer) { clearTimeout(this.maxTimer); this.maxTimer = null }
    this.speechBuffers = []
    this.state = 'idle'
  }
}
