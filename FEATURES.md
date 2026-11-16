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
- **Voice I/O** — browser speech recognition + sentence-streamed TTS with barge-in.
- **Vision** — screen share, camera capture, image upload → free vision model.
- **Free research** — DuckDuckGo + page excerpts, cited sources under each answer.
- **Personal memory** — manual facts, auto-extracted facts every 4 user turns, notes, reminders, rolling summaries, export/import.
- **Persona** — named assistant (Jarvis), configurable user name and voice.
- **Resilience** — model fallback chain for free-tier rate limits.
- **Installable PWA** — laptop, Android, iPhone (Add to Home Screen).

### Deliberately deferred (requires a backend / native capabilities)
- Shell, file system and app control.
- OpenCode execution sessions with permission gates.
- Offline Whisper + Kokoro + Ollama.
- Wake-word detection while the app is closed.
- Proactive notifications beyond reminders.

These are mapped to Phases 2–7 in the roadmap, with the architecture already designed for them.

## Design principles carried over

1. **Local-first privacy** — memory and keys stay on the user's device.
2. **Free-by-default** — no paid API required anywhere.
3. **Graceful degradation** — free models fail; the chain keeps working.
4. **Explicit consent for senses** — screen/camera only on user action.
5. **Personality is a product feature** — consistent voice, name and tone.
