export type ProviderProtocol = 'openai' | 'anthropic';

export interface ProviderDefinition {
  id: string;
  name: string;
  baseUrl: string;
  protocol: ProviderProtocol;
  description: string;
  suggestedModels: string[];
}

export interface StoredProviderConfig extends ProviderDefinition {
  apiKey: string;
  model: string;
}

export const BUILTIN_PROVIDERS: ProviderDefinition[] = [
  { id: 'nvidia', name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', protocol: 'openai', description: 'NVIDIA-hosted models', suggestedModels: ['stepfun-ai/step-3.7-flash', 'meta/llama-3.3-70b-instruct', 'qwen/qwen2.5-coder-32b-instruct'] },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', protocol: 'openai', description: 'GPT models', suggestedModels: ['gpt-6.2-astra', 'gpt-6.1-sol', 'gpt-6-sol'] },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', protocol: 'anthropic', description: 'Claude models · native Messages API', suggestedModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', protocol: 'openai', description: 'Claude, GPT, Gemini and many more', suggestedModels: ['anthropic/claude-sonnet-5-5', 'openai/gpt-6.2-astra'] },
  { id: 'google', name: 'Google AI Studio', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', protocol: 'openai', description: 'Gemini models', suggestedModels: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', protocol: 'openai', description: 'DeepSeek chat and reasoning models', suggestedModels: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', protocol: 'openai', description: 'Fast hosted open models', suggestedModels: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'] },
  { id: 'mistral', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', protocol: 'openai', description: 'Mistral models', suggestedModels: ['mistral-large-latest', 'codestral-latest'] },
  { id: 'xai', name: 'xAI', baseUrl: 'https://api.x.ai/v1', protocol: 'openai', description: 'Grok models', suggestedModels: ['grok-3', 'grok-3-mini'] },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', protocol: 'openai', description: 'Hosted open-source models', suggestedModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-Coder-32B-Instruct'] },
  { id: 'fireworks', name: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1', protocol: 'openai', description: 'Hosted open-source models', suggestedModels: ['accounts/fireworks/models/llama-v3p3-70b-instruct'] },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', protocol: 'openai', description: 'Fast inference models', suggestedModels: ['llama-3.3-70b', 'gpt-oss-120b'] },
  { id: 'custom', name: 'Custom OpenAI-compatible API', baseUrl: '', protocol: 'openai', description: 'Any provider exposing the OpenAI chat completions API', suggestedModels: [] },
];

export function getProviderDefinition(id: string): ProviderDefinition | undefined {
  return BUILTIN_PROVIDERS.find((provider) => provider.id === id);
}

/** A provider counts as connected only when its saved API key is non-empty. */
export function isProviderConnected(provider: Pick<StoredProviderConfig, 'apiKey'> | null | undefined): boolean {
  return typeof provider?.apiKey === 'string' && provider.apiKey.trim().length > 0;
}

/** Model used for a fast switch: the saved model, else the provider's first suggested model. */
export function providerActivationModel(
  provider: Pick<StoredProviderConfig, 'model' | 'suggestedModels'>,
  definition?: Pick<ProviderDefinition, 'suggestedModels'>,
): string {
  return provider.model.trim() || definition?.suggestedModels[0] || provider.suggestedModels[0] || '';
}

export interface ProviderGroupEntry {
  id: string;
  name: string;
  description: string;
  model: string;
  connected: boolean;
  active: boolean;
  saved: StoredProviderConfig | undefined;
}

export interface ProviderGroups {
  connected: ProviderGroupEntry[];
  notConnected: ProviderGroupEntry[];
}

/**
 * Split saved providers and built-ins into connected (saved key) and not connected.
 * A current provider that was never saved (e.g. env-only NVIDIA) is listed as not
 * connected but keeps the active marker.
 */
export function groupProviders(
  saved: StoredProviderConfig[],
  current?: { id: string; name?: string; model?: string },
): ProviderGroups {
  const entries = new Map<string, ProviderGroupEntry>();
  for (const provider of saved) {
    entries.set(provider.id, {
      id: provider.id,
      name: provider.name,
      description: provider.description,
      model: provider.model,
      connected: isProviderConnected(provider),
      active: provider.id === current?.id,
      saved: provider,
    });
  }
  for (const definition of BUILTIN_PROVIDERS) {
    if (entries.has(definition.id)) continue;
    entries.set(definition.id, {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      model: definition.id === current?.id ? (current?.model ?? '') : '',
      connected: false,
      active: definition.id === current?.id,
      saved: undefined,
    });
  }
  if (current && !entries.has(current.id)) {
    entries.set(current.id, {
      id: current.id,
      name: current.name ?? current.id,
      description: '',
      model: current.model ?? '',
      connected: false,
      active: true,
      saved: undefined,
    });
  }
  const all = [...entries.values()];
  return {
    connected: all.filter((provider) => provider.connected),
    notConnected: all.filter((provider) => !provider.connected),
  };
}
