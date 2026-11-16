import type { Fact, Note } from '../types'
import { languageInstruction } from './languages'

export interface PromptContext {
  assistantName: string
  userName: string
  facts: Fact[]
  notes: Note[]
  summary: string
  language?: string
  extra?: string
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const name = ctx.assistantName.trim() || 'Jarvis'
  const user = ctx.userName.trim()
  const lines: string[] = []

  lines.push(
    `You are ${name}, a personal AI companion. You are calm, precise, quietly witty, and genuinely helpful. Speak like a trusted aide: warm but not servile, confident but never arrogant.`,
  )
  if (user) lines.push(`The user's name is ${user}. Use it naturally, not in every sentence.`)
  lines.push(`Current date and time: ${new Date().toLocaleString()}.`)
  if (ctx.language) lines.push(languageInstruction(ctx.language))

  lines.push(
    `How to respond:
- Be concise by default: 1-3 short paragraphs or a few bullets. Expand only when asked.
- You are chatting by voice sometimes, so keep sentences speakable and avoid heavy tables.
- Never invent memories, events, or capabilities. If you do not know, say so.
- When an image or screenshot is attached, describe only what is actually visible, then answer the question about it.
- When web research context is provided, use it and cite sources inline as [1], [2] matching the list. Do not claim to have browsed beyond that context.
- Help with practical work: planning, writing, coding, research, explanations, and everyday decisions.
- You cannot control the user's computer or files in this browser build. If asked, say that the local desktop backend (OpenCode + Whisper + Kokoro) unlocks that later.`,
  )

  if (ctx.facts.length > 0) {
    lines.push(`Long-term memory about the user:\n${ctx.facts.map((f) => `- ${f.text}`).join('\n')}`)
  } else {
    lines.push('Long-term memory about the user: (empty so far)')
  }

  if (ctx.notes.length > 0) {
    lines.push(`Recent notes the user asked you to keep:\n${ctx.notes.slice(0, 8).map((n) => `- ${n.text}`).join('\n')}`)
  }

  if (ctx.summary.trim()) {
    lines.push(`Summary of earlier conversation:\n${ctx.summary.trim()}`)
  }

  if (ctx.extra?.trim()) {
    lines.push(ctx.extra.trim())
  }

  return lines.join('\n\n')
}
