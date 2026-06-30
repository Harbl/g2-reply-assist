# G2 Reply Assist

A custom Even Realities G2 app for real-time Japanese conversation help.
Separate from the G2's built-in live-translation feature — this is for the
other direction: when you don't know how to *reply*.

While someone speaks Japanese to you, the glasses show 3 short, natural,
casual-polite reply suggestions in Japanese, each with romaji and a brief
English gloss, so you can read the romaji aloud and respond directly
without your phone speaking for you. Suggestions clear automatically the
moment either of you starts speaking again, so nothing hangs on screen
past its relevance.

## How it fits together

```
G2 glasses (glasses-app)  <--WebSocket-->  Node backend (backend)  -->  Google Cloud Speech-to-Text (ja-JP)
                                                                    -->  Claude (reply suggestions)
```

- **[`glasses-app/`](./glasses-app)** — the G2 app itself. Captures mic
  audio, displays the live transcript and paginated suggestion cards on
  the 576x288 display, handles swipe/double-tap input. Holds no API
  credentials.
- **[`backend/`](./backend)** — a small Node WebSocket server. Streams mic
  audio to Google Speech-to-Text, asks Claude for reply suggestions on
  each finalized utterance, and relays results back to the glasses. Holds
  all API credentials.

## Quick start

Run both pieces on the same machine/network during development:

```bash
# Terminal 1
cd backend
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY + GOOGLE_APPLICATION_CREDENTIALS
npm run dev

# Terminal 2
cd glasses-app
npm install
cp .env.example .env.local   # set VITE_BACKEND_URL to ws://<your-LAN-IP>:8787
npm run dev
npm run simulate   # or load on physical glasses
```

See each subproject's README for full setup details.
