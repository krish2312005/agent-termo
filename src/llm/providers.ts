export type ProviderProtocol = 'openai' | 'anthropic';

export interface ProviderDefinition {
  id: string;
  name: string;
  baseUrl: string;
  protocol: ProviderProtocol;
  description: string;
}

export interface StoredProviderConfig extends ProviderDefinition {
  apiKey: string;
  model: string;
}

export const BUILTIN_PROVIDERS: ProviderDefinition[] = [
  { id: 'nvidia', name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', protocol: 'openai', description: 'NVIDIA-hosted models' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', protocol: 'openai', description: 'GPT models' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', protocol: 'anthropic', description: 'Claude models · native Messages API' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', protocol: 'openai', description: 'Claude, GPT, Gemini and many more' },
  { id: 'google', name: 'Google AI Studio', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', protocol: 'openai', description: 'Gemini models' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', protocol: 'openai', description: 'DeepSeek chat and reasoning models' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', protocol: 'openai', description: 'Fast hosted open models' },
  { id: 'mistral', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', protocol: 'openai', description: 'Mistral models' },
  { id: 'xai', name: 'xAI', baseUrl: 'https://api.x.ai/v1', protocol: 'openai', description: 'Grok models' },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', protocol: 'openai', description: 'Hosted open-source models' },
  { id: 'fireworks', name: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1', protocol: 'openai', description: 'Hosted open-source models' },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', protocol: 'openai', description: 'Fast inference models' },
  { id: 'custom', name: 'Custom OpenAI-compatible API', baseUrl: '', protocol: 'openai', description: 'Any provider exposing the OpenAI chat completions API' },
];

export function getProviderDefinition(id: string): ProviderDefinition | undefined {
  return BUILTIN_PROVIDERS.find((provider) => provider.id === id);
}
