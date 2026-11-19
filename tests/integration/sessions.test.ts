import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createSession,
  forkSession,
  listSessions,
  loadLatestSession,
  loadSession,
  saveSession,
} from '../../src/runtime/sessions.js';
import type { ConversationMessage } from '../../src/types/index.js';

function message(
  role: ConversationMessage['role'],
  content: string,
  extra: Partial<ConversationMessage> = {},
): ConversationMessage {
  return { id: crypto.randomUUID(), role, content, timestamp: new Date(), ...extra };
}

describe('local conversation sessions', () => {
  it('saves and reloads the complete conversation including tool calls and results', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-sessions-'));
    try {
      const toolCall = { id: 'call-1', name: 'file:read', arguments: { path: 'src/main.ts' } };
      const session = createSession(projectRoot, [
        message('system', 'System prompt'),
        message('user', 'Inspect the main entry point'),
        message('assistant', 'I will inspect it.', { toolCalls: [toolCall] }),
        message('tool', 'File contents', { id: 'call-1' }),
        message('assistant', 'The entry point coordinates the REPL.'),
      ]);
      session.currentGoal = 'Inspect the main entry point';
      session.model = 'test-model';
      saveSession(projectRoot, session);

      const loaded = loadSession(projectRoot, session.id);
      expect(loaded).toBeDefined();
      expect(loaded?.messages.map((item) => item.role)).toEqual(['system', 'user', 'assistant', 'tool', 'assistant']);
      expect(loaded?.messages[2]?.toolCalls?.[0]?.arguments).toEqual({ path: 'src/main.ts' });
      expect(loaded?.messages[3]?.content).toBe('File contents');
      expect(loaded?.messages[0]?.timestamp).toBeInstanceOf(Date);
      expect(loaded?.currentGoal).toBe(session.currentGoal);
      expect(loaded?.model).toBe('test-model');
      expect(listSessions(projectRoot)[0]?.title).toBe('Inspect the main entry point');
      expect(loadLatestSession(projectRoot)?.id).toBe(session.id);
      expect(existsSync(join(projectRoot, '.agent-termo', 'sessions', session.id + '.json'))).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('repairs a session stopped in the middle of tool execution', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-interrupted-session-'));
    try {
      const session = createSession(projectRoot, [
        message('system', 'System prompt'),
        message('user', 'Read two files'),
        message('assistant', 'Reading both.', {
          toolCalls: [
            { id: 'call-1', name: 'file:read', arguments: { path: 'a.txt' } },
            { id: 'call-2', name: 'file:read', arguments: { path: 'b.txt' } },
          ],
        }),
        message('tool', 'A contents', { id: 'call-1' }),
      ]);
      saveSession(projectRoot, session);

      const loaded = loadSession(projectRoot, session.id);
      expect(loaded?.messages.slice(-2).map((item) => item.id)).toEqual(['call-1', 'call-2']);
      expect(loaded?.messages.at(-1)?.content).toContain('No tool result was saved');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('forks an independent copy and records its parent', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-fork-session-'));
    try {
      const original = createSession(projectRoot, [
        message('system', 'System prompt'),
        message('user', 'Build a feature'),
      ]);
      saveSession(projectRoot, original);

      const fork = forkSession(projectRoot, original);
      expect(fork.id).not.toBe(original.id);
      expect(fork.parentId).toBe(original.id);
      expect(fork.messages).toHaveLength(original.messages.length);
      fork.messages.push(message('assistant', 'Fork-only response'));
      saveSession(projectRoot, fork);

      expect(loadSession(projectRoot, original.id)?.messages).toHaveLength(2);
      expect(loadSession(projectRoot, fork.id)?.messages).toHaveLength(3);
      expect(listSessions(projectRoot)).toHaveLength(2);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('keeps sessions isolated by project and ignores corrupt snapshots', () => {
    const firstProject = mkdtempSync(join(tmpdir(), 'agent-termo-session-project-a-'));
    const secondProject = mkdtempSync(join(tmpdir(), 'agent-termo-session-project-b-'));
    try {
      const session = createSession(firstProject, [message('user', 'Project A')]);
      saveSession(firstProject, session);
      mkdirSync(join(firstProject, '.agent-termo', 'sessions'), { recursive: true });
      writeFileSync(join(firstProject, '.agent-termo', 'sessions', 'bad-file.json'), '{not json', 'utf-8');

      expect(loadSession(secondProject, session.id)).toBeUndefined();
      expect(listSessions(firstProject)).toHaveLength(1);
      expect(loadSession(firstProject, '../bad-file')).toBeUndefined();
      expect(resolve(session.projectRoot)).toBe(resolve(firstProject));
    } finally {
      rmSync(firstProject, { recursive: true, force: true });
      rmSync(secondProject, { recursive: true, force: true });
    }
  });
});
