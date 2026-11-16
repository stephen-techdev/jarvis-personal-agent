# J.A.R.V.I.S — Personal AI Agent (PWA)

Your own personal AI companion: **talk to it, show it your screen or camera, make it remember you, and let it research the web — free, in any browser.**

This is the cross-device web client of the Jarvis project. It runs entirely in the browser as an installable PWA: no server, no database, no paid keys. It calls OpenRouter's **free model tier** directly with a key that you paste once and that never leaves your device.

## Live demo

> Deployed at: **https://stephen862k7-byte.github.io/jarvis-personal-agent/** *(update if the repo name changes)*

1. Open the link on laptop or phone.
2. Get a free key at [openrouter.ai/keys](https://openrouter.ai/keys) (no card needed for free models).
3. Paste it in Settings. Install the app from the browser menu if you like.

## What it does

| Capability | Implementation |
|---|---|
| **Voice conversation** | Browser speech recognition → free model → streamed text-to-speech (barge-in supported) |
| **Sees what you see** | Screen share (`getDisplayMedia`), camera (`getUserMedia`), or image upload → free vision model |
| **Free web research** | DuckDuckGo results + page excerpts via the Jina reader proxy, answers with cited sources |
| **Long-term memory** | Local facts, notes, reminders and conversation summaries; automatic fact extraction every few turns |
| **Reminders** | "Remind me in 10 minutes to stretch" → timer + notification + spoken reminder |
| **Notes** | "Note: buy coffee beans" → stored and shown in the Memory panel |
| **Multi-device** | Installable PWA — same brain (your key + memory) in every browser you set it up in |
| **Fallback chain** | If a free model is rate-limited, it silently moves to the next free model |

## Why it is free

- **Models:** OpenRouter's free tier (14 free models at the time of writing, including vision models).
- **Voice:** the browser's built-in speech recognition and speech synthesis.
- **Research:** DuckDuckGo + the free Jina reader proxy.
- **Hosting:** GitHub Pages (static).
- **Storage:** browser `localStorage` — no backend costs.

## Quick start (local development)

```bash
cd app
npm install
npm run dev
```

Then open the printed URL, paste your free OpenRouter key in Settings, and talk.

Build for production:

```bash
npm run build   # outputs app/dist
```

## Architecture

```
┌──────────────────────────── Browser (PWA) ────────────────────────────┐
│  React + TypeScript UI                                                │
│  ├─ chat + markdown + sources                                         │
│  ├─ voice: SpeechRecognition → SpeechSynthesis                        │
│  ├─ vision: getUserMedia / getDisplayMedia → JPEG (≤1280px)           │
│  ├─ memory: localStorage (facts, notes, reminders, summary)           │
│  └─ research: r.jina.ai → DuckDuckGo → page excerpts                  │
└──────────────────────────────┬────────────────────────────────────────┘
                               │ direct HTTPS (CORS)
                     ┌─────────▼─────────┐
                     │    OpenRouter      │
                     │  free model pool   │
                     └───────────────────┘
```

No backend is required for this deployment. The **local backend phase** (see roadmap) adds FastAPI + Whisper + Kokoro + OpenCode for computer control, offline use and private Tailscale access.

## Privacy & security

- Your API key is stored **only** in this browser's `localStorage` and sent **only** to OpenRouter.
- Conversations, facts, notes and reminders never leave the browser.
- Images are downscaled and sent only when you explicitly attach/share them.
- The deployed site has no analytics, no tracking, no database.
- Use **Export memory** to back up your data; **Clear memory** wipes everything.
- Never commit an API key. This repo contains none.

## Honest limitations of this build

- It is a **client**, not a computer-controlling agent. It cannot run files, shell commands or OpenCode yet — that is the local backend phase.
- Free models are rate-limited and sometimes unavailable; the fallback chain mitigates but cannot eliminate this.
- Browser speech recognition works best in Chrome/Edge; Firefox support varies.
- Screen sharing is unavailable on mobile browsers; the camera works everywhere HTTPS is available.
- Memory is per-browser; it is not synced across devices unless you export/import.

## Roadmap (from the architecture plan)

- **Phase 0–1:** ✅ PWA brain, memory, research, voice, vision
- **Phase 2:** Local FastAPI backend — Whisper STT + Kokoro TTS, fully offline voice
- **Phase 3:** Ollama fallback for offline chat and privacy mode
- **Phase 4:** OpenCode SDK executor — real coding tasks with permission gates
- **Phase 5:** Companion layer — proactive briefings, deeper memory consolidation
- **Phase 6:** Tailscale + laptop hosting — private access from every device
- **Phase 7:** Wake word, browser automation, computer interaction

See [FEATURES.md](FEATURES.md) for the open-source personal-agent analysis that shaped this build.

## Tech stack

React 19 · TypeScript · Vite 7 · OpenRouter (free tier) · Web Speech API · MediaDevices · DuckDuckGo + Jina Reader · GitHub Pages + Actions.

## License

MIT — see [LICENSE](LICENSE).
