/**
 * jarvis-tts — free speech fallback for the J.A.R.V.I.S PWA.
 *
 * Devices without a Text-to-Speech voice for the selected language (common for
 * Tamil on Windows) send the sentence here. The function fetches a small MP3
 * from Google's public translate voice endpoint and streams it back, so the
 * browser can speak any supported language without a key or an OS voice pack.
 *
 * Constraints: origin allow-list, fixed upstream URL, language allow-list,
 * 200-character text limit, and per-IP rate limits.
 */

const ALLOWED_ORIGINS = new Set([
  'https://stephen-techdev.github.io',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

const LANGUAGES = new Set([
  'ta', 'en', 'hi', 'te', 'ml', 'kn', 'bn', 'mr', 'gu', 'pa', 'ur',
  'ar', 'fr', 'de', 'es', 'pt', 'it', 'ru', 'tr', 'ja', 'ko', 'zh',
  'vi', 'th', 'id', 'nl', 'pl', 'sv',
])

const MAX_TEXT = 200
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const audioCache = new Map<string, ArrayBuffer>()

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
  return true
}

function clientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('cf-connecting-ip') ?? 'unknown'
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
  if (!withinLimit(`tts:${ip}`, 120, 60_000) || !withinLimit(`ttsday:${ip}`, 1500, 24 * 60 * 60 * 1000)) {
    return jsonResponse({ error: 'Voice rate limit reached. Try again shortly.' }, 429, origin)
  }

  let body: { text?: unknown; lang?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, origin)
  }

  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : ''
  const lang = typeof body.lang === 'string' ? body.lang.trim() : ''
  const base = lang.toLowerCase().split(/[-_]/)[0]

  if (!text || text.length > MAX_TEXT) {
    return jsonResponse({ error: `Text must be 1-${MAX_TEXT} characters` }, 400, origin)
  }
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(lang) || !LANGUAGES.has(base)) {
    return jsonResponse({ error: 'Unsupported language' }, 400, origin)
  }

  const cacheKey = `${lang}:${text}`
  const cached = audioCache.get(cacheKey)
  if (cached) {
    return new Response(cached, {
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  }

  const upstreamUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'audio/mpeg,*/*',
        Referer: 'https://translate.google.com/',
      },
    })
    if (!upstream.ok) {
      return jsonResponse({ error: `Voice provider HTTP ${upstream.status}` }, 502, origin)
    }
    const audio = await upstream.arrayBuffer()
    if (audio.byteLength < 500) {
      return jsonResponse({ error: 'Voice provider returned no audio' }, 502, origin)
    }
    if (audioCache.size > 40) {
      const oldest = audioCache.keys().next().value
      if (oldest) audioCache.delete(oldest)
    }
    audioCache.set(cacheKey, audio)
    return new Response(audio, {
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return jsonResponse({ error: 'Voice provider unreachable' }, 502, origin)
  }
})
