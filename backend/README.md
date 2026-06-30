# G2 Reply Assist — Backend

A small Node WebSocket server that sits between the [glasses app](../glasses-app)
and two external APIs:

- **Google Cloud Speech-to-Text** (streaming, `ja-JP`) — turns mic audio
  into Japanese transcript text.
- **Claude** — given a finalized Japanese utterance, generates 3 short,
  casual-polite reply suggestions with romaji and an English gloss.

All API credentials live here, never on the glasses. The glasses app only
ever sees raw PCM going out and JSON messages coming back.

## Setup

1. Create a Google Cloud service account with Speech-to-Text API access and
   download its JSON key. See
   https://cloud.google.com/speech-to-text/docs/before-you-begin
2. Get an Anthropic API key.
3. Install dependencies and configure env:

   ```bash
   npm install
   cp .env.example .env
   ```

   Fill in `.env`:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
   PORT=8787
   ```

   Place the downloaded service account JSON at the path you set above
   (e.g. `./service-account.json` in this directory). Both the key file
   and `.env` are gitignored — never commit them.

## Run

```bash
npm run dev    # tsx watch — restarts on file changes
npm start      # one-shot run
```

The server listens on `ws://0.0.0.0:<PORT>` (default `8787`). Point the
glasses app's `VITE_BACKEND_URL` at this address using your machine's LAN
IP, e.g. `ws://192.168.1.50:8787`.

## Protocol

The glasses app sends raw binary WebSocket frames — each frame is a chunk
of PCM s16le, 16kHz, mono audio straight from the mic.

The server sends JSON text frames:

| `type` | Fields | When |
|---|---|---|
| `transcript` | `finalText`, `interimText`, `finished` | Live transcript updates while Google STT is processing. |
| `listening` | — | Sent the instant any utterance finalizes, before suggestions are generated — resets the glasses display so stale suggestions never linger. |
| `suggestions` | `heard`, `options: {japanese, romaji, gloss}[]` | 3 reply suggestions for the most recently heard utterance. |
| `error` | `message` | STT or suggestion generation failed. |

## Notes

- Google's streaming STT sessions auto-close after ~5 minutes; the server
  proactively restarts the stream before that limit so the connection
  never drops mid-session (see `src/googleStt.ts`).
- Reply suggestions use forced tool-use against Claude to get reliable
  structured JSON output (see `src/suggest.ts`).
- A monotonic utterance ID guards against race conditions where an older,
  slower Claude response could otherwise overwrite a newer one if two
  utterances were generated in close succession.
