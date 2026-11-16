import { TTS_URL } from './config'

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

export interface VoiceSettings {
  voiceURI: string
  rate: number
  pitch: number
  language: string
}

export function allVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported) return []
  return window.speechSynthesis.getVoices()
}

function baseLanguage(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0]
}

/** Exact-language voices first, then other regional variants of the same language. */
export function voicesForLanguage(language: string, voices: SpeechSynthesisVoice[] = allVoices()): SpeechSynthesisVoice[] {
  const code = language.toLowerCase()
  const base = baseLanguage(code)
  const exact = voices.filter((voice) => voice.lang.toLowerCase().replace('_', '-') === code)
  const related = voices.filter((voice) => baseLanguage(voice.lang) === base && !exact.includes(voice))
  return [...exact, ...related]
}

export function hasVoiceFor(language: string, voices: SpeechSynthesisVoice[] = allVoices()): boolean {
  return voicesForLanguage(language, voices).length > 0
}

function pickVoice(language: string, preferredURI: string, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const matching = voicesForLanguage(language, voices)
  if (preferredURI) {
    const exact = matching.find((voice) => voice.voiceURI === preferredURI)
    if (exact) return exact
  }
  const exact = matching.find((voice) => voice.lang.toLowerCase().replace('_', '-') === language.toLowerCase())
  return exact ?? matching[0]
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\d+\]/g, '')
    .replace(/[*_#>`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/* ---------- relay voice (used when the device has no voice for a language) ---------- */

interface RemoteItem {
  text: string
  lang: string
  onDone?: () => void
}

const remoteQueue: RemoteItem[] = []
let remotePlaying = false
let remoteController: AbortController | null = null
let remoteAudio: HTMLAudioElement | null = null

export function remoteSpeechAvailable(): boolean {
  return TTS_URL.length > 0
}

function chunkText(text: string, max = 180): string[] {
  if (text.length <= max) return [text]
  const sentences = text.split(/(?<=[.!?।])\s+/)
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (sentence.length > max) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      for (let i = 0; i < sentence.length; i += max) chunks.push(sentence.slice(i, i + max))
      continue
    }
    if ((current + ' ' + sentence).trim().length > max) {
      if (current) chunks.push(current)
      current = sentence
    } else {
      current = `${current} ${sentence}`.trim()
    }
  }
  if (current) chunks.push(current)
  return chunks.filter(Boolean)
}

async function playRemoteChunk(text: string, lang: string, signal: AbortSignal): Promise<void> {
  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang }),
    signal,
  })
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}`)
  const blob = await res.blob()
  if (signal.aborted) return
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  remoteAudio = audio
  try {
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('TTS playback failed'))
      signal.addEventListener('abort', () => {
        audio.pause()
        resolve()
      }, { once: true })
      void audio.play().catch(reject)
    })
  } finally {
    URL.revokeObjectURL(url)
    if (remoteAudio === audio) remoteAudio = null
  }
}

async function pumpRemote(): Promise<void> {
  if (remotePlaying) return
  remotePlaying = true
  while (remoteQueue.length > 0) {
    const item = remoteQueue.shift()!
    const controller = new AbortController()
    remoteController = controller
    try {
      for (const chunk of chunkText(item.text)) {
        if (controller.signal.aborted) break
        await playRemoteChunk(chunk, item.lang, controller.signal)
      }
    } catch {
      /* the written answer still stands if audio fails */
    }
    if (remoteController === controller) remoteController = null
    item.onDone?.()
  }
  remotePlaying = false
}

function speakRemote(text: string, lang: string, onDone?: () => void): void {
  remoteQueue.push({ text, lang, onDone })
  void pumpRemote()
}

export function speak(text: string, settings: VoiceSettings, onDone?: () => void): void {
  const cleaned = cleanForSpeech(text)
  if (!cleaned) {
    onDone?.()
    return
  }
  const voices = allVoices()
  const matching = voicesForLanguage(settings.language, voices)
  if (matching.length > 0) {
    const utterance = new SpeechSynthesisUtterance(cleaned)
    const voice = pickVoice(settings.language, settings.voiceURI, voices)
    if (voice) utterance.voice = voice
    utterance.lang = settings.language
    utterance.rate = settings.rate
    utterance.pitch = settings.pitch
    if (onDone) utterance.onend = () => onDone()
    if (onDone) utterance.onerror = () => onDone()
    window.speechSynthesis.speak(utterance)
    return
  }
  if (TTS_URL) {
    speakRemote(cleaned, settings.language, onDone)
    return
  }
  onDone?.()
}

export function stopSpeaking(): void {
  if (speechSupported) window.speechSynthesis.cancel()
  remoteQueue.length = 0
  remoteController?.abort()
  remoteController = null
  if (remoteAudio) {
    remoteAudio.pause()
    remoteAudio = null
  }
}

export function splitSentences(buffer: string, flush = false): { sentences: string[]; rest: string } {
  if (!buffer.trim()) return { sentences: [], rest: '' }
  const parts = buffer.split(/(?<=[.!?।])\s+/)
  if (flush) return { sentences: parts.map((p) => p.trim()).filter(Boolean), rest: '' }
  const rest = parts.pop() ?? ''
  return { sentences: parts.map((p) => p.trim()).filter((p) => p.length > 3), rest }
}

export interface RecognitionHandlers {
  onInterim?: (text: string) => void
  onFinal: (text: string) => void
  onError?: (message: string) => void
  onEnd?: () => void
}

export interface RecognitionLike {
  start: () => void
  stop: () => void
  abort: () => void
}

export function recognizerSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as Record<string, unknown>
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function createRecognizer(lang: string, handlers: RecognitionHandlers): RecognitionLike | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => any) | undefined
  if (!Ctor) return null
  const rec = new Ctor()
  rec.lang = lang
  rec.continuous = false
  rec.interimResults = true
  rec.maxAlternatives = 1
  rec.onresult = (event: any) => {
    let interim = ''
    let final = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const transcript = result[0]?.transcript ?? ''
      if (result.isFinal) final += transcript
      else interim += transcript
    }
    if (interim) handlers.onInterim?.(interim)
    if (final.trim()) handlers.onFinal(final.trim())
  }
  rec.onerror = (event: any) => {
    const code = event?.error ?? 'unknown'
    const message =
      code === 'not-allowed' || code === 'service-not-allowed'
        ? 'Microphone permission denied. Allow mic access in the browser.'
        : code === 'no-speech'
          ? 'I did not catch that. Try again.'
          : code === 'language-not-supported'
            ? 'This browser does not support the selected microphone language.'
            : `Speech recognition error: ${code}`
    handlers.onError?.(message)
  }
  rec.onend = () => handlers.onEnd?.()
  return {
    start: () => rec.start(),
    stop: () => rec.stop(),
    abort: () => rec.abort(),
  }
}
