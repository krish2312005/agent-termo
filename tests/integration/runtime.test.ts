import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendToMemory, logToTimeline, loadTimeline, logAgentTermoTimeline, appendToAgentTermoMemory, loadAgentTermoMemory } from '../../src/memory/index.js';
import { loadAllAgents } from '../../src/agents/index.js';

describe('packaged-project runtime initialization', () => {
  it('creates docs and timeline before logging in an empty project', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-empty-project-'));
    try {
      await logToTimeline(projectRoot, 'startup smoke test');
      await appendToMemory(projectRoot, 'memory smoke test');
      logAgentTermoTimeline('agent log smoke test', projectRoot);

      const timelinePath = join(projectRoot, 'docs', 'TIMELINE.md');
      const memoryPath = join(projectRoot, 'docs', 'MEMORY.md');
      expect(existsSync(timelinePath)).toBe(true);
      expect(existsSync(memoryPath)).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'agents'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'logs'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'docs'))).toBe(true);
      expect(readFileSync(timelinePath, 'utf-8')).toContain('startup smoke test');
      expect(readFileSync(memoryPath, 'utf-8')).toContain('memory smoke test');
      expect(await loadTimeline(projectRoot)).toContain('startup smoke test');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('loads custom agents from the project-local runtime directory', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-custom-agent-'));
    try {
      const agentsDir = join(projectRoot, '.agent-termo', 'agents');
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(join(agentsDir, 'reviewer.md'), `---\ndescription: Review code carefully\ntools: [file:read]\n---\nYou are a focused code reviewer.`, 'utf-8');
      const agents = loadAllAgents(join(projectRoot, '.agent-termo'));
      expect(agents).toHaveLength(1);
      expect(agents[0]?.name).toBe('reviewer');
      expect(agents[0]?.systemPrompt).toContain('focused code reviewer');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('persists the current chat in project-local Agent-Termo memory', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-chat-memory-'));
    try {
      appendToAgentTermoMemory('### User\n\nExplain the architecture', projectRoot);
      appendToAgentTermoMemory('### Assistant\n\nThe project uses layered modules.', projectRoot);
      const memory = loadAgentTermoMemory(projectRoot);
      expect(memory).toContain('Explain the architecture');
      expect(memory).toContain('layered modules');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
