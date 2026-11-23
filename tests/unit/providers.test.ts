import { describe, expect, it } from 'vitest';
import {
  BUILTIN_PROVIDERS,
  getProviderDefinition,
  groupProviders,
  isProviderConnected,
  providerActivationModel,
  type StoredProviderConfig,
} from '../../src/llm/providers.js';

function storedProvider(overrides: Partial<StoredProviderConfig> & Pick<StoredProviderConfig, 'id'>): StoredProviderConfig {
  return {
    id: overrides.id,
    name: overrides.id,
    baseUrl: 'https://example.invalid/v1',
    protocol: 'openai',
    description: 'Test provider',
    suggestedModels: ['test-suggested-model'],
    apiKey: 'sk-test-connected-1234',
    model: 'test-saved-model',
    ...overrides,
  };
}

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

describe('isProviderConnected', () => {
  it('requires a non-empty saved API key', () => {
    expect(isProviderConnected({ apiKey: 'sk-test-connected-1234' })).toBe(true);
    expect(isProviderConnected({ apiKey: '' })).toBe(false);
    expect(isProviderConnected({ apiKey: '   ' })).toBe(false);
    expect(isProviderConnected({ apiKey: '\t\n' })).toBe(false);
  });

  it('treats a missing provider as not connected', () => {
    expect(isProviderConnected(null)).toBe(false);
    expect(isProviderConnected(undefined)).toBe(false);
  });
});

describe('providerActivationModel', () => {
  it('prefers the saved model', () => {
    expect(
      providerActivationModel(
        { model: 'saved-model', suggestedModels: ['provider-suggested'] },
        { suggestedModels: ['definition-suggested'] },
      ),
    ).toBe('saved-model');
  });

  it('falls back to the definition suggestion, then the stored suggestion', () => {
    expect(
      providerActivationModel(
        { model: '  ', suggestedModels: ['provider-suggested'] },
        { suggestedModels: ['definition-suggested'] },
      ),
    ).toBe('definition-suggested');
    expect(providerActivationModel({ model: '', suggestedModels: ['provider-suggested'] })).toBe('provider-suggested');
  });

  it('returns an empty string when no model is known', () => {
    expect(providerActivationModel({ model: '', suggestedModels: [] })).toBe('');
  });
});

describe('groupProviders', () => {
  it('puts a saved provider with a key under Connected only', () => {
    const saved = storedProvider({ id: 'openai', name: 'OpenAI' });
    const groups = groupProviders([saved]);

    expect(groups.connected).toHaveLength(1);
    expect(groups.connected[0]).toMatchObject({ id: 'openai', name: 'OpenAI', connected: true, active: false });
    expect(groups.connected[0]?.saved).toBe(saved);
    expect(groups.notConnected.some((entry) => entry.id === 'openai')).toBe(false);
  });

  it('keeps saved providers with empty or whitespace keys under Not connected', () => {
    const empty = storedProvider({ id: 'empty-key', apiKey: '' });
    const blank = storedProvider({ id: 'blank-key', apiKey: '   ' });
    const groups = groupProviders([empty, blank]);

    expect(groups.connected).toHaveLength(0);
    expect(groups.notConnected.find((entry) => entry.id === 'empty-key')).toMatchObject({ connected: false, saved: empty });
    expect(groups.notConnected.find((entry) => entry.id === 'blank-key')).toMatchObject({ connected: false, saved: blank });
  });

  it('lists unsaved built-ins as Not connected', () => {
    const groups = groupProviders([]);

    expect(groups.connected).toHaveLength(0);
    expect(new Set(groups.notConnected.map((entry) => entry.id))).toEqual(new Set(BUILTIN_PROVIDERS.map((definition) => definition.id)));
    for (const entry of groups.notConnected) {
      expect(entry.connected).toBe(false);
      expect(entry.saved).toBeUndefined();
      expect(entry.model).toBe('');
    }
  });

  it('puts a saved custom endpoint under Connected', () => {
    const custom = storedProvider({ id: 'custom-my-gateway', name: 'My Gateway', baseUrl: 'https://example.invalid/gateway/v1' });
    const groups = groupProviders([custom]);

    expect(groups.connected.map((entry) => entry.id)).toEqual(['custom-my-gateway']);
    expect(groups.notConnected.some((entry) => entry.id === 'custom-my-gateway')).toBe(false);
  });

  it('marks the current provider active within its group', () => {
    const openai = storedProvider({ id: 'openai' });
    const anthropic = storedProvider({ id: 'anthropic', name: 'Anthropic' });
    const groups = groupProviders([openai, anthropic], { id: 'anthropic' });

    expect(groups.connected.find((entry) => entry.id === 'anthropic')?.active).toBe(true);
    expect(groups.connected.find((entry) => entry.id === 'openai')?.active).toBe(false);
    expect(groups.notConnected.every((entry) => entry.active === false)).toBe(true);
  });

  it('appends an unsaved env-only current provider under Not connected with the active marker', () => {
    const groups = groupProviders([], { id: 'acme-gateway', name: 'Acme Gateway', model: 'acme-large' });
    const current = groups.notConnected.find((entry) => entry.id === 'acme-gateway');

    expect(current).toMatchObject({
      id: 'acme-gateway',
      name: 'Acme Gateway',
      model: 'acme-large',
      connected: false,
      active: true,
    });
    expect(current?.saved).toBeUndefined();
    expect(groups.notConnected.filter((entry) => entry.id === 'acme-gateway')).toHaveLength(1);
  });

  it('uses the current model for an unsaved active built-in', () => {
    const groups = groupProviders([], { id: 'nvidia', model: 'nvidia-env-model' });

    expect(groups.notConnected.find((entry) => entry.id === 'nvidia')).toMatchObject({
      model: 'nvidia-env-model',
      connected: false,
      active: true,
    });
  });

  it('dedupes ids and keeps the saved entry over the built-in definition', () => {
    const saved = storedProvider({ id: 'openai', name: 'My OpenAI' });
    const groups = groupProviders([saved]);
    const openaiEntries = [...groups.connected, ...groups.notConnected].filter((entry) => entry.id === 'openai');

    expect(openaiEntries).toHaveLength(1);
    expect(openaiEntries[0]?.name).toBe('My OpenAI');
    expect(openaiEntries[0]?.saved).toBe(saved);

    const first = storedProvider({ id: 'custom-dup', apiKey: 'sk-test-first-1234' });
    const second = storedProvider({ id: 'custom-dup', apiKey: 'sk-test-second-5678' });
    const duplicateGroups = groupProviders([first, second]);
    const duplicateEntries = [...duplicateGroups.connected, ...duplicateGroups.notConnected].filter((entry) => entry.id === 'custom-dup');

    expect(duplicateEntries).toHaveLength(1);
  });
});
