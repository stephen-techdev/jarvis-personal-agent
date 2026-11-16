export type MsgRole = 'system' | 'user' | 'assistant'

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMsg {
  role: MsgRole
  content: string | ContentPart[]
}

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

export class OpenRouterError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'OpenRouterError'
    this.status = status
  }
}

async function post(apiKey: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://localhost',
      'X-Title': 'Jarvis Personal Agent',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 500)
    } catch {
      /* ignore */
    }
    throw new OpenRouterError(res.status, `HTTP ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return res
}

export interface StreamArgs {
  apiKey: string
  model: string
  messages: ChatMsg[]
  signal?: AbortSignal
  temperature?: number
  onToken: (token: string) => void
}

export async function streamChat({ apiKey, model, messages, signal, temperature = 0.7, onToken }: StreamArgs): Promise<void> {
  const res = await post(apiKey, { model, messages, stream: true, temperature }, signal)
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
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          if (json.error) throw new OpenRouterError(502, json.error.message ?? 'Model error')
          const token = json.choices?.[0]?.delta?.content
          if (typeof token === 'string' && token.length > 0) onToken(token)
        } catch (err) {
          if (err instanceof SyntaxError) continue
          throw err
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export interface OnceArgs {
  apiKey: string
  model: string
  messages: ChatMsg[]
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
}

export async function chatOnce({ apiKey, model, messages, signal, temperature = 0.4, maxTokens = 400 }: OnceArgs): Promise<string> {
  const res = await post(apiKey, { model, messages, temperature, max_tokens: maxTokens }, signal)
  const json = await res.json()
  return String(json.choices?.[0]?.message?.content ?? '').trim()
}

export interface FallbackArgs {
  apiKey: string
  models: string[]
  messages: ChatMsg[]
  signal?: AbortSignal
  onToken: (token: string) => void
  onModel: (model: string) => void
}

/**
 * Streams with a fallback chain. Retries the next model only if nothing has
 * been emitted yet, so the user never sees duplicated output.
 */
export async function streamWithFallback(args: FallbackArgs): Promise<string> {
  let lastError: unknown = null
  for (const model of args.models) {
    args.onModel(model)
    let produced = false
    try {
      await streamChat({
        apiKey: args.apiKey,
        model,
        messages: args.messages,
        signal: args.signal,
        onToken: (token) => {
          produced = true
          args.onToken(token)
        },
      })
      if (produced) return model
      lastError = new OpenRouterError(502, 'Empty response')
    } catch (err) {
      if (args.signal?.aborted) throw err
      lastError = err
      if (produced) throw err
    }
  }
  throw lastError ?? new OpenRouterError(502, 'All free models are unavailable right now')
}
