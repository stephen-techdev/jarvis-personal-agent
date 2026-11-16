import { PROXY_ENABLED, PROXY_URL } from './config'

export type MsgRole = 'system' | 'user' | 'assistant'

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMsg {
  role: MsgRole
  content: string | ContentPart[]
}

export type Provider = 'openrouter' | 'pollinations'

export interface QueueItem {
  provider: Provider
  model: string
}

const ENDPOINTS: Record<Provider, string> = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  pollinations: 'https://text.pollinations.ai/openai',
}

export class OpenRouterError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'OpenRouterError'
    this.status = status
  }
}

async function post(provider: Provider, apiKey: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let endpoint: string
  let payload: unknown = body

  if (PROXY_ENABLED) {
    // The relay holds the key and forwards to the right provider.
    endpoint = PROXY_URL
    payload = { provider, ...(body as Record<string, unknown>) }
  } else {
    endpoint = ENDPOINTS[provider]
    if (provider === 'openrouter') {
      if (!apiKey) throw new OpenRouterError(401, 'OpenRouter key missing')
      headers.Authorization = `Bearer ${apiKey}`
      headers['HTTP-Referer'] = typeof location !== 'undefined' ? location.origin : 'https://localhost'
      headers['X-Title'] = 'Jarvis Personal Agent'
    }
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 300)
    } catch {
      /* ignore */
    }
    throw new OpenRouterError(res.status, `HTTP ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return res
}

function parseSseLine(line: string, onToken: (token: string) => void): void {
  if (!line.startsWith('data:')) return
  const data = line.slice(5).trim()
  if (!data || data === '[DONE]') return
  try {
    const json = JSON.parse(data)
    if (json.error) throw new OpenRouterError(502, json.error.message ?? 'Model error')
    const token = json.choices?.[0]?.delta?.content
    if (typeof token === 'string' && token.length > 0) onToken(token)
  } catch (err) {
    if (err instanceof SyntaxError) return
    throw err
  }
}

export interface StreamArgs {
  provider: Provider
  apiKey: string
  model: string
  messages: ChatMsg[]
  signal?: AbortSignal
  temperature?: number
  onToken: (token: string) => void
}

export async function streamChat({ provider, apiKey, model, messages, signal, temperature = 0.7, onToken }: StreamArgs): Promise<void> {
  const res = await post(provider, apiKey, { model, messages, stream: true, temperature }, signal)
  const contentType = res.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const json = await res.json()
    if (json.error) throw new OpenRouterError(502, json.error.message ?? 'Model error')
    const content = json.choices?.[0]?.message?.content
    if (typeof content === 'string' && content.length > 0) onToken(content)
    return
  }

  const reader = res.body?.getReader()
  if (!reader) throw new OpenRouterError(500, 'No response body')
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        parseSseLine(line, onToken)
      }
    }
    const tail = buffer.trim()
    if (tail) parseSseLine(tail, onToken)
  } finally {
    reader.releaseLock()
  }
}

export interface OnceArgs {
  provider: Provider
  apiKey: string
  model: string
  messages: ChatMsg[]
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
}

export async function chatOnce({ provider, apiKey, model, messages, signal, temperature = 0.4, maxTokens = 400 }: OnceArgs): Promise<string> {
  const res = await post(provider, apiKey, { model, messages, stream: false, temperature, max_tokens: maxTokens }, signal)
  const json = await res.json()
  return String(json.choices?.[0]?.message?.content ?? '').trim()
}

/* ---------- limits, cooldowns and seamless continuation ---------- */

const COOLDOWN_MS = 90_000
const failedAt = new Map<string, number>()

function keyOf(item: QueueItem): string {
  return `${item.provider}::${item.model}`
}

function markCooling(item: QueueItem): void {
  failedAt.set(keyOf(item), Date.now())
}

function isCooling(item: QueueItem): boolean {
  const at = failedAt.get(keyOf(item))
  return Boolean(at && Date.now() - at < COOLDOWN_MS)
}

function orderByCooldown(queue: QueueItem[]): QueueItem[] {
  return [...queue].sort((a, b) => Number(isCooling(a)) - Number(isCooling(b)))
}

export function buildContinuationMessages(messages: ChatMsg[], partial: string): ChatMsg[] {
  const system = messages[0]?.role === 'system' ? [messages[0]] : []
  const tail = messages.filter((message) => message.role !== 'system').slice(-4)
  return [
    ...system,
    ...tail,
    { role: 'assistant', content: partial.slice(-7000) },
    {
      role: 'user',
      content:
        '[System note: the previous assistant reply was cut off by a provider rate limit. Continue it exactly where it stopped. Do not repeat, restart, or acknowledge this note. If the reply is already complete, output nothing.]',
    },
  ]
}

export interface FallbackArgs {
  apiKey: string
  queue: QueueItem[]
  messages: ChatMsg[]
  signal?: AbortSignal
  onToken: (token: string) => void
  onModel: (item: QueueItem) => void
  onSwitch?: (message: string) => void
}

export interface StreamResult extends QueueItem {
  truncated: boolean
}

/**
 * Streams the answer with an automatic free-model queue:
 * - 429/5xx on the first model → silently ask the next one
 * - failure mid-answer → keep the partial text and ask the next model to continue it
 * - the conversation itself is never restarted
 */
export async function streamWithFallback(args: FallbackArgs): Promise<StreamResult> {
  const queue = orderByCooldown(args.queue)
  let full = ''
  let lastError: unknown = null
  let lastItem: QueueItem | null = null
  let continuations = 0

  for (const item of queue) {
    if (args.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    lastItem = item
    args.onModel(item)
    const before = full.length
    const resuming = full.length > 0

    try {
      const messages = resuming ? buildContinuationMessages(args.messages, full) : args.messages
      await streamChat({
        provider: item.provider,
        apiKey: args.apiKey,
        model: item.model,
        messages,
        signal: args.signal,
        onToken: (token) => {
          full += token
          args.onToken(token)
        },
      })
      if (full.length > 0) return { ...item, truncated: false }
      lastError = new OpenRouterError(502, 'Empty response')
    } catch (err) {
      if (args.signal?.aborted) throw err
      lastError = err
      markCooling(item)
      const producedNow = full.length > before
      if (producedNow) {
        continuations += 1
        if (continuations > 2) return { ...item, truncated: true }
        args.onSwitch?.('Free model limit reached — continuing your answer on the next model…')
      } else {
        args.onSwitch?.('Free model busy — switching to the next one…')
      }
    }
  }

  if (full.length > 0 && lastItem) return { ...lastItem, truncated: true }
  throw lastError ?? new OpenRouterError(502, 'All free models are unavailable right now')
}
