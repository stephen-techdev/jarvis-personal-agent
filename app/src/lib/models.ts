export interface ModelInfo {
  id: string
  label: string
  vision: boolean
  note?: string
}

/** All models below are on OpenRouter's free tier. Availability and rate limits vary. */
export const FREE_MODELS: ModelInfo[] = [
  { id: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 · 26B A4B', vision: true, note: 'balanced default' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 · 31B', vision: true, note: 'smarter, slower' },
  { id: 'particle-ai/particle-1:free', label: 'Particle 1', vision: true, note: 'reliable vision' },
  { id: 'inclusionai/ling-3.2-flash:free', label: 'Ling 3.2 Flash', vision: true, note: '1M context, fast' },
  { id: 'baidu/ernie-5.5-flash-preview:free', label: 'ERNIE 5.5 Flash', vision: false, note: 'quick text + JSON' },
  { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Lightning', vision: false, note: 'fast text' },
  { id: 'nvidia/nemotron-3.5-super-vl:free', label: 'Nemotron 3.5 Super VL', vision: false, note: 'text only in practice' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra 550B', vision: false, note: 'deep reasoning' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nemotron 3 Nano Omni', vision: true, note: 'audio + image + video' },
  { id: 'dots-studio/dots-3-note-preview:free', label: 'Dots 3 Note', vision: true },
  { id: 'recursive/flint-v1.0:free', label: 'Flint v1.0', vision: false },
  { id: 'liquid/lfm-3-1.7b:free', label: 'LFM 3 · 1.7B', vision: false, note: 'tiny + fast' },
  { id: 'cohere/north-mini-code:free', label: 'North Mini Code', vision: false, note: 'coding' },
]

export const DEFAULT_MODEL = 'google/gemma-4-26b-a4b-it:free'
export const DEFAULT_VISION_MODEL = 'particle-ai/particle-1:free'
export const DEFAULT_FAST_MODEL = 'baidu/ernie-5.5-flash-preview:free'

export function modelInfo(id: string): ModelInfo | undefined {
  return FREE_MODELS.find((m) => m.id === id)
}

export function modelLabel(id: string): string {
  return modelInfo(id)?.label ?? id
}

/** Fallback chain: the selected model first, then reliable free alternatives. */
export function buildFallbackChain(primary: string, needsVision: boolean): string[] {
  const base = needsVision
    ? [primary, DEFAULT_VISION_MODEL, 'google/gemma-4-26b-a4b-it:free', 'inclusionai/ling-3.2-flash:free', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free']
    : [primary, DEFAULT_MODEL, 'nvidia/nemotron-3.5-lightning:free', 'inclusionai/ling-3.2-flash:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'recursive/flint-v1.0:free']
  return [...new Set(base.filter(Boolean))]
}
