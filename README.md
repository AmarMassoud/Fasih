# فصيح (Fasih)

A tiny, standalone Next.js app that converts spoken or typed **Arabic dialect** (Egyptian, Gulf, Levantine, Iraqi, Maghrebi, ...) into **Modern Standard Arabic (فصحى)** - with voice input, voice output, and a saved conversation history. Clean monochrome dark/light UI, RTL Arabic interface.


## How it stays free

| Piece | What's used | Cost |
|---|---|---|
| Speech input (dialect) | Browser Web Speech API (`SpeechRecognition`) | Free, built into Chrome/Edge |
| Dialect → Fus7a conversion | Gemini `gemini-2.5-flash-lite` via the Google AI Studio **free tier** | Free tier (generous daily quota) |
| Speech output (fus7a) | Gemini native TTS (`gemini-2.5-flash-preview-tts`, free tier) | Free tier |
| TTS fallback | Browser `speechSynthesis` (used automatically if the API key is missing or the quota runs out) | Free, on-device |
| Conversation history | `localStorage` (last 100 exchanges) | Free, stays in your browser |

One single **free** API key covers both the text model and the TTS model.

## Setup (Mac)

Requires Node 18.18+ (`brew install node` or via nvm: `nvm install --lts`).

```bash
git clone https://github.com/AmarMassoud/fasih.git
cd fasih
npm install
cp .env.example .env.local   # then paste your key
npm run dev
```

Get a free key at <https://aistudio.google.com/apikey> and set it in `.env.local`:

```
GEMINI_API_KEY=your-key-here
```

Open <http://localhost:3000>. The app still works without a key - conversion will show a setup hint, and playback falls back to the browser's own Arabic voice.

### Using it from other devices on your network

`npm run dev` (and `npm run start`) already bind to `0.0.0.0`, so the app is reachable across your LAN. Find your Mac's IP:

```bash
ipconfig getifaddr en0
```

Then open `http://<that-ip>:3000` from any phone/laptop on the same Wi-Fi.

> **Heads-up on the mic over the network:** browsers only allow microphone access on `localhost` or HTTPS. On other devices over plain `http://<ip>:3000`, typing, conversion, and playback all work, but the mic button won't - that's a browser security rule, not a bug. (On Chrome you can allowlist the address at `chrome://flags/#unsafely-treat-insecure-origin-as-secure` for testing.)

## Usage

1. Optionally pick your dialect (helps both speech recognition and the model) - or leave it on auto.
2. Tap the mic and speak, or just type. Press Enter or «حوّل إلى الفصحى».
3. The fus7a version appears in the history - tap «استمع» to hear it, «نسخ» to copy it.
4. History persists across visits (browser-local only); «مسح السجل» clears it.

## Configuration (optional)

| Env var | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | - | Required for conversion + server TTS |
| `GEMINI_TEXT_MODEL` | `gemini-2.5-flash-lite` | Any Gemini text model |
| `GEMINI_TTS_MODEL` | `gemini-2.5-flash-preview-tts` | Any Gemini TTS model |
| `GEMINI_TTS_VOICE` | `Charon` | Any Gemini prebuilt voice (e.g. `Kore`, `Zephyr`) |

## Notes

- Voice input requires a browser that implements the Web Speech API (Chrome, Edge, Safari 14.1+). Firefox users can type instead.
- Gemini TTS returns raw 24 kHz PCM; the `/api/tts` route wraps it in a WAV header so the browser can play it.
- Nothing is stored server-side: no database, no accounts, no logging of conversations.
