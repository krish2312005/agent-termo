import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureAgentFolder } from '../../src/runtime/agent-folder.js';

describe('Agent-Termo project initialization', () => {
  let projectRoot = '';

  afterEach(() => {
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    projectRoot = '';
  });

  it('can initialize agent tools without creating project docs during a conversation-only session', () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-chat-start-'));

    ensureAgentFolder(projectRoot, { initializeProjectDocs: false });

    expect(existsSync(join(projectRoot, '.agent-termo', 'agents'))).toBe(true);
    expect(existsSync(join(projectRoot, '.agent-termo', 'commands'))).toBe(true);
    expect(existsSync(join(projectRoot, 'docs'))).toBe(false);
    expect(existsSync(join(projectRoot, 'TERMO.md'))).toBe(false);

    // The explicit initialization command retains its previous behavior.
    ensureAgentFolder(projectRoot);
    expect(existsSync(join(projectRoot, 'docs', 'MEMORY.md'))).toBe(true);
    expect(existsSync(join(projectRoot, 'docs', 'TIMELINE.md'))).toBe(true);
    expect(existsSync(join(projectRoot, 'TERMO.md'))).toBe(true);
  });
});
