import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearSavedContextWindow, getSavedContextWindow, saveContextWindow } from '../../src/utils/config.js';
import { resolveContextBudget } from '../../src/runtime/context.js';

describe('per-model context window settings', () => {
  let home = '';

  afterEach(() => {
    vi.unstubAllEnvs();
    if (home) rmSync(home, { recursive: true, force: true });
    home = '';
  });

  it('persists a separate context size for each model and preserves other config', () => {
    home = mkdtempSync(join(tmpdir(), 'agent-termo-context-config-'));
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    vi.stubEnv('AGENT_TERMO_DIR', '.agent-termo');
    const configDir = join(home, '.agent-termo');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({ nimModel: 'model-a', permissionMode: 'auto' }));

    saveContextWindow('model-a', 256_000);
    saveContextWindow('model-b', 512_000);

    expect(getSavedContextWindow('model-a')).toBe(256_000);
    expect(getSavedContextWindow('model-b')).toBe(512_000);
    expect(resolveContextBudget('model-a', { AGENT_TERMO_CONTEXT_WINDOW: '120000' }).contextWindowTokens).toBe(256_000);
    expect(resolveContextBudget('model-b', {}).contextWindowTokens).toBe(512_000);
    expect(resolveContextBudget('model-c', {}).contextWindowTokens).toBe(190_000);

    const stored = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf-8')) as Record<string, unknown>;
    expect(stored.nimModel).toBe('model-a');
    expect(stored.permissionMode).toBe('auto');
    expect(stored.contextWindows).toEqual({ 'model-a': 256_000, 'model-b': 512_000 });

    clearSavedContextWindow('model-a');
    expect(getSavedContextWindow('model-a')).toBeUndefined();
    expect(resolveContextBudget('model-a', {}).contextWindowTokens).toBe(190_000);
    expect(getSavedContextWindow('model-b')).toBe(512_000);
  });

  it('rejects context sizes below the minimum', () => {
    expect(() => saveContextWindow('model-a', 1_024)).toThrow(/at least 4,096 tokens/);
  });
});
