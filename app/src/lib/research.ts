export interface SearchResult {
  title: string
  url: string
  snippet: string
}

async function fetchWithTimeout(url: string, ms: number, headers?: Record<string, string>): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal, headers })
  } finally {
    window.clearTimeout(timer)
  }
}

function cleanText(text: string): string {
  return text
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeDdg(href: string): string {
  try {
    const url = new URL(href, 'https://duckduckgo.com')
    const target = url.searchParams.get('uddg')
    return target ? decodeURIComponent(target) : href
  } catch {
    return href
  }
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  const res = await fetchWithTimeout(
    `https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    15000,
    { Accept: 'text/plain' },
  )
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const markdown = await res.text()
  const lines = markdown.split('\n')
  const results: SearchResult[] = []
  for (let i = 0; i < lines.length && results.length < 6; i++) {
    const match = lines[i].match(/^##\s+\[(.+?)\]\((.+?)\)\s*$/)
    if (!match) continue
    const title = cleanText(match[1])
    const url = decodeDdg(match[2])
    let snippet = ''
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      const line = lines[j].trim()
      if (/^##\s+\[/.test(line)) break
      if (!line || line.startsWith('![') || line.startsWith('[![')) continue
      const linked = line.match(/^\[(.+?)\]\((.+?)\)$/)
      const raw = linked ? linked[1] : line
      const candidate = cleanText(raw)
      if (candidate.length > 45) {
        snippet = candidate
        break
      }
    }
    if (title && url.startsWith('http')) results.push({ title, url, snippet })
  }
  return results
}

export async function fetchPageExcerpt(url: string, chars = 4500): Promise<string> {
  const res = await fetchWithTimeout(`https://r.jina.ai/${url}`, 12000, { Accept: 'text/plain' })
  if (!res.ok) throw new Error(`Page fetch failed (${res.status})`)
  return (await res.text()).slice(0, chars)
}

export interface ResearchResult {
  context: string
  sources: SearchResult[]
}

/** Free web research: DuckDuckGo through the Jina reader proxy, plus page excerpts. */
export async function research(query: string): Promise<ResearchResult> {
  let results: SearchResult[] = []
  try {
    results = await searchWeb(query)
  } catch {
    results = []
  }
  const sources = results.slice(0, 5)
  const excerpts: string[] = []
  for (const source of sources.slice(0, 2)) {
    try {
      const excerpt = await fetchPageExcerpt(source.url)
      if (excerpt.trim()) excerpts.push(`Excerpt from ${source.url}:\n${excerpt}`)
    } catch {
      /* ignore individual page failures */
    }
  }
  const context = [
    `Web search results for "${query}":`,
    ...sources.map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n${r.snippet}`),
    ...excerpts,
  ]
    .join('\n\n')
    .slice(0, 12000)
  return { context, sources }
}
