// =============================================================================
// Config Management
// =============================================================================

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../types/index.js';
import type { StoredProviderConfig } from '../llm/providers.js';

// Find project root reliably (works even when cwd != project dir)
function getProjectRoot(): string {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    return dirname(dirname(thisFile));
  } catch {
    return process.cwd();
  }
}

function loadEnvFile(envPath: string): void {
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1 || eqIdx === trimmed.length - 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // file not found — continue silently
  }
}

const PROJECT_ROOT = getProjectRoot();
loadEnvFile(resolve(PROJECT_ROOT, '.env'));
loadEnvFile(resolve('.env'));

export { PROJECT_ROOT };

export function getAgentTermoDir(): string {
  const envDir = process.env.AGENT_TERMO_DIR;
  if (envDir) return resolve(process.env.HOME || process.env.USERPROFILE || '.', envDir);
  return resolve(process.env.HOME || process.env.USERPROFILE || '.', '.agent-termo');
}

function readStoredConfig(): Record<string, unknown> {
  try {
    const existing: unknown = JSON.parse(readFileSync(resolve(getAgentTermoDir(), 'config.json'), 'utf-8'));
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) return existing as Record<string, unknown>;
  } catch {
    // No saved user configuration yet.
  }
  return {};
}

function updateStoredConfig(patch: Record<string, unknown>): void {
  const configDir = getAgentTermoDir();
  const configPath = resolve(configDir, 'config.json');
  const storedConfig = { ...readStoredConfig(), ...patch };
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  writeFileSync(configPath, JSON.stringify(storedConfig, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(configPath, 0o600);
}

function loadStoredNimApiKey(): void {
  if (process.env.NIM_API_KEY) return;
  const { nimApiKey } = readStoredConfig();
  if (typeof nimApiKey === 'string' && nimApiKey.trim()) process.env.NIM_API_KEY = nimApiKey;
}

/** Existing NIM preferences stay backward compatible with older config files. */
function loadStoredNimModel(): void {
  const { nimModel } = readStoredConfig();
  if (typeof nimModel === 'string' && nimModel.trim()) process.env.NIM_MODEL = nimModel;
}

function loadStoredNimThinking(): void {
  const { nimThinking } = readStoredConfig();
  if (typeof nimThinking === 'string' && nimThinking.trim()) process.env.NIM_THINKING = nimThinking;
}

function loadStoredPermissionMode(): void {
  const { permissionMode, autoApprove } = readStoredConfig();
  if (permissionMode === 'ask' || permissionMode === 'files' || permissionMode === 'auto') process.env.AGENT_TERMO_PERMISSION_MODE = permissionMode;
  else if (autoApprove === true) process.env.AGENT_TERMO_PERMISSION_MODE = 'auto';
}

export function listSavedProviders(): StoredProviderConfig[] {
  const stored = readStoredConfig();
  const configured = stored.providers;
  const providers: StoredProviderConfig[] = [];

  if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
    for (const value of Object.values(configured as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const item = value as Partial<StoredProviderConfig>;
      if (
        typeof item.id !== 'string' || typeof item.name !== 'string' ||
        typeof item.baseUrl !== 'string' ||
        (item.protocol !== 'openai' && item.protocol !== 'anthropic') ||
        typeof item.apiKey !== 'string' || typeof item.model !== 'string'
      ) continue;

      providers.push({
        id: item.id,
        name: item.name,
        baseUrl: item.baseUrl,
        protocol: item.protocol,
        description: typeof item.description === 'string' ? item.description : 'Saved API provider',
        suggestedModels: Array.isArray(item.suggestedModels)
          ? item.suggestedModels.filter((model): model is string => typeof model === 'string')
          : [],
        apiKey: item.apiKey,
        model: item.model,
      });
    }
  }

  // Make older installations' saved NIM key selectable after upgrading.
  if (!providers.some((provider) => provider.id === 'nvidia') && typeof stored.nimApiKey === 'string' && stored.nimApiKey.trim()) {
    providers.push({
      id: 'nvidia',
      name: 'NVIDIA NIM',
      baseUrl: typeof stored.nimBaseUrl === 'string' ? stored.nimBaseUrl : process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
      protocol: 'openai',
      description: 'NVIDIA-hosted models',
      suggestedModels: ['stepfun-ai/step-3.7-flash', 'meta/llama-3.3-70b-instruct'],
      apiKey: stored.nimApiKey,
      model: typeof stored.nimModel === 'string' ? stored.nimModel : process.env.NIM_MODEL ?? 'stepfun-ai/step-3.7-flash',
    });
  }

  return providers;
}

export function getActiveProviderId(): string {
  const { activeProvider } = readStoredConfig();
  return typeof activeProvider === 'string' ? activeProvider : 'nvidia';
}

export function saveProviderConfig(provider: StoredProviderConfig, activate = true): void {
  const stored = readStoredConfig();
  const providers = stored.providers && typeof stored.providers === 'object' && !Array.isArray(stored.providers)
    ? stored.providers as Record<string, StoredProviderConfig>
    : {};
  updateStoredConfig({
    providers: { ...providers, [provider.id]: provider },
    ...(activate ? { activeProvider: provider.id } : {}),
  });
  if (activate) {
    process.env.AGENT_TERMO_PROVIDER = provider.id;
    process.env.AGENT_TERMO_API_KEY = provider.apiKey;
    process.env.AGENT_TERMO_BASE_URL = provider.baseUrl;
    process.env.AGENT_TERMO_MODEL = provider.model;
  }
}

export function activateProvider(id: string): StoredProviderConfig | undefined {
  const provider = listSavedProviders().find((item) => item.id === id);
  if (!provider) return undefined;
  updateStoredConfig({ activeProvider: id });
  process.env.AGENT_TERMO_PROVIDER = provider.id;
  process.env.AGENT_TERMO_API_KEY = provider.apiKey;
  process.env.AGENT_TERMO_BASE_URL = provider.baseUrl;
  process.env.AGENT_TERMO_MODEL = provider.model;
  return provider;
}

export function saveNimApiKey(apiKey: string): void {
  updateStoredConfig({ nimApiKey: apiKey });
}

export function saveNimModel(model: string): void {
  updateStoredConfig({ nimModel: model });
}

export function saveNimThinking(thinking: string): void {
  updateStoredConfig({ nimThinking: thinking });
}

export function savePermissionMode(permissionMode: 'ask' | 'files' | 'auto'): void {
  updateStoredConfig({ permissionMode, autoApprove: permissionMode === 'auto' });
}

loadStoredNimApiKey();
loadStoredNimModel();
loadStoredNimThinking();
loadStoredPermissionMode();

export function getConfig(projectRoot: string): AppConfig {
  loadEnvFile(resolve(projectRoot, '.env'));
  const active = listSavedProviders().find((provider) => provider.id === getActiveProviderId());
  if (active && !process.env.AGENT_TERMO_PROVIDER) {
    process.env.AGENT_TERMO_PROVIDER = active.id;
    process.env.AGENT_TERMO_API_KEY = active.apiKey;
    process.env.AGENT_TERMO_BASE_URL = active.baseUrl;
    process.env.AGENT_TERMO_MODEL = active.model;
  }

  return {
    nimApiKey: process.env.NIM_API_KEY ?? '',
    nimBaseUrl: process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    nimModel: process.env.NIM_MODEL ?? 'stepfun-ai/step-3.7-flash',
    agentTermoDir: process.env.AGENT_TERMO_DIR ?? '.claude',
    logLevel: (process.env.LOG_LEVEL as AppConfig['logLevel']) || 'info',
    confirmDestructive: process.env.CONFIRM_DESTRUCTIVE !== 'false',
    allowedCommands: (process.env.ALLOWED_COMMANDS ?? 'git,npm,node,pnpm,yarn,tsx,tsc,npx').split(','),
    llmTimeout: parseInt(process.env.LLM_TIMEOUT ?? '120000', 10),
    bashTimeout: parseInt(process.env.BASH_TIMEOUT ?? '300000', 10),
  };
}

export function resolveProjectRoot(cwd?: string): string {
  return cwd || PROJECT_ROOT;
}
