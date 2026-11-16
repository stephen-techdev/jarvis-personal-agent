# Personal-agent landscape → what Jarvis adopted

Before building, we surveyed the most-starred personal AI assistant / companion repositories on GitHub (November 2026) and extracted the patterns worth adopting. We did **not** copy code — we implemented the client-feasible ideas from scratch and queued the rest for the local backend phase.

## Repos analysed

| Repository | Stars | Core idea | Adopted in Jarvis |
|---|---:|---|---|
| `zhayujie/CowAgent` | 47.9k | Personal assistant harness with skills, tool planning | Local command router (notes, reminders, research, vision) + tool-ready architecture |
| `agentscope-ai/QwenPaw` | 37.8k | Self-hosted personal assistant, deploy anywhere | Zero-backend PWA; same UI on desktop + phone |
| `zeroclaw-labs/zeroclaw` | 33.4k | Lightweight, autonomous assistant infrastructure | Single static bundle, free hosting, no server |
| `leon-ai/leon` | 17.7k | Open-source assistant with skills and wake words | Quick-action intents; wake word queued (Phase 7) |
| `elie222/inbox-zero` | 13k | Personal email assistant | Not adopted (needs OAuth backend); future connector |
| `ThinkInAIXYZ/deepchat` | 6.4k | Connects AI to your personal world | Persistent personal memory + local notes |
| `the-open-agent/openagent` | 5.7k | RAG + agent loops | Conversation summaries + memory retrieval |
| `Mirix-AI/MIRIX` | 3.5k | Tracks on-screen activity to answer questions | Screen-capture vision ("look at my screen") |
| `isair/jarvis` | 2.3k | Private local desktop assistant, voice + memory | Voice-first UI, TTS streaming, memory panel |
| `morettt/my-neuro` | 1.5k | Desktop companion with avatar and voice | Animated orb + persona layer |
| `AionsHome` | 1k | Self-hosted companion with long-term memory | Facts + rolling summaries (light MemGPT pattern) |
| `OpenAmika` | 0.7k | Live2D avatar, real-time voice companion | Future avatar mode (local backend) |

Ecosystem references that informed the roadmap: **Letta/MemGPT** (tiered memory), **Open Interpreter** and **OpenHands** (agentic execution), **Pipecat** and **LiveKit Agents** (real-time voice pipelines).

## Feature decisions

### Shipped in this PWA
- **Keyless operation** — a Supabase Edge Function relay holds one OpenRouter key server-side and forwards only free `:free` models; visitors never see or paste a key.
- **Runtime model discovery** — the live free catalog is fetched from OpenRouter, cached for an hour, with a bundled static list as offline fallback.
- **Automatic model queue** — your preferred model first, alternatives shuffled behind it, 90-second cooldowns for failures, and Pollinations as the final keyless fallback.
- **Seamless mid-answer continuation** — when a provider cuts a stream at its limit, the partial reply is passed to the next model with a continue instruction instead of restarting the conversation.
- **Voice I/O** — push-to-talk speech recognition + sentence-streamed TTS with barge-in, in **30 languages**. Tamil is the default; one switch drives the microphone, the written answer and the spoken voice. Device voices are preferred, with the free `jarvis-tts` relay covering languages the device lacks.
- **Self-updating PWA** — each build emits `version.json` with a build id; the open app checks after load, every five minutes and when the tab regains focus, then reloads itself when idle. No manual reinstall.
- **Vision** — screen share, camera capture, image upload → free OpenRouter vision model, no key.
- **Free research** — DuckDuckGo + page excerpts, cited sources under each answer.
- **Personal memory** — manual facts, auto-extracted facts every 4 turns keyed / 8 turns on the relay, notes, reminders, rolling summaries, export/import.
- **Persona** — named assistant (Jarvis), configurable user name and voice; replies in the selected language with a calm, precise tone.
- **Installable PWA** — laptop, Android, iPhone (Add to Home Screen).

### Deliberately deferred (requires a backend / native capabilities)
- Shell, file system and app control.
- OpenCode execution sessions with permission gates.
- Offline Whisper + Kokoro + Ollama.
- Wake-word detection while the app is closed.
- Proactive notifications beyond reminders.

These are mapped to Phases 2–7 in the roadmap, with the architecture already designed for them.

## Design principles carried over

1. **Local-first privacy** — memory stays on the user's device; the relay never stores chats and secrets stay server-side.
2. **Free-by-default** — no paid API required anywhere.
3. **Graceful degradation** — free models fail; the chain keeps working.
4. **Explicit consent for senses** — screen/camera only on user action.
5. **Personality is a product feature** — consistent voice, name and tone.
