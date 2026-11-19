import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendToMemory,
  appendToSessionLog,
  loadSessionLog,
  loadTimeline,
  logAgentTermoTimeline,
  logToTimeline,
} from '../../src/memory/index.js';
import { loadAllAgents } from '../../src/agents/index.js';
import { ensureAgentFolder, ensureAgentStructure, loadProjectAgents } from '../../src/runtime/agent-folder.js';

describe('packaged-project runtime initialization', () => {
  it('keeps project docs outside .agent-termo and private logs inside it', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-empty-project-'));
    try {
      ensureAgentFolder(projectRoot);
      await logToTimeline(projectRoot, 'startup smoke test');
      await appendToMemory(projectRoot, 'memory smoke test');
      appendToSessionLog('### User\n\nsession smoke test', projectRoot);
      logAgentTermoTimeline('agent log smoke test', projectRoot);

      const timelinePath = join(projectRoot, 'docs', 'TIMELINE.md');
      const memoryPath = join(projectRoot, 'docs', 'MEMORY.md');
      expect(existsSync(timelinePath)).toBe(true);
      expect(existsSync(memoryPath)).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'agents'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'commands'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'skills'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'logs'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'agents', 'project-manager.md'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'agents', 'architect.md'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'commands', 'build.md'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'commands', 'new-agent.md'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'templates', 'agent.md'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'workflow.md'))).toBe(true);
      expect(readFileSync(join(projectRoot, '.agent-termo', 'workflow.md'), 'utf-8')).toContain('## Build flow');
      expect(existsSync(join(projectRoot, 'TERMO.md'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'docs'))).toBe(false);
      expect(existsSync(join(projectRoot, '.agent-termo', 'memory.md'))).toBe(false);
      expect(existsSync(join(projectRoot, '.agent-termo', 'timeline.md'))).toBe(false);

      expect(readFileSync(timelinePath, 'utf-8')).toContain('startup smoke test');
      expect(readFileSync(memoryPath, 'utf-8')).toContain('memory smoke test');
      expect(readFileSync(join(projectRoot, '.agent-termo', 'logs', 'session.md'), 'utf-8')).toContain('session smoke test');
      expect(readFileSync(join(projectRoot, '.agent-termo', 'logs', 'timeline.md'), 'utf-8')).toContain('agent log smoke test');
      expect(readFileSync(timelinePath, 'utf-8')).not.toContain('agent log smoke test');
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

  it('merges bundled and project agents so one custom agent does not hide the rest', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-agent-merge-'));
    try {
      mkdirSync(join(projectRoot, '.claude', 'agents'), { recursive: true });
      mkdirSync(join(projectRoot, '.agent-termo', 'agents'), { recursive: true });
      writeFileSync(join(projectRoot, '.claude', 'agents', 'base.md'), 'You are the bundled base agent.', 'utf-8');
      writeFileSync(join(projectRoot, '.claude', 'agents', 'shared.md'), 'You are the bundled shared agent.', 'utf-8');
      writeFileSync(join(projectRoot, '.agent-termo', 'agents', 'custom.md'), 'You are the project custom agent.', 'utf-8');
      writeFileSync(join(projectRoot, '.agent-termo', 'agents', 'shared.md'), 'You are the project shared agent.', 'utf-8');

      const agents = loadProjectAgents(projectRoot);
      expect(agents.map((agent) => agent.name)).toEqual(['base', 'custom', 'shared']);
      expect(agents.find((agent) => agent.name === 'shared')?.systemPrompt).toContain('project shared');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('persists the current chat only in the private session log', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-chat-memory-'));
    try {
      appendToSessionLog('### User\n\nExplain the architecture', projectRoot);
      appendToSessionLog('### Assistant\n\nThe project uses layered modules.', projectRoot);

      expect(loadSessionLog(projectRoot)).toContain('Explain the architecture');
      expect(loadSessionLog(projectRoot)).toContain('layered modules');
      expect(existsSync(join(projectRoot, '.agent-termo', 'logs', 'session.md'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'memory.md'))).toBe(false);
      expect(existsSync(join(projectRoot, 'docs', 'MEMORY.md'))).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('scaffolds agents, commands, logs and shared docs in one layout', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-folder-'));
    try {
      const result = ensureAgentFolder(projectRoot);
      expect(existsSync(join(projectRoot, '.agent-termo', 'agents'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'commands'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'logs'))).toBe(true);
      expect(existsSync(join(projectRoot, 'docs', 'MEMORY.md'))).toBe(true);
      expect(existsSync(join(projectRoot, 'docs', 'TIMELINE.md'))).toBe(true);
      expect(existsSync(join(projectRoot, '.agent-termo', 'docs'))).toBe(false);
      expect(existsSync(join(projectRoot, '.agent-termo', 'memory.md'))).toBe(false);
      expect(existsSync(join(projectRoot, '.agent-termo', 'timeline.md'))).toBe(false);
      expect(result.root).toBe(join(projectRoot, '.agent-termo'));
      const agents = loadProjectAgents(projectRoot);
      expect(agents).toHaveLength(10);
      expect(agents.some((agent) => agent.name === 'code-reviewer')).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('migrates legacy .agent-termo docs and memory files into the canonical layout', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-migrate-'));
    try {
      const oldRoot = join(projectRoot, '.agent-termo');
      mkdirSync(join(oldRoot, 'docs'), { recursive: true });
      writeFileSync(join(oldRoot, 'memory.md'), '### User\n\nold session entry', 'utf-8');
      writeFileSync(join(oldRoot, 'timeline.md'), '- old runtime entry', 'utf-8');
      writeFileSync(join(oldRoot, 'docs', 'README.md'), '# Agent-Termo Runtime Docs\n\nGenerated wrapper.\n', 'utf-8');

      ensureAgentFolder(projectRoot);

      expect(existsSync(join(oldRoot, 'memory.md'))).toBe(false);
      expect(existsSync(join(oldRoot, 'timeline.md'))).toBe(false);
      expect(existsSync(join(oldRoot, 'docs'))).toBe(false);
      expect(readFileSync(join(oldRoot, 'logs', 'session.md'), 'utf-8')).toContain('old session entry');
      expect(readFileSync(join(oldRoot, 'logs', 'timeline.md'), 'utf-8')).toContain('old runtime entry');
      expect(existsSync(join(projectRoot, 'docs', 'MEMORY.md'))).toBe(true);
      expect(existsSync(join(projectRoot, 'docs', 'TIMELINE.md'))).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('does not overwrite existing project docs', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-keep-docs-'));
    try {
      mkdirSync(join(projectRoot, 'docs'), { recursive: true });
      writeFileSync(join(projectRoot, 'docs', 'MEMORY.md'), '# Custom memory\n', 'utf-8');
      ensureAgentStructure(projectRoot);
      expect(readFileSync(join(projectRoot, 'docs', 'MEMORY.md'), 'utf-8')).toBe('# Custom memory\n');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
