import { describe, expect, it } from 'vitest';
import { BUILTIN_PROVIDERS, getProviderDefinition } from '../../src/llm/providers.js';

describe('built-in API providers', () => {
  it('has unique provider identifiers', () => {
    const ids = BUILTIN_PROVIDERS.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes direct Anthropic and OpenRouter integrations', () => {
    expect(getProviderDefinition('anthropic')).toMatchObject({
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
    });
    expect(getProviderDefinition('openrouter')).toMatchObject({
      protocol: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
    });
  });

  it('includes a custom OpenAI-compatible endpoint option', () => {
    expect(getProviderDefinition('custom')).toMatchObject({
      protocol: 'openai',
      baseUrl: '',
    });
  });

  it('returns undefined for unknown provider identifiers', () => {
    expect(getProviderDefinition('not-a-provider')).toBeUndefined();
  });
});
