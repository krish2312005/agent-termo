// =============================================================================
// NVIDIA NIM model catalogue — curated suggestions + live /v1/models merge
// =============================================================================

export interface ModelInfo {
  id: string;
  note?: string;
}

export interface ProviderModelLimits {
  contextWindowTokens: number;
  maxOutputTokens?: number;
  source: string;
}

/**
 * NVIDIA NIM's /v1/models endpoint returns model IDs, not context limits.
 * Keep only limits verified against NVIDIA's per-model API reference pages.
 * Unlisted live models use the conservative runtime fallback.
 */
export const NVIDIA_NIM_MODEL_LIMITS: Record<string, ProviderModelLimits> = {
  'deepseek-ai/deepseek-r1': {
    contextWindowTokens: 131_072,
    source: 'https://catalog.ngc.nvidia.com/orgs/nim/deepseek-ai/models/deepseek-r1/hf-5dde110-nim-fp8',
  },
  'nvidia/llama-3.1-nemotron-70b-instruct': {
    contextWindowTokens: 131_072,
    maxOutputTokens: 4_096,
    source: 'https://huggingface.co/nvidia/Llama-3.1-Nemotron-70B-Instruct',
  },
  'deepseek-ai/deepseek-v4-pro': {
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 16_384,
    source: 'https://docs.api.nvidia.com/nim/reference/deepseek-ai-deepseek-v4-pro',
  },
  'deepseek-ai/deepseek-v4-flash': {
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 16_384,
    source: 'https://docs.api.nvidia.com/nim/reference/deepseek-ai-deepseek-v4-flash',
  },
  'deepseek-ai/deepseek-v4-flash-0731': {
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 16_384,
    source: 'https://docs.api.nvidia.com/nim/reference/deepseek-ai-deepseek-v4-flash-0731',
  },
  'qwen/qwq-32b': {
    contextWindowTokens: 131_072,
    maxOutputTokens: 4_096,
    source: 'https://docs.api.nvidia.com/nim/reference/qwen-qwq-32b',
  },
  'mistralai/mistral-large-3-675b-instruct-2512': {
    contextWindowTokens: 262_144,
    source: 'https://docs.api.nvidia.com/nim/reference/mistralai-mistral-large-3-675b-instruct-2512',
  },
  'stepfun-ai/step-3.7-flash': {
    contextWindowTokens: 262_144,
    maxOutputTokens: 262_144,
    source: 'https://docs.api.nvidia.com/nim/reference/stepfun-ai-step-3-7-flash',
  },
  'meta/llama-3.1-8b-instruct': {
    contextWindowTokens: 131_072,
    maxOutputTokens: 4_096,
    source: 'https://docs.api.nvidia.com/nim/reference/meta-llama-3_1-8b',
  },
  'meta/llama-3.1-70b-instruct': {
    contextWindowTokens: 131_072,
    maxOutputTokens: 4_096,
    source: 'https://docs.api.nvidia.com/nim/reference/meta-llama-3_1-8b',
  },
  'meta/llama-3.1-405b-instruct': {
    contextWindowTokens: 131_072,
    source: 'https://docs.api.nvidia.com/nim/reference/meta-llama-3_1-8b',
  },
  'meta/llama-3.3-70b-instruct': {
    contextWindowTokens: 131_072,
    maxOutputTokens: 4_096,
    source: 'https://docs.api.nvidia.com/nim/reference/meta-llama-3_3-70b-instruct',
  },
  'qwen/qwen2.5-coder-32b-instruct': {
    contextWindowTokens: 32_768,
    maxOutputTokens: 4_000,
    source: 'https://docs.api.nvidia.com/nim/re/reference/qwen-qwen2_5-coder-32b-instruct',
  },
  'moonshotai/kimi-k2-instruct': {
    contextWindowTokens: 131_072,
    maxOutputTokens: 16_384,
    source: 'https://docs.api.nvidia.com/nim/reference/moonshotai-kimi-k2-instruct',
  },
  'openai/gpt-oss-120b': {
    contextWindowTokens: 128_000,
    maxOutputTokens: 4_096,
    source: 'https://docs.api.nvidia.com/nim/reference/openai-gpt-oss-120b',
  },
  'nvidia/nemotron-3-ultra-550b-a55b': {
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 32_768,
    source: 'https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b',
  },
  'nvidia/nemotron-3.5-super-vl-120b-a12b': {
    contextWindowTokens: 262_144,
    source: 'user-reported: 262K context window',
  },
};

export function getProviderModelLimits(modelId: string): ProviderModelLimits | undefined {
  return NVIDIA_NIM_MODEL_LIMITS[modelId];
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
