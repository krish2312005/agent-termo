// =============================================================================
// Config Management
// =============================================================================

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../types/index.js';

// Find project root reliably (works even when cwd != project dir)
function getProjectRoot(): string {
  // Try import.meta.url first (ESM)
  try {
    const thisFile = fileURLToPath(import.meta.url);
    return dirname(dirname(thisFile)); // src/utils/ → src/ → project root
  } catch {
    // Fall back to process.cwd()
    return process.cwd();
  }
}

// Load .env files at startup
function parseEnvValue(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"') || value.startsWith("'")) {
    const quote = value[0]!;
    const closing = value.lastIndexOf(quote);
    const inner = closing > 0 ? value.slice(1, closing) : value.slice(1);
    return quote === '"'
      ? inner.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\\\/g, '\\').replace(/\\"/g, '"')
      : inner;
  }
  return value.replace(/\s+#.*$/, '').trim();
}

/** Parse common dotenv syntax without overriding explicit process environment values. */
function loadEnvFile(envPath: string): void {
  try {
    const lines = readFileSync(envPath, 'utf-8').split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      let line = lines[index]!.trim();
      if (!line || line.startsWith('#')) continue;
      line = line.replace(/^export\s+/, '');
      const separator = line.indexOf('=');
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;

      let raw = line.slice(separator + 1).trim();
      const quote = raw[0];
      if ((quote === '"' || quote === "'") && raw.lastIndexOf(quote) === 0) {
        const value = [raw.slice(1)];
        let closed = false;
        while (++index < lines.length) {
          const next = lines[index]!;
          const closing = next.lastIndexOf(quote);
          if (closing >= 0) {
            value.push(next.slice(0, closing));
            closed = true;
            break;
          }
          value.push(next);
        }
        if (!closed) continue;
        raw = quote + value.join('\n') + quote;
      }
      process.env[key] = parseEnvValue(raw);
    }
  } catch {
    // Missing .env files are optional; process.env remains authoritative.
  }
}

// Load .env from project root and current directory
const PROJECT_ROOT = getProjectRoot();
loadEnvFile(resolve(PROJECT_ROOT, '.env'));
loadEnvFile(resolve('.env')); // also try cwd

export { PROJECT_ROOT };

export function getAgentTermoDir(): string {
  const envDir = process.env.AGENT_TERMO_DIR;
  if (envDir) {
    return resolve(process.env.HOME || process.env.USERPROFILE || '.', envDir);
  }
  return resolve(process.env.HOME || process.env.USERPROFILE || '.', '.agent-termo');
}

function readStoredConfig(): Record<string, unknown> {
  try {
    const existing: unknown = JSON.parse(
      readFileSync(resolve(getAgentTermoDir(), 'config.json'), 'utf-8'),
    );
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      return existing as Record<string, unknown>;
    }
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
  writeFileSync(configPath, `${JSON.stringify(storedConfig, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });

  // Restrict permissions even when updating an existing file on Unix.
  if (process.platform !== 'win32') chmodSync(configPath, 0o600);
}

function loadStoredNimApiKey(): void {
  if (process.env.NIM_API_KEY) return;

  const { nimApiKey } = readStoredConfig();
  if (typeof nimApiKey === 'string' && nimApiKey.trim()) {
    process.env.NIM_API_KEY = nimApiKey;
  }
}

/**
 * A model picked with /model is saved and wins over NIM_MODEL from .env, so
 * the choice survives restarts. The --model CLI flag still overrides it.
 */
function loadStoredNimModel(): void {
  const { nimModel } = readStoredConfig();
  if (typeof nimModel === 'string' && nimModel.trim()) {
    process.env.NIM_MODEL = nimModel;
	}
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

  return {
    nimApiKey: process.env.NIM_API_KEY ?? '',
    nimBaseUrl: process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    nimModel: process.env.NIM_MODEL ?? 'stepfun-ai/step-3.7-flash',
    agentTermoDir: getAgentTermoDir(),
    logLevel: (process.env.LOG_LEVEL as AppConfig['logLevel']) || 'info',
    confirmDestructive: process.env.CONFIRM_DESTRUCTIVE !== 'false',
    allowedCommands: (
      process.env.ALLOWED_COMMANDS ?? 'git,npm,node,pnpm,yarn,tsx,tsc,npx'
    ).split(','),
    llmTimeout: parseInt(process.env.LLM_TIMEOUT ?? '120000', 10),
    bashTimeout: parseInt(process.env.BASH_TIMEOUT ?? '300000', 10),
  };
}

export function resolveProjectRoot(cwd?: string): string {
  return cwd || PROJECT_ROOT;
}
