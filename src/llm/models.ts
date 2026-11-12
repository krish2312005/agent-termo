// =============================================================================
// NVIDIA NIM model catalogue — curated suggestions + live /v1/models merge
// =============================================================================

export interface ModelInfo {
  id: string;
  note?: string;
}

/**
 * Hand-picked chat/coding models worth surfacing first. This list is only a
 * starting point: when the live catalogue is reachable, entries NIM no longer
 * serves are dropped, and everything else NIM returns is still selectable.
 */
export const CURATED_MODELS: ModelInfo[] = [
  { id: 'stepfun-ai/step-3.7-flash', note: 'default' },
  { id: 'meta/llama-3.1-8b-instruct', note: 'fast, low cost' },
  { id: 'meta/llama-3.1-70b-instruct', note: 'balanced' },
  { id: 'meta/llama-3.3-70b-instruct', note: 'balanced' },
  { id: 'meta/llama-3.1-405b-instruct', note: 'highest quality Llama' },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', note: 'NVIDIA tuned' },
  { id: 'qwen/qwen2.5-coder-32b-instruct', note: 'coding' },
  { id: 'deepseek-ai/deepseek-r1', note: 'reasoning' },
  { id: 'moonshotai/kimi-k2-instruct', note: 'agentic / tool use' },
  { id: 'openai/gpt-oss-120b', note: 'open-weight GPT' },
];

// NIM serves embedding, vision, speech and other non-chat models from the same
// endpoint. Hide the obvious ones so the picker stays about chat models.
const NON_CHAT =
  /embed|rerank|retriev|reward|guard|safety|parse|clip|vila|neva|fuyu|kosmos|paligemma|deplot|riva|asr|tts|whisper|diffusion|sdxl|flux|cosmos|segment|bge-|e5-|gliner|pii|streampetr|ocdrnet|bevformer/i;

export function isChatModel(id: string): boolean {
  return !NON_CHAT.test(id);
}

/**
 * Build the picker list.
 * - live === null: the catalogue could not be fetched, so offer the curated list.
 * - otherwise: curated entries that NIM serves first, then the rest of the live
 *   chat models alphabetically.
 */
export function mergeModels(live: string[] | null): ModelInfo[] {
  if (!live) return [...CURATED_MODELS];

  const liveSet = new Set(live);
  const curated = CURATED_MODELS.filter((m) => liveSet.has(m.id));
  const curatedIds = new Set(curated.map((m) => m.id));
  const rest = live
    .filter((id) => !curatedIds.has(id) && isChatModel(id))
    .sort((a, b) => a.localeCompare(b))
    .map((id): ModelInfo => ({ id }));

  return [...curated, ...rest];
}
