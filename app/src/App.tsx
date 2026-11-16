import { useEffect, useMemo, useRef, useState } from 'react'
import type { Attachment, ChatMessage, Fact, Note, Reminder, Settings, Source, Status } from './types'
import { DEFAULT_FAST_MODEL, DEFAULT_MODEL, DEFAULT_VISION_MODEL } from './lib/models'
import { DEFAULT_LANGUAGE, LANGUAGES, languageName, languageShort } from './lib/languages'
import { load, save, uid } from './lib/storage'
import { buildSystemPrompt } from './lib/prompts'
import { streamWithFallback, type ChatMsg, type ContentPart, type QueueItem } from './lib/openrouter'
import { discoverModels, labelFor, resolveQueue, type ModelOption } from './lib/catalog'
import { DIRECT_KEY_MODE, PROXY_ENABLED } from './lib/config'
import { extractFacts, mergeFacts, summarizeConversation } from './lib/memory'
import { research } from './lib/research'
import { allVoices, createRecognizer, recognizerSupported, speak, splitSentences, stopSpeaking, type RecognitionLike } from './lib/speech'
import { startAutoUpdate } from './lib/updater'
import { captureScreen, fileToAttachment, screenCaptureSupported } from './lib/vision'
import { Markdown } from './components/Markdown'
import { Orb } from './components/Orb'
import { CameraModal } from './components/CameraModal'
import { MemoryPanel, SettingsPanel } from './components/Panels'

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  chatModel: DEFAULT_MODEL,
  visionModel: DEFAULT_VISION_MODEL,
  fastModel: DEFAULT_FAST_MODEL,
  userName: '',
  assistantName: 'Jarvis',
  voiceURI: '',
  rate: 1.02,
  pitch: 0.95,
  autoMemory: true,
  language: DEFAULT_LANGUAGE,
}

const RESEARCH_RE = /^(search|look up|lookup|google|research|find out|browse)\b[\s:,-]*(.*)$/i

const STATUS_TEXT: Record<Status, string> = {
  idle: 'online',
  listening: 'listening',
  thinking: 'processing',
  speaking: 'speaking',
}

function friendlyError(error: unknown): string {
  const status = (error as { status?: number })?.status
  const text = error instanceof Error ? error.message : String(error)
  if (status === 401)
    return PROXY_ENABLED
      ? 'The free relay is unavailable right now. Try again in a moment.'
      : 'Your OpenRouter key was rejected. Remove it in Settings to keep using free public mode.'
  if (status === 402)
    return PROXY_ENABLED
      ? 'The free relay has no quota left right now. Try again later.'
      : 'This OpenRouter key has no free-model quota. Remove it in Settings to keep using free public mode.'
  if (status === 429) return 'Every free model is busy right now. Give it a minute and send again — limits are shared across all free models.'
  if (status && status >= 500) return 'The model provider is having trouble. Try again in a moment.'
  if (text.includes('Failed to fetch')) return 'Network error. Check your connection and try again.'
  return `Something went wrong: ${text.slice(0, 240)}`
}

/** Old builds saved defaults that no longer work well (reasoning-only fast model, vision model without image endpoints). */
function migrateSettings(stored: Partial<Settings>): Partial<Settings> {
  const next = { ...stored }
  if (next.fastModel === 'nvidia/nemotron-3.5-lightning:free') next.fastModel = DEFAULT_FAST_MODEL
  if (next.visionModel === 'nvidia/nemotron-3.5-super-vl:free') next.visionModel = DEFAULT_VISION_MODEL
  if (next.chatModel === 'thinkingmachines/inkling-2-small:free') next.chatModel = DEFAULT_MODEL
  return next
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...migrateSettings(load<Partial<Settings>>('settings', {})) }))
  const [messages, setMessages] = useState<ChatMessage[]>(() => load('messages', []))
  const [facts, setFacts] = useState<Fact[]>(() => load('facts', []))
  const [notes, setNotes] = useState<Note[]>(() => load('notes', []))
  const [reminders, setReminders] = useState<Reminder[]>(() => load('reminders', []))
  const [summary, setSummary] = useState<string>(() => load('summary', ''))
  const [ttsOn, setTtsOn] = useState<boolean>(() => load('tts', true))
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [activeModel, setActiveModel] = useState<QueueItem | null>(null)
  const [catalog, setCatalog] = useState<ModelOption[]>([])
  const [researchMode, setResearchMode] = useState(false)
  const [panel, setPanel] = useState<'none' | 'settings' | 'memory'>('none')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => allVoices())
  const [updateReady, setUpdateReady] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const recRef = useRef<RecognitionLike | null>(null)
  const toastTimer = useRef<number | null>(null)
  const factsRef = useRef(facts)
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => {})

  useEffect(() => save('settings', settings), [settings])
  useEffect(() => save('messages', messages.slice(-200)), [messages])
  useEffect(() => save('facts', facts), [facts])
  useEffect(() => save('notes', notes), [notes])
  useEffect(() => save('reminders', reminders), [reminders])
  useEffect(() => save('summary', summary), [summary])
  useEffect(() => save('tts', ttsOn), [ttsOn])
  useEffect(() => {
    factsRef.current = facts
  }, [facts])

  useEffect(() => {
    const controller = new AbortController()
    void discoverModels(controller.signal)
      .then((models) => setCatalog(models))
      .catch(() => {
        /* fall back to the bundled static catalog */
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const update = () => setVoices(allVoices())
    update()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener('voiceschanged', update)
    return () => {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.removeEventListener('voiceschanged', update)
    }
  }, [])

  useEffect(() => startAutoUpdate(() => setUpdateReady(true)), [])

  useEffect(() => {
    if (!updateReady || busy) return
    toast('New version installed — refreshing…')
    const timer = window.setTimeout(() => window.location.reload(), 1500)
    return () => window.clearTimeout(timer)
  }, [updateReady, busy])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: messages.length > 1 ? 'smooth' : 'auto' })
  }, [messages, busy])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  useEffect(() => {
    const check = () => {
      const now = Date.now()
      const due = reminders.filter((reminder) => !reminder.done && reminder.due <= now)
      if (due.length === 0) return
      setReminders((prev) => prev.map((reminder) => (due.some((d) => d.id === reminder.id) ? { ...reminder, done: true } : reminder)))
      for (const reminder of due) {
        toast(`Reminder: ${reminder.text}`)
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('Jarvis reminder', { body: reminder.text })
          } catch {
            /* ignore */
          }
        }
        if (ttsOn) speak(`Reminder: ${reminder.text}`, settings)
      }
    }
    check()
    const timer = window.setInterval(check, 15000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders, ttsOn, settings.voiceURI, settings.rate, settings.pitch])

  function toast(message: string) {
    setToastMsg(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 4200)
  }

  function addReminder(text: string, due: number): Reminder {
    const reminder: Reminder = { id: uid(), text, due, done: false }
    setReminders((prev) => [reminder, ...prev].slice(0, 60))
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
    return reminder
  }

  function speakReply(text: string, onDone?: () => void) {
    if (!ttsOn) {
      onDone?.()
      return
    }
    setStatus('speaking')
    speak(text, settings, () => {
      setStatus('idle')
      onDone?.()
    })
  }

  function addAssistant(content: string, extra?: Partial<ChatMessage>): ChatMessage {
    const message: ChatMessage = { id: uid(), role: 'assistant', content, ts: Date.now(), ...extra }
    setMessages((prev) => [...prev, message])
    if (!extra?.error) speakReply(content)
    return message
  }

  function handleLocalCommand(text: string): string | null {
    const cleaned = text.trim()

    const noteMatch = cleaned.match(/^(?:note(?: this)?|save (?:a )?note|make a note)[:\s]+([\s\S]+)$/i)
    if (noteMatch) {
      setNotes((prev) => [{ id: uid(), text: noteMatch[1].trim(), ts: Date.now() }, ...prev].slice(0, 100))
      return 'Noted, sir.'
    }

    const todoMatch = cleaned.match(/^remember to (.+)$/i)
    if (todoMatch) {
      setNotes((prev) => [{ id: uid(), text: todoMatch[1].trim(), ts: Date.now() }, ...prev].slice(0, 100))
      return 'Added to your notes.'
    }

    const rememberMatch = cleaned.match(/^remember (?:that )?(.+)$/i)
    if (rememberMatch) {
      const merged = mergeFacts(factsRef.current, [rememberMatch[1].trim()])
      setFacts(merged.facts)
      return merged.added > 0 ? 'I will remember that.' : 'I already know that one.'
    }

    if (/^(show|list|read)\s+(my\s+)?notes\b/i.test(cleaned)) {
      if (notes.length === 0) return 'You have no notes yet.'
      return `Your notes:\n${notes.map((note, index) => `${index + 1}. ${note.text}`).join('\n')}`
    }

    const remindIn = cleaned.match(/^remind me in (\d+)\s*(minute|min|hour|hr|day)s?\s+(?:to\s+)?(.+)$/i)
    if (remindIn) {
      const amount = Number(remindIn[1])
      const unit = remindIn[2].toLowerCase()
      const factor = unit.startsWith('min') ? 60_000 : unit.startsWith('h') ? 3_600_000 : 86_400_000
      const due = Date.now() + amount * factor
      const reminder = addReminder(remindIn[3].trim(), due)
      return `Reminder set for ${new Date(due).toLocaleTimeString()} — ${reminder.text}.`
    }

    const remindAt = cleaned.match(/^remind me to (.+?) at (\d{1,2}):(\d{2})\s*(am|pm)?$/i)
    if (remindAt) {
      let hour = Number(remindAt[2])
      const minute = Number(remindAt[3])
      const meridiem = remindAt[4]?.toLowerCase()
      if (meridiem === 'pm' && hour < 12) hour += 12
      if (meridiem === 'am' && hour === 12) hour = 0
      const now = new Date()
      const due = new Date(now)
      due.setHours(hour, minute, 0, 0)
      if (due.getTime() <= now.getTime()) due.setDate(due.getDate() + 1)
      addReminder(remindAt[1].trim(), due.getTime())
      return `Reminder set for ${due.toLocaleString()}.`
    }

    if (/^(show|list)\s+(my\s+)?reminders\b/i.test(cleaned)) {
      const open = reminders.filter((reminder) => !reminder.done)
      if (open.length === 0) return 'No active reminders.'
      return `Active reminders:\n${open.map((reminder) => `- ${reminder.text} · ${new Date(reminder.due).toLocaleString()}`).join('\n')}`
    }

    return null
  }

  async function sendMessage(override?: string) {
    if (busy) return
    const text = (override ?? input).trim()
    if (!text && !attachment) return

    if (DIRECT_KEY_MODE && !settings.apiKey) {
      setPanel('settings')
      toast('Add your free OpenRouter key to start chatting.')
      return
    }

    if (recRef.current) {
      recRef.current.abort()
      recRef.current = null
    }

    const currentAttachment = attachment
    setInput('')
    setAttachment(null)

    const userMessage: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      attachments: currentAttachment ? [currentAttachment] : undefined,
      ts: Date.now(),
    }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)

    const localReply = handleLocalCommand(text)
    if (localReply) {
      addAssistant(localReply)
      return
    }

    await runModel(nextMessages, currentAttachment)
  }

  useEffect(() => {
    sendRef.current = sendMessage
  })

  async function runModel(history: ChatMessage[], image: Attachment | null) {
    setBusy(true)
    setStatus('thinking')
    const controller = new AbortController()
    abortRef.current = controller
    const assistantId = uid()
    const placeholder: ChatMessage = { id: assistantId, role: 'assistant', content: '', ts: Date.now() }
    setMessages((prev) => [...prev, placeholder])

    const latest = history[history.length - 1]
    const needsVision = Boolean(image)
    const wantsResearch = researchMode || RESEARCH_RE.test(latest.content)
    setResearchMode(false)

    let extraContext = ''
    let sources: Source[] = []

    if (wantsResearch) {
      const match = latest.content.match(RESEARCH_RE)
      const query = match && match[2].trim().length > 2 ? match[2].trim() : latest.content
      try {
        const found = await research(query)
        sources = found.sources.map((source) => ({ title: source.title, url: source.url }))
        extraContext = `Web research context (fetched now). Use it and cite as [1], [2]…:\n\n${found.context}`
        if (sources.length === 0) toast('No web results found; answering from knowledge.')
      } catch {
        toast('Web research is unavailable right now.')
      }
    }

    const systemPrompt = buildSystemPrompt({
      assistantName: settings.assistantName,
      userName: settings.userName,
      facts,
      notes,
      summary,
      language: settings.language,
      extra: extraContext,
    })

    const apiMessages: ChatMsg[] = [{ role: 'system', content: systemPrompt }]
    for (const message of history.slice(0, -1).slice(-24)) {
      let content = message.content || (message.attachments?.length ? 'Shared an image earlier.' : '')
      if (message.attachments?.length) content += '\n[image shared earlier]'
      apiMessages.push({ role: message.role, content })
    }

    const parts: ContentPart[] = []
    if (latest.content) parts.push({ type: 'text', text: latest.content })
    if (image) parts.push({ type: 'image_url', image_url: { url: image.dataUrl } })
    const latestContent = parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts
    apiMessages.push({ role: 'user', content: latestContent })

    const queue = resolveQueue({
      models: catalog,
      primaryId: settings.chatModel,
      visionId: settings.visionModel,
      needsVision,
      hasKey: Boolean(settings.apiKey) || PROXY_ENABLED,
    })

    let accumulated = ''
    let spokenBuffer = ''
    let lastRender = 0
    let success = false

    const flushSpeech = (text: string) => {
      if (!ttsOn) return
      setStatus('speaking')
      speak(text, settings)
    }

    try {
      const used = await streamWithFallback({
        apiKey: settings.apiKey,
        queue,
        messages: apiMessages,
        signal: controller.signal,
        onModel: (item) => setActiveModel(item),
        onSwitch: (message) => toast(message),
        onToken: (token) => {
          accumulated += token
          if (ttsOn) {
            spokenBuffer += token
            const { sentences, rest } = splitSentences(spokenBuffer)
            spokenBuffer = rest
            for (const sentence of sentences) flushSpeech(sentence)
          }
          const now = performance.now()
          if (now - lastRender > 40) {
            lastRender = now
            setMessages((prev) => prev.map((message) => (message.id === assistantId ? { ...message, content: accumulated } : message)))
          }
        },
      })
      setActiveModel(used)
      const finalText = used.truncated
        ? `${accumulated}\n\n_— free-model limits reached, so this reply stopped early. Say “continue” and I will pick it up._`
        : accumulated
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: finalText, sources: sources.length > 0 ? sources : undefined }
            : message,
        ),
      )
      success = true
    } catch (error) {
      if (!controller.signal.aborted) {
        const friendly = friendlyError(error)
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? message.content
                ? { ...message, error: true }
                : { ...message, content: friendly, error: true }
              : message,
          ),
        )
        if (!accumulated) toast(friendly)
      }
    } finally {
      const aborted = controller.signal.aborted
      setBusy(false)
      abortRef.current = null

      if (!aborted && ttsOn) {
        const tail = splitSentences(spokenBuffer, true).sentences
        for (const sentence of tail) flushSpeech(sentence)
        waitForSpeechEnd()
      } else {
        if (aborted) stopSpeaking()
        setStatus('idle')
      }

      if (success) {
        void afterReply(history, accumulated)
      }
    }
  }

  function waitForSpeechEnd() {
    if (!ttsOn || typeof speechSynthesis === 'undefined') {
      setStatus('idle')
      return
    }
    setStatus('speaking')
    const started = Date.now()
    const timer = window.setInterval(() => {
      const active = speechSynthesis.speaking || speechSynthesis.pending
      if (!active || Date.now() - started > 120000) {
        window.clearInterval(timer)
        setStatus('idle')
      }
    }, 250)
  }

  async function afterReply(history: ChatMessage[], reply: string) {
    const provider = settings.apiKey || PROXY_ENABLED ? 'openrouter' : 'pollinations'
    const model = settings.apiKey || PROXY_ENABLED ? settings.fastModel : 'openai-fast'
    const userTurns = history.filter((message) => message.role === 'user').length
    const fullHistory = [...history, { id: 'tmp', role: 'assistant' as const, content: reply, ts: Date.now() }]
    const memoryEvery = settings.apiKey ? 4 : 8

    if (settings.autoMemory && userTurns % memoryEvery === 0) {
      try {
        const controller = new AbortController()
        const timer = window.setTimeout(() => controller.abort(), 25000)
        const incoming = await extractFacts(provider, settings.apiKey, model, fullHistory, controller.signal)
        window.clearTimeout(timer)
        if (incoming.length > 0) {
          const merged = mergeFacts(factsRef.current, incoming)
          if (merged.added > 0) {
            setFacts(merged.facts)
            toast(`Memory updated · ${merged.added} new detail${merged.added > 1 ? 's' : ''}`)
          }
        }
      } catch {
        /* background memory is best-effort */
      }
    }

    if (fullHistory.length >= 36 && fullHistory.length % 18 === 0) {
      try {
        const controller = new AbortController()
        const timer = window.setTimeout(() => controller.abort(), 30000)
        const nextSummary = await summarizeConversation(provider, settings.apiKey, model, fullHistory.slice(0, -16), controller.signal)
        window.clearTimeout(timer)
        if (nextSummary) setSummary(nextSummary)
      } catch {
        /* best-effort */
      }
    }
  }

  function stopEverything() {
    abortRef.current?.abort()
    abortRef.current = null
    stopSpeaking()
    setBusy(false)
    setStatus('idle')
  }

  function toggleMic() {
    if (!recognizerSupported()) {
      toast('Voice input needs Chrome or Edge. Try those browsers.')
      return
    }
    if (recRef.current) {
      recRef.current.abort()
      recRef.current = null
      setStatus('idle')
      return
    }
    stopSpeaking()
    const recognizer = createRecognizer(settings.language, {
      onInterim: (text) => setInput(text),
      onFinal: (text) => {
        setInput('')
        void sendRef.current(text)
      },
      onError: (message) => toast(message),
      onEnd: () => {
        recRef.current = null
        setStatus((current) => (current === 'listening' ? 'idle' : current))
      },
    })
    if (!recognizer) {
      toast('Speech recognition is unavailable in this browser.')
      return
    }
    recRef.current = recognizer
    setStatus('listening')
    try {
      recognizer.start()
    } catch {
      recRef.current = null
      setStatus('idle')
      toast('Could not start the microphone.')
    }
  }

  async function grabScreen() {
    try {
      const shot = await captureScreen()
      setAttachment(shot)
      setInput((current) => current || 'What do you see on my screen?')
      toast('Screen captured — ask me anything about it.')
    } catch (error) {
      const name = (error as { name?: string })?.name
      if (name !== 'NotAllowedError') toast('Screen capture is unavailable on this device.')
    }
  }

  function exportMemory() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      facts,
      notes,
      reminders,
      summary,
      settings: { ...settings, apiKey: '' },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'jarvis-memory.json'
    link.click()
    URL.revokeObjectURL(url)
    toast('Memory exported.')
  }

  async function importMemory(file: File) {
    try {
      const parsed = JSON.parse(await file.text())
      if (Array.isArray(parsed.facts)) {
        setFacts((prev) => {
          const seen = new Set(prev.map((fact) => fact.text.toLowerCase()))
          const incoming = parsed.facts
            .filter((fact: Fact) => fact && typeof fact.text === 'string')
            .filter((fact: Fact) => !seen.has(fact.text.toLowerCase()))
            .map((fact: Fact) => ({ ...fact, id: uid() }))
          return [...incoming, ...prev].slice(0, 80)
        })
      }
      if (Array.isArray(parsed.notes)) setNotes((prev) => [...parsed.notes, ...prev].slice(0, 100))
      if (Array.isArray(parsed.reminders)) setReminders((prev) => [...parsed.reminders, ...prev].slice(0, 60))
      if (typeof parsed.summary === 'string') setSummary(parsed.summary)
      toast('Memory imported.')
    } catch {
      toast('That file could not be imported.')
    }
  }

  function clearChat() {
    if (!window.confirm('Clear the visible conversation? Memory facts will stay.')) return
    setMessages([])
    toast('Conversation cleared.')
  }

  function clearMemory() {
    if (!window.confirm('Delete all facts, notes, reminders and summaries?')) return
    setFacts([])
    setNotes([])
    setReminders([])
    setSummary('')
    toast('Memory wiped.')
  }

  const statusText = STATUS_TEXT[status]
  const totalMemories = facts.length + notes.length + reminders.filter((reminder) => !reminder.done).length
  const needsKey = DIRECT_KEY_MODE && !settings.apiKey
  const visionReady = useMemo(() => screenCaptureSupported(), [])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Orb status={status} />
          <div className="brand-text">
            <h1>{settings.assistantName.toUpperCase()}</h1>
            <span className={`status ${status}`}>{statusText}</span>
          </div>
        </div>
        <div className="top-actions">
          <label className="lang-picker" title={`Voice + reply language: ${languageName(settings.language)}`}>
            <span className="sr-only">Voice and reply language</span>
            <select
              value={settings.language}
              onChange={(event) => {
                const language = event.target.value
                setSettings((prev) => ({ ...prev, language, voiceURI: '' }))
              }}
              aria-label="Voice and reply language"
            >
              {LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {languageShort(language.value)}
                </option>
              ))}
            </select>
          </label>
          <span className="model-badge" title="Active free model">
            {labelFor(activeModel, catalog)}
          </span>
          <button
            className={`icon-btn ${ttsOn ? 'active' : ''}`}
            onClick={() => {
              const next = !ttsOn
              setTtsOn(next)
              if (!next) {
                stopSpeaking()
                setStatus('idle')
              }
            }}
            title={ttsOn ? 'Mute voice' : 'Enable voice'}
            aria-label="Toggle voice"
          >
            <Icon name={ttsOn ? 'speaker' : 'muted'} />
          </button>
          <button className="icon-btn" onClick={() => setPanel('memory')} title="Memory" aria-label="Memory">
            <Icon name="memory" />
            {totalMemories > 0 && <span className="dot">{totalMemories}</span>}
          </button>
          <button className="icon-btn" onClick={() => setPanel('settings')} title="Settings" aria-label="Settings">
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <main className="chat" ref={scrollRef}>
        {messages.length === 0 && (
          <section className="welcome">
            <div className="welcome-orb">
              <Orb status={status} />
            </div>
            <h2>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}{settings.userName ? `, ${settings.userName}` : ''}.</h2>
            <p>
              I run on free public models — no key, no setup. When one model hits its limit I quietly queue the next and continue the same answer.
              I can talk, search the web, and remember what matters. Voice and memory stay in your browser.
            </p>
            <div className="feature-pills">
              <span>Voice</span>
              {!DIRECT_KEY_MODE && <span>No key needed</span>}
              <span>Screen vision</span>
              <span>Free research</span>
              <span>Long-term memory</span>
              <span>Reminders</span>
            </div>
            <div className="quick-grid">
              <button onClick={() => void sendMessage('What can you do?')}>What can you do?</button>
              <button onClick={() => void sendMessage('Research the latest AI news and summarise it')}>Latest AI news</button>
              <button onClick={() => void grabScreen()}>Look at my screen</button>
              <button onClick={() => void sendMessage('Help me plan my day')}>Plan my day</button>
            </div>
            {needsKey && (
              <div className="key-banner">
                <p>
                  <strong>One-time setup:</strong> paste your free OpenRouter key. It stays in this browser. (The hosted build normally includes a
                  keyless relay, so this only appears for self-hosted builds without one.)
                </p>
                <button className="btn primary" onClick={() => setPanel('settings')}>Open settings</button>
              </div>
            )}
          </section>
        )}

        {messages.map((message) => (
          <article key={message.id} className={`message ${message.role} ${message.error ? 'error' : ''}`}>
            <div className="bubble">
              {message.attachments?.length ? (
                <div className="thumb-row">
                  {message.attachments.map((shot, index) => (
                    <img key={index} src={shot.dataUrl} alt={shot.label} />
                  ))}
                </div>
              ) : null}
              {message.content ? <Markdown text={message.content} /> : <span className="typing-dots"><i /><i /><i /></span>}
              {message.sources?.length ? (
                <div className="sources">
                  <span className="sources-title">Sources</span>
                  {message.sources.map((source, index) => (
                    <a key={source.url + index} href={source.url} target="_blank" rel="noopener noreferrer">
                      [{index + 1}] {source.title}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
            <time>{new Date(message.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          </article>
        ))}
      </main>

      {toastMsg && <div className="toast">{toastMsg}</div>}

      {panel !== 'none' && <div className="drawer-backdrop" onClick={() => setPanel('none')} />}
      {panel === 'settings' && (
        <SettingsPanel
          settings={settings}
          onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
          voices={voices}
          models={catalog}
          hasKey={Boolean(settings.apiKey) || PROXY_ENABLED}
          directMode={DIRECT_KEY_MODE}
          onClose={() => setPanel('none')}
          onExport={exportMemory}
          onImport={(file) => void importMemory(file)}
          onClearChat={clearChat}
          onClearMemory={clearMemory}
        />
      )}
      {panel === 'memory' && (
        <MemoryPanel
          facts={facts}
          notes={notes}
          reminders={reminders}
          onAddFact={(text) => {
            const merged = mergeFacts(factsRef.current, [text])
            setFacts(merged.facts)
            toast(merged.added > 0 ? 'Remembered.' : 'Already known.')
          }}
          onDeleteFact={(id) => setFacts((prev) => prev.filter((fact) => fact.id !== id))}
          onDeleteNote={(id) => setNotes((prev) => prev.filter((note) => note.id !== id))}
          onDeleteReminder={(id) => setReminders((prev) => prev.filter((reminder) => reminder.id !== id))}
          onClose={() => setPanel('none')}
        />
      )}

      {cameraOpen && (
        <CameraModal
          onClose={() => setCameraOpen(false)}
          onCapture={(shot) => {
            setAttachment(shot)
            setInput((current) => current || 'What do you see?')
          }}
        />
      )}

      <footer className="composer-wrap">
        {attachment && (
          <div className="attachment-chip">
            <img src={attachment.dataUrl} alt={attachment.label} />
            <span>{attachment.label}</span>
            <button onClick={() => setAttachment(null)} aria-label="Remove attachment">✕</button>
          </div>
        )}
        <div className="composer">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            placeholder={status === 'listening' ? 'Listening…' : needsKey ? 'Add your free key, then talk to me…' : 'Ask anything — no key needed…'}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void sendMessage()
              }
            }}
          />
          <div className="composer-actions">
            <button className={`icon-btn ${status === 'listening' ? 'recording' : ''}`} onClick={toggleMic} title="Voice input" aria-label="Voice input">
              <Icon name="mic" />
            </button>
            <button className="icon-btn" onClick={() => setCameraOpen(true)} title="Camera" aria-label="Camera">
              <Icon name="camera" />
            </button>
            {visionReady && (
              <button className="icon-btn" onClick={() => void grabScreen()} title="Share screen" aria-label="Share screen">
                <Icon name="screen" />
              </button>
            )}
            <label className="icon-btn" title="Attach image">
              <Icon name="attach" />
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (!file) return
                  void fileToAttachment(file)
                    .then((shot) => {
                      setAttachment(shot)
                      setInput((current) => current || 'What do you see?')
                    })
                    .catch(() => toast('Could not read that image.'))
                }}
              />
            </label>
            <button
              className={`icon-btn ${researchMode ? 'active' : ''}`}
              onClick={() => setResearchMode((current) => !current)}
              title="Research this message on the web"
              aria-label="Toggle web research"
            >
              <Icon name="globe" />
            </button>
            {busy ? (
              <button className="send-btn stop" onClick={stopEverything} title="Stop" aria-label="Stop">
                <Icon name="stop" />
              </button>
            ) : (
              <button className="send-btn" onClick={() => void sendMessage()} disabled={!input.trim() && !attachment} title="Send" aria-label="Send">
                <Icon name="send" />
              </button>
            )}
          </div>
        </div>
        <p className="footnote">
          {catalog.length || 14} free models · automatic queue + mid-answer switching · research via DuckDuckGo · memory stays in this browser
        </p>
      </footer>
    </div>
  )
}

function Icon({ name }: { name: string }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'mic':
      return (
        <svg {...common}>
          <rect x="9" y="2.5" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7" />
        </svg>
      )
    case 'camera':
      return (
        <svg {...common}>
          <path d="M4 8h3l2-3h6l2 3h3v12H4z" />
          <circle cx="12" cy="13.5" r="3.5" />
        </svg>
      )
    case 'screen':
      return (
        <svg {...common}>
          <rect x="2" y="4" width="20" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      )
    case 'globe':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" />
        </svg>
      )
    case 'send':
      return (
        <svg {...common}>
          <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
        </svg>
      )
    case 'stop':
      return (
        <svg {...common}>
          <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
        </svg>
      )
    case 'speaker':
      return (
        <svg {...common}>
          <path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7" />
        </svg>
      )
    case 'muted':
      return (
        <svg {...common}>
          <path d="M11 5 6 9H2v6h4l5 4zM16 9l6 6M22 9l-6 6" />
        </svg>
      )
    case 'memory':
      return (
        <svg {...common}>
          <path d="M12 2.5 21 7.5v9L12 21.5 3 16.5v-9zM12 8v8M7.5 10.5l9 3M16.5 10.5l-9 3" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.98 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.62 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.98a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.62h.03A1.7 1.7 0 0 0 10.06 3.06V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.38 9v.03c.26.66.9 1.1 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.97z" />
        </svg>
      )
    case 'attach':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    default:
      return null
  }
}
