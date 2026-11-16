import { FREE_MODELS, modelInfo } from './models'
import { PROXY_ENABLED } from './config'
import { load, save } from './storage'
import type { QueueItem } from './openrouter'

export type { Provider, QueueItem } from './openrouter'

export interface ModelOption {
  id: string
  label: string
  vision: boolean
  provider: 'openrouter' | 'pollinations'
  context?: number
  note?: string
}

const CACHE_KEY = 'modelCatalog.v2'
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

interface CacheShape {
  ts: number
  models: ModelOption[]
}

interface OpenRouterModel {
  id: string
  name?: string
  context_length?: number
  architecture?: { input_modalities?: string[] }
}

/** Keyless models the relay can forward to. */
const KEYLESS_MODELS: ModelOption[] = [
  {
    id: 'openai-fast',
    label: 'Free public · GPT-OSS 20B',
    vision: false,
    provider: 'pollinations',
    note: 'no key needed',
  },
]

/** Models that only work inside OpenRouter's agentic harnesses. */
const UNAVAILABLE_MODELS = new Set(['thinkingmachines/inkling-2-small:free'])

/** Metadata sometimes advertises image input that the free endpoint rejects. */
const VISION_OVERRIDES: Record<string, boolean> = {
  'nvidia/nemotron-3.5-super-vl:free': false,
}

function staticOpenRouterModels(): ModelOption[] {
  return FREE_MODELS.map((model) => ({ ...model, provider: 'openrouter' as const }))
}

async function fetchOpenRouterFree(signal?: AbortSignal): Promise<ModelOption[]> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal })
    if (!res.ok) return []
    const json: unknown = await res.json()
    const data = (json as { data?: OpenRouterModel[] }).data
    if (!Array.isArray(data)) return []
    return data
      .filter((model) => model.id.endsWith(':free') && !UNAVAILABLE_MODELS.has(model.id))
      .map((model) => {
        const curated = modelInfo(model.id)
        const vision =
          VISION_OVERRIDES[model.id] ?? Boolean(model.architecture?.input_modalities?.includes('image'))
        return {
          id: model.id,
          label: curated?.label ?? model.name ?? model.id,
          vision,
          provider: 'openrouter' as const,
          context: model.context_length,
          note: curated?.note,
        }
      })
  } catch {
    return []
  }
}

/**
 * Discovers every currently available free model: OpenRouter's live `:free`
 * catalog plus Pollinations' anonymous (keyless) models. Falls back to the
 * bundled static list when offline.
 */
export async function discoverModels(signal?: AbortSignal): Promise<ModelOption[]> {
  const cache = load<CacheShape | null>(CACHE_KEY, null)
  if (cache && Date.now() - cache.ts < CACHE_TTL && cache.models.length > 0) {
    return cache.models
  }

  const openrouter = await fetchOpenRouterFree(signal)
  const models: ModelOption[] = []

  ;(openrouter.length > 0 ? openrouter : staticOpenRouterModels()).forEach((model) => {
    models.push(model)
  })
  if (PROXY_ENABLED) {
    KEYLESS_MODELS.forEach((model) => {
      if (!models.some((existing) => existing.provider === model.provider && existing.id === model.id)) models.push(model)
    })
  }

  save(CACHE_KEY, { ts: Date.now(), models } satisfies CacheShape)
  return models
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export interface QueueOptions {
  models: ModelOption[]
  primaryId: string
  visionId: string
  needsVision: boolean
  hasKey: boolean
}

/**
 * Builds the ordered free-model queue for one answer.
 * Keyless mode uses only Pollinations (text). With a key, OpenRouter's free
 * models are tried first and Pollinations stays as the last resort.
 */
export function resolveQueue({ models, primaryId, visionId, needsVision, hasKey }: QueueOptions): QueueItem[] {
  const queue: QueueItem[] = []
  const seen = new Set<string>()
  const push = (provider: QueueItem['provider'], id: string) => {
    const key = `${provider}::${id}`
    if (seen.has(key)) return
    seen.add(key)
    queue.push({ provider, model: id })
  }

  const pollinations = PROXY_ENABLED
    ? models.filter((model) => model.provider === 'pollinations' && (!needsVision || model.vision))
    : []

  if (!hasKey) {
    pollinations.forEach((model) => push(model.provider, model.id))
    if (queue.length === 0 && PROXY_ENABLED) push('pollinations', 'openai-fast')
    return queue
  }

  const openrouter = models.filter((model) => model.provider === 'openrouter' && (!needsVision || model.vision))
  const wantedId = needsVision ? visionId : primaryId
  const primary = openrouter.find((model) => model.id === wantedId)
  if (primary) push(primary.provider, primary.id)

  shuffled(openrouter.filter((model) => model.id !== primary?.id)).forEach((model) => push(model.provider, model.id))

  if (!needsVision) {
    pollinations.forEach((model) => push(model.provider, model.id))
    if (!pollinations.some((model) => model.id === 'openai-fast')) push('pollinations', 'openai-fast')
  }

  return queue
}

export function labelFor(item: QueueItem | null, models: ModelOption[]): string {
  if (!item) return 'auto'
  const found = models.find((model) => model.provider === item.provider && model.id === item.model)
  if (found) return found.label
  if (item.provider === 'pollinations') return `Free public · ${item.model}`
  const short = item.model.split('/').pop()?.replace(':free', '') ?? item.model
  return short
}
