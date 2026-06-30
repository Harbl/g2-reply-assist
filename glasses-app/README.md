# G2 Reply Assist — Glasses App

The Even Realities G2 app half of this project. Captures mic audio and
displays reply suggestions on the glasses. It does **not** talk to Google
Speech-to-Text or Claude directly — all of that happens in [`/backend`](../backend),
which this app connects to over a WebSocket.

## How it works

1. On launch, the app requests mic access and a 576x288 full-screen text
   container (used both for display and for capturing swipe/tap events).
2. Raw PCM audio frames from the glasses mic are forwarded straight to the
   backend over WebSocket as they arrive.
3. The backend streams that audio to Google Cloud Speech-to-Text and pushes
   back transcript updates, which are shown live on the glasses while
   listening.
4. When an utterance finalizes, the backend asks Claude for 3 short reply
   suggestions (Japanese + romaji + English gloss) and pushes them down.
   The display switches to a paginated suggestion card — swipe up/down to
   cycle through the 3 options.
5. The instant any new utterance starts finalizing (yours or the other
   person's), the backend resets the display back to "Listening…" so
   suggestions never hang around once the moment has passed.
6. Double-tap the temple to exit; this shuts down the mic and closes the
   backend connection cleanly.

## Setup

```bash
npm install
cp .env.example .env.local
```

Set `VITE_BACKEND_URL` in `.env.local` to the WebSocket address of your
running backend (see `/backend`'s README), e.g.:

```
VITE_BACKEND_URL=ws://192.168.1.50:8787
```

During development, point this at your machine's LAN IP so the physical
glasses can reach it.

Before shipping, also update the `network.whitelist` entries in
[`app.json`](./app.json) to match your real backend host.

## Run

```bash
npm run dev        # Vite dev server (companion debug UI in a browser tab)
npm run simulate    # Even Hub simulator, pointed at the dev server
```

`npm run build` typechecks and produces a production bundle; `npm run pack`
packages the app via the Even Hub CLI.

## What's in here

| File | Purpose |
|---|---|
| `src/main.ts` | App entry. Creates the text container, starts the mic, forwards PCM to the backend, drives the listening/suggestions state machine, handles swipe pagination and double-tap exit. |
| `src/asr/stt.ts` | `connectBackend()` — thin WebSocket client for the Node backend. Sends raw PCM, receives `transcript` / `listening` / `suggestions` / `error` messages. |
| `src/ui.ts` | Companion-app debug UI — status chip, live transcript mirror, suggestion cards, dark theme. |
| `index.html` | WebView host with zoom-locked viewport. |
| `app.json` | Manifest with `g2-microphone` and `network` permissions. |
| `.env.example` | `VITE_BACKEND_URL=` placeholder. |

## G2 specifics

- Mic format: PCM s16le, 16 kHz, mono. Delivered via `event.audioEvent.audioPcm` as `Uint8Array`.
- Glasses render is debounced to 120 ms — the BLE queue can't keep up with per-token writes.
- Swipe up/down (`SCROLL_TOP_EVENT` / `SCROLL_BOTTOM_EVENT`) cycles suggestion pages with wraparound.
- **Double-tap the temple** → `shutDownPageContainer(1)` → system exit confirmation dialog.
