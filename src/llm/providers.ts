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
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', protocol: 'openai', description: 'GPT models', suggestedModels: ['gpt-4.1', 'gpt-4.1-mini', 'o4-mini'] },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', protocol: 'anthropic', description: 'Claude models · native Messages API', suggestedModels: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'] },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', protocol: 'openai', description: 'Claude, GPT, Gemini and many more', suggestedModels: ['anthropic/claude-sonnet-4.5', 'openai/gpt-4.1', 'google/gemini-2.5-pro'] },
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
