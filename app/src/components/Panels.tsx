import { useRef, useState } from 'react'
import type { Fact, Note, Reminder, Settings } from '../types'
import type { ModelOption } from '../lib/catalog'

const LANGUAGES = [
  { value: 'en-IN', label: 'English (India)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-AU', label: 'English (Australia)' },
  { value: 'hi-IN', label: 'Hindi (India)' },
]

interface SettingsProps {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  voices: SpeechSynthesisVoice[]
  models: ModelOption[]
  hasKey: boolean
  directMode: boolean
  onClose: () => void
  onExport: () => void
  onImport: (file: File) => void
  onClearChat: () => void
  onClearMemory: () => void
}

export function SettingsPanel({ settings, onChange, voices, models, hasKey, directMode, onClose, onExport, onImport, onClearChat, onClearMemory }: SettingsProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const openrouterModels = models.filter((model) => model.provider === 'openrouter')
  const visionModels = openrouterModels.filter((model) => model.vision)

  const renderModelOptions = (list: ModelOption[], current: string) => (
    <>
      {!list.some((model) => model.id === current) && current && <option value={current}>{current.split('/').pop()?.replace(':free', '')} (current)</option>}
      {list.map((model) => (
        <option key={model.id} value={model.id}>
          {model.label}
          {model.vision ? ' · vision' : ''}
        </option>
      ))}
    </>
  )

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <h2>Settings</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </div>
      <div className="drawer-body">
        {directMode ? (
          <section className="field-group">
            <label className="field">
              <span>OpenRouter API key</span>
              <input
                type="password"
                value={settings.apiKey}
                placeholder="sk-or-v1-..."
                autoComplete="off"
                onChange={(event) => onChange({ apiKey: event.target.value.trim() })}
              />
            </label>
            <p className="hint">
              Free key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/keys</a>. Stored only in this
              browser and sent only to OpenRouter. A free key also unlocks image vision.
            </p>
          </section>
        ) : (
          <section className="field-group">
            <h3>Access</h3>
            <div className="status-box">
              <strong>No key needed</strong>
              <p>
                This build talks to a secure relay that holds the model credential server-side. Only free models are allowed through it, so nothing
                can be charged, and your browser never stores a key.
              </p>
            </div>
          </section>
        )}

        <section className="field-group">
          <h3>Identity</h3>
          <label className="field">
            <span>Assistant name</span>
            <input value={settings.assistantName} onChange={(event) => onChange({ assistantName: event.target.value })} />
          </label>
          <label className="field">
            <span>Your name</span>
            <input value={settings.userName} placeholder="What should it call you?" onChange={(event) => onChange({ userName: event.target.value })} />
          </label>
        </section>

        <section className="field-group">
          <h3>Models</h3>
          {hasKey ? (
            <>
              <label className="field">
                <span>Chat model</span>
                <select value={settings.chatModel} onChange={(event) => onChange({ chatModel: event.target.value })}>
                  {renderModelOptions(openrouterModels, settings.chatModel)}
                </select>
              </label>
              <label className="field">
                <span>Vision model</span>
                <select value={settings.visionModel} onChange={(event) => onChange({ visionModel: event.target.value })}>
                  {renderModelOptions(visionModels, settings.visionModel)}
                </select>
              </label>
              <label className="field">
                <span>Background model (memory extraction)</span>
                <select value={settings.fastModel} onChange={(event) => onChange({ fastModel: event.target.value })}>
                  {renderModelOptions(openrouterModels, settings.fastModel)}
                </select>
              </label>
              <p className="hint">
                {directMode
                  ? 'Your choice is tried first, then the rest of the free queue. Free models are rate-limited, so the queue may switch mid-answer.'
                  : 'Served through the keyless relay. Only free models are allowed, so a switch can never spend money.'}
              </p>
            </>
          ) : (
            <div className="status-box">
              <strong>Free public mode active</strong>
              <p>
                No key, no setup. Every answer searches the live free-model catalog, queues fallbacks, and continues mid-sentence on the next model
                when one hits its limit.
              </p>
              <p className="hint">Text only. Add an optional free key above for image vision and OpenRouter models.</p>
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={settings.autoMemory} onChange={(event) => onChange({ autoMemory: event.target.checked })} />
            <span>Automatically remember durable facts from conversation</span>
          </label>
        </section>

        <section className="field-group">
          <h3>Voice</h3>
          <label className="field">
            <span>Speaking voice</span>
            <select value={settings.voiceURI} onChange={(event) => onChange({ voiceURI: event.target.value })}>
              <option value="">Auto (best available)</option>
              {voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Microphone language</span>
            <select value={settings.language} onChange={(event) => onChange({ language: event.target.value })}>
              {LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field range">
            <span>Rate · {settings.rate.toFixed(2)}×</span>
            <input type="range" min="0.6" max="1.6" step="0.02" value={settings.rate} onChange={(event) => onChange({ rate: Number(event.target.value) })} />
          </label>
          <label className="field range">
            <span>Pitch · {settings.pitch.toFixed(2)}</span>
            <input type="range" min="0.5" max="1.5" step="0.02" value={settings.pitch} onChange={(event) => onChange({ pitch: Number(event.target.value) })} />
          </label>
        </section>

        <section className="field-group">
          <h3>Data</h3>
          <div className="button-row">
            <button className="btn ghost" onClick={onExport}>Export memory</button>
            <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import memory</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onImport(file)
                event.target.value = ''
              }}
            />
          </div>
          <div className="button-row">
            <button className="btn danger-ghost" onClick={onClearChat}>Clear chat</button>
            <button className="btn danger-ghost" onClick={onClearMemory}>Clear memory</button>
          </div>
          <p className="hint">Conversations, facts, notes and reminders never leave this browser. Only prompts, and images you deliberately share, go to the free model provider.</p>
        </section>

        <section className="field-group about">
          <h3>About</h3>
          <p className="hint">
            J.A.R.V.I.S v0.2 — keyless personal agent PWA. Free public models with an automatic queue and mid-answer switching, voice, optional
            vision, memory and free web research. The local backend phase adds Whisper, Kokoro, OpenCode execution and a private Tailscale server.
          </p>
        </section>
      </div>
    </aside>
  )
}

interface MemoryProps {
  facts: Fact[]
  notes: Note[]
  reminders: Reminder[]
  onAddFact: (text: string) => void
  onDeleteFact: (id: string) => void
  onDeleteNote: (id: string) => void
  onDeleteReminder: (id: string) => void
  onClose: () => void
}

export function MemoryPanel({ facts, notes, reminders, onAddFact, onDeleteFact, onDeleteNote, onDeleteReminder, onClose }: MemoryProps) {
  const [draft, setDraft] = useState('')

  function addFact() {
    const text = draft.trim()
    if (!text) return
    onAddFact(text)
    setDraft('')
  }

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <h2>Memory</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close memory">
          ✕
        </button>
      </div>
      <div className="drawer-body">
        <section className="field-group">
          <h3>Facts it knows about you</h3>
          <div className="inline-form">
            <input
              value={draft}
              placeholder="Add something about yourself…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addFact()
              }}
            />
            <button className="btn primary small" onClick={addFact}>Add</button>
          </div>
          {facts.length === 0 ? (
            <p className="empty">Nothing yet. Chat naturally and it will remember, or add a fact above.</p>
          ) : (
            <ul className="chip-list">
              {facts.map((fact) => (
                <li key={fact.id}>
                  <span>{fact.text}</span>
                  <button className="chip-x" onClick={() => onDeleteFact(fact.id)} aria-label="Delete fact">✕</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="field-group">
          <h3>Notes</h3>
          {notes.length === 0 ? (
            <p className="empty">Say "note: buy coffee beans" in chat to save one.</p>
          ) : (
            <ul className="chip-list">
              {notes.map((note) => (
                <li key={note.id}>
                  <span>{note.text}</span>
                  <button className="chip-x" onClick={() => onDeleteNote(note.id)} aria-label="Delete note">✕</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="field-group">
          <h3>Reminders</h3>
          {reminders.length === 0 ? (
            <p className="empty">Say "remind me in 10 minutes to stretch".</p>
          ) : (
            <ul className="chip-list">
              {reminders.map((reminder) => (
                <li key={reminder.id} className={reminder.done ? 'done' : ''}>
                  <span>
                    {reminder.text}
                    <em>{new Date(reminder.due).toLocaleString()}</em>
                  </span>
                  <button className="chip-x" onClick={() => onDeleteReminder(reminder.id)} aria-label="Delete reminder">✕</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  )
}
