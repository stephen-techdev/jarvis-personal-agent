export interface Attachment {
  kind: 'image'
  dataUrl: string
  label: string
}

export interface Source {
  title: string
  url: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
  sources?: Source[]
  ts: number
  error?: boolean
}

export interface Fact {
  id: string
  text: string
  ts: number
}

export interface Note {
  id: string
  text: string
  ts: number
}

export interface Reminder {
  id: string
  text: string
  due: number
  done: boolean
}

export interface Settings {
  apiKey: string
  chatModel: string
  visionModel: string
  fastModel: string
  userName: string
  assistantName: string
  voiceURI: string
  rate: number
  pitch: number
  autoMemory: boolean
  language: string
}

export type Status = 'idle' | 'listening' | 'thinking' | 'speaking'
