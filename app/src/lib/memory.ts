import type { ChatMessage, Fact } from '../types'
import { chatOnce, type ChatMsg } from './openrouter'
import { uid } from './storage'

function parseJsonArray(raw: string): string[] {
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const parsed: unknown = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.replace(/\s+/g, ' ').trim())
      .filter((item) => item.length > 3 && item.length < 160)
      .slice(0, 3)
  } catch {
    return []
  }
}

export async function extractFacts(
  apiKey: string,
  model: string,
  conversation: ChatMessage[],
  signal?: AbortSignal,
): Promise<string[]> {
  const transcript = conversation
    .slice(-10)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')
    .slice(0, 6000)
  if (!transcript.trim()) return []
  const messages: ChatMsg[] = [
    {
      role: 'system',
      content:
        'You extract durable personal facts from conversations. A fact is a long-lived preference, project, relationship, goal, schedule, or personal detail. Ignore small talk, one-off questions, and anything the assistant said. Return ONLY a JSON array of 1-3 short third-person fact strings, for example ["Likes filter coffee", "Building a Jarvis AI assistant", "Studies computer science"]. If nothing durable is present, return [].',
    },
    { role: 'user', content: transcript },
  ]
  const raw = await chatOnce({ apiKey, model, messages, signal, temperature: 0.2, maxTokens: 220 })
  return parseJsonArray(raw)
}

export function mergeFacts(existing: Fact[], incoming: string[]): { facts: Fact[]; added: number } {
  const seen = new Set(existing.map((f) => f.text.toLowerCase()))
  const fresh: Fact[] = []
  for (const text of incoming) {
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    fresh.push({ id: uid(), text, ts: Date.now() })
  }
  return { facts: [...fresh, ...existing].slice(0, 80), added: fresh.length }
}

export async function summarizeConversation(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const transcript = messages
    .map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
    .join('\n')
    .slice(-9000)
  if (!transcript.trim()) return ''
  const prompt: ChatMsg[] = [
    {
      role: 'system',
      content:
        'Summarise this conversation for your own future memory. Keep durable facts, decisions, open tasks, and the user\'s current goals. Write in third person, at most 120 words. No preamble.',
    },
    { role: 'user', content: transcript },
  ]
  return (await chatOnce({ apiKey, model, messages: prompt, signal, temperature: 0.3, maxTokens: 260 })).trim()
}
