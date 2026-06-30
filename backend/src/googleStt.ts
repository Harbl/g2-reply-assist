import { EventEmitter } from 'node:events'
import { SpeechClient, protos } from '@google-cloud/speech'

type StreamingRecognizeRequest = protos.google.cloud.speech.v1.IStreamingRecognizeRequest

const client = new SpeechClient()

// Google closes a streamingRecognize call after ~5 minutes regardless of
// activity. For a long-running conversation, restart() is called proactively
// before that limit so audio in flight is never silently dropped.
const MAX_STREAM_MS = 4 * 60 * 1000 + 30 * 1000

export declare interface GoogleSttSession {
  on(event: 'final', listener: (text: string) => void): this
  on(event: 'interim', listener: (text: string) => void): this
  on(event: 'error', listener: (err: Error) => void): this
}

export class GoogleSttSession extends EventEmitter {
  private stream: ReturnType<SpeechClient['streamingRecognize']> | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private stopped = false

  start() {
    this.stopped = false
    this.openStream()
  }

  private openStream() {
    const request: StreamingRecognizeRequest = {
      streamingConfig: {
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: 'ja-JP',
          enableAutomaticPunctuation: true,
        },
        interimResults: true,
      },
    }

    this.stream = client
      .streamingRecognize()
      .on('error', err => this.emit('error', err as Error))
      .on('data', (data: protos.google.cloud.speech.v1.StreamingRecognizeResponse) => {
        const result = data.results?.[0]
        const transcript = result?.alternatives?.[0]?.transcript ?? ''
        if (!transcript) return
        if (result?.isFinal) {
          this.emit('final', transcript)
        } else {
          this.emit('interim', transcript)
        }
      })

    this.stream.write(request)

    this.restartTimer = setTimeout(() => {
      if (this.stopped) return
      this.stream?.end()
      this.openStream()
    }, MAX_STREAM_MS)
  }

  sendPcm(chunk: Buffer) {
    this.stream?.write({ audioContent: chunk })
  }

  stop() {
    this.stopped = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.stream?.end()
    this.stream = null
  }
}
