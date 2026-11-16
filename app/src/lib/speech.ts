export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

export interface VoiceSettings {
  voiceURI: string
  rate: number
  pitch: number
}

export function englishVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported) return []
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
}

function pickVoice(voices: SpeechSynthesisVoice[], preferredURI: string): SpeechSynthesisVoice | undefined {
  if (preferredURI) {
    const exact = voices.find((v) => v.voiceURI === preferredURI)
    if (exact) return exact
  }
  const preferredNames = ['Google UK English Male', 'Microsoft Ryan', 'Microsoft Guy', 'Daniel', 'Alex', 'Google US English']
  for (const name of preferredNames) {
    const hit = voices.find((v) => v.name.includes(name))
    if (hit) return hit
  }
  return voices.find((v) => v.lang === 'en-GB') ?? voices.find((v) => v.lang === 'en-IN') ?? voices[0]
}

export function speak(text: string, settings: VoiceSettings, onDone?: () => void): void {
  if (!speechSupported || !text.trim()) {
    onDone?.()
    return
  }
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(englishVoices(), settings.voiceURI)
  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  }
  utterance.rate = settings.rate
  utterance.pitch = settings.pitch
  if (onDone) utterance.onend = () => onDone()
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if (speechSupported) window.speechSynthesis.cancel()
}

export function splitSentences(buffer: string, flush = false): { sentences: string[]; rest: string } {
  if (!buffer.trim()) return { sentences: [], rest: '' }
  const parts = buffer.split(/(?<=[.!?])\s+/)
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
