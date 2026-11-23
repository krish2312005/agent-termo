import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getProviderDefinition,
  groupProviders,
  isProviderConnected,
  providerActivationModel,
  type StoredProviderConfig,
} from '../../src/llm/providers.js';

type ConfigModule = typeof import('../../src/utils/config.js');

const envSnapshot = { ...process.env };
let root = '';
let agentTermoDir = '';
let config: ConfigModule;

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

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'agent-termo-provider-config-'));
  agentTermoDir = join(root, 'agent-termo');
  // Absolute temp dir: config.ts resolves AGENT_TERMO_DIR against HOME and returns it unchanged.
  process.env.AGENT_TERMO_DIR = agentTermoDir;
  delete process.env.AGENT_TERMO_PROVIDER;
  delete process.env.AGENT_TERMO_API_KEY;
  delete process.env.AGENT_TERMO_BASE_URL;
  delete process.env.AGENT_TERMO_MODEL;
  vi.resetModules();
  config = await import('../../src/utils/config.js');
});

afterAll(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
});

describe('saved provider config', () => {
  it('activates a connected provider from its saved key and model without any new input', () => {
    const saved = storedProvider({
      id: 'openai',
      name: 'OpenAI',
      baseUrl: 'https://example.invalid/openai/v1',
      apiKey: 'sk-test-connected-1234',
      model: 'gpt-test-saved',
    });
    config.saveProviderConfig(saved);
    // Prove activation reads the stored config, not values left in the process env.
    process.env.AGENT_TERMO_API_KEY = 'sentinel-not-the-saved-key';
    process.env.AGENT_TERMO_MODEL = 'sentinel-model';

    const activated = config.activateProvider('openai');

    expect(activated).toEqual(saved);
    expect(process.env.AGENT_TERMO_PROVIDER).toBe('openai');
    expect(process.env.AGENT_TERMO_API_KEY).toBe('sk-test-connected-1234');
    expect(process.env.AGENT_TERMO_BASE_URL).toBe(saved.baseUrl);
    expect(process.env.AGENT_TERMO_MODEL).toBe('gpt-test-saved');
    expect(providerActivationModel(activated!, getProviderDefinition('openai'))).toBe('gpt-test-saved');
    expect(config.listSavedProviders().find((provider) => provider.id === 'openai')?.apiKey).toBe('sk-test-connected-1234');
  });

  it('rotates a saved key in place and keeps the provider active', () => {
    const id = 'openrouter';
    const original = storedProvider({
      id,
      name: 'OpenRouter',
      baseUrl: 'https://example.invalid/openrouter/v1',
      apiKey: 'sk-test-old-key',
      model: 'model-old',
    });
    config.saveProviderConfig(original);
    config.saveProviderConfig({ ...original, apiKey: 'sk-test-rotated-key', model: 'model-new' });

    const listed = config.listSavedProviders().filter((provider) => provider.id === id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.apiKey).toBe('sk-test-rotated-key');
    expect(listed[0]?.model).toBe('model-new');
    expect(JSON.stringify(config.listSavedProviders())).not.toContain('sk-test-old-key');

    const configPath = join(agentTermoDir, 'config.json');
    const raw = readFileSync(configPath, 'utf-8');
    const onDisk = JSON.parse(raw) as { activeProvider?: string; providers?: Record<string, { apiKey?: string }> };
    expect(onDisk.activeProvider).toBe(id);
    expect(onDisk.providers?.[id]?.apiKey).toBe('sk-test-rotated-key');
    expect(raw).not.toContain('sk-test-old-key');

    expect(process.env.AGENT_TERMO_PROVIDER).toBe(id);
    expect(process.env.AGENT_TERMO_API_KEY).toBe('sk-test-rotated-key');
    expect(process.env.AGENT_TERMO_BASE_URL).toBe(original.baseUrl);
    expect(process.env.AGENT_TERMO_MODEL).toBe('model-new');
  });

  it.skipIf(process.platform === 'win32')('writes the config file as 0600 inside a 0700 directory', () => {
    config.saveProviderConfig(storedProvider({ id: 'permissions-check' }));

    expect(statSync(join(agentTermoDir, 'config.json')).mode & 0o777).toBe(0o600);
    expect(statSync(agentTermoDir).mode & 0o777).toBe(0o700);
  });

  it('classifies a saved provider with an empty key as not connected', () => {
    const saved = storedProvider({ id: 'anthropic', name: 'Anthropic', apiKey: '', model: 'claude-test' });
    config.saveProviderConfig(saved, false);

    const stored = config.listSavedProviders().find((provider) => provider.id === 'anthropic');
    expect(stored).toBeDefined();
    expect(isProviderConnected(stored)).toBe(false);

    const groups = groupProviders(config.listSavedProviders(), { id: 'nvidia' });
    expect(groups.connected.some((entry) => entry.id === 'anthropic')).toBe(false);
    expect(groups.notConnected.find((entry) => entry.id === 'anthropic')).toMatchObject({
      id: 'anthropic',
      connected: false,
      saved: { apiKey: '' },
    });
  });
});
