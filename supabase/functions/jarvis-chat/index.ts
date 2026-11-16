/**
 * jarvis-chat — keyless relay for the J.A.R.V.I.S PWA.
 *
 * The browser calls this function with { provider, model, messages, ... }.
 * The function forwards to OpenRouter (key held in Supabase secrets) or
 * Pollinations (no key), streaming the response straight back.
 *
 * Design constraints:
 *  - Only OpenRouter `:free` models and Pollinations' anonymous model are allowed,
 *    so this endpoint can never spend money.
 *  - Origin allow-list + in-memory rate limits reduce casual abuse.
 *  - The API key never reaches the client.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const POLLINATIONS_URL = 'https://text.pollinations.ai/openai'

const ALLOWED_ORIGINS = new Set([
  'https://stephen-techdev.github.io',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

const POLLINATIONS_MODELS = new Set(['openai-fast', 'openai'])

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | unknown[]
}

interface ChatBody {
  provider?: 'openrouter' | 'pollinations'
  model?: string
  messages?: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://stephen-techdev.github.io'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

/* ---------- lightweight in-memory rate limiting ---------- */

const windows = new Map<string, number[]>()

function withinLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const hits = (windows.get(key) ?? []).filter((at) => now - at < windowMs)
  if (hits.length >= limit) {
    windows.set(key, hits)
    return false
  }
  hits.push(now)
  windows.set(key, hits)
  if (windows.size > 2000) {
    for (const [k, v] of windows) {
      if (v.every((at) => now - at > windowMs)) windows.delete(k)
    }
  }
  return true
}

function clientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('cf-connecting-ip') ?? 'unknown'
}

/* ---------- validation ---------- */

function validOpenRouterModel(model: string): boolean {
  return model.endsWith(':free') && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(model)
}

function sanitizeMessages(messages: unknown): ChatMessage[] | null {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) return null
  const cleaned: ChatMessage[] = []
  for (const entry of messages) {
    if (!entry || typeof entry !== 'object') return null
    const role = (entry as { role?: unknown }).role
    const content = (entry as { content?: unknown }).content
    if (role !== 'system' && role !== 'user' && role !== 'assistant') return null
    if (typeof content === 'string') {
      if (!content.trim()) return null
      cleaned.push({ role, content: content.slice(0, 24000) })
      continue
    }
    if (!Array.isArray(content) || content.length === 0 || content.length > 8) return null
    const parts = content.filter((part) => part && typeof part === 'object').slice(0, 8)
    if (parts.length === 0) return null
    cleaned.push({ role, content: parts })
  }
  return cleaned
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, origin)
  }
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse({ error: 'Origin not allowed' }, 403, origin)
  }

  const ip = clientIP(req)
  if (!withinLimit(`ip:${ip}`, 60, 60_000) || !withinLimit(`all:${ip}`, 400, 24 * 60 * 60 * 1000)) {
    return jsonResponse({ error: 'Rate limit reached. Try again in a minute.' }, 429, origin)
  }

  let body: ChatBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, origin)
  }

  const provider = body.provider === 'pollinations' ? 'pollinations' : 'openrouter'
  const model = typeof body.model === 'string' ? body.model.trim() : ''
  const messages = sanitizeMessages(body.messages)
  if (!model || !messages) {
    return jsonResponse({ error: 'model and messages are required' }, 400, origin)
  }

  const stream = body.stream === true
  const temperature = typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1.5) : 0.7
  const maxTokens = typeof body.max_tokens === 'number' ? Math.min(Math.max(Math.floor(body.max_tokens), 16), 1500) : 1024

  let upstreamUrl: string
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (provider === 'pollinations') {
    if (!POLLINATIONS_MODELS.has(model)) {
      return jsonResponse({ error: 'Unknown keyless model' }, 400, origin)
    }
    upstreamUrl = POLLINATIONS_URL
  } else {
    if (!validOpenRouterModel(model)) {
      return jsonResponse({ error: 'Only free models are available through this relay' }, 400, origin)
    }
    const key = Deno.env.get('OPENROUTER_API_KEY') ?? ''
    if (!key) return jsonResponse({ error: 'Relay is missing its OpenRouter key' }, 503, origin)
    headers.Authorization = `Bearer ${key}`
    headers['HTTP-Referer'] = 'https://stephen-techdev.github.io/jarvis-personal-agent/'
    headers['X-Title'] = 'Jarvis Personal Agent'
    upstreamUrl = OPENROUTER_URL
  }

  const upstreamBody: Record<string, unknown> = {
    model,
    messages,
    stream,
    temperature,
  }
  if (!stream) upstreamBody.max_tokens = maxTokens

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(upstreamBody),
    })
  } catch {
    return jsonResponse({ error: 'Upstream provider unreachable' }, 502, origin)
  }

  if (!upstream.ok) {
    let detail = ''
    try {
      detail = (await upstream.text()).slice(0, 600)
    } catch {
      /* ignore */
    }
    const wait = upstream.headers.get('retry-after')
    const response = jsonResponse(
      { error: detail || `Upstream HTTP ${upstream.status}` },
      upstream.status,
      origin,
    )
    if (wait) response.headers.set('Retry-After', wait)
    return response
  }

  const contentType = upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8'
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
})
