// =============================================================================
// Config Management
// =============================================================================

import { readFileSync } from 'node:fs';
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

// Load .env from project root and current directory
const PROJECT_ROOT = getProjectRoot();
loadEnvFile(resolve(PROJECT_ROOT, '.env'));
loadEnvFile(resolve('.env')); // also try cwd

export { PROJECT_ROOT };

export function getConfig(projectRoot: string): AppConfig {
  loadEnvFile(resolve(projectRoot, '.env'));

  return {
    nimApiKey: process.env.NIM_API_KEY ?? '',
    nimBaseUrl: process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    nimModel: process.env.NIM_MODEL ?? 'stepfun-ai/step-3.7-flash',
    agentTermoDir: process.env.AGENT_TERMO_DIR ?? '.claude',
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