import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendSessionArchive,
  createSession,
  saveSession,
  searchSessionHistory,
} from '../../src/runtime/sessions.js';
import type { ConversationMessage } from '../../src/types/index.js';

function message(role: ConversationMessage['role'], content: string): ConversationMessage {
  return { id: role + '-test', role, content, timestamp: new Date() };
}

describe('compacted session archive', () => {
  it('keeps compacted messages searchable after the session is saved', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-session-archive-'));
    try {
      const session = createSession(projectRoot, [
        message('system', 'System prompt'),
        message('user', 'Recent request'),
      ]);
      saveSession(projectRoot, session);
      appendSessionArchive(projectRoot, session.id, [
        message('user', 'We decided to preserve database migration compatibility.'),
        message('tool', 'The migration compatibility test passed.'),
      ]);

      const results = searchSessionHistory(projectRoot, 'migration compatibility', 5);
      expect(results).toHaveLength(2);
      expect(results[0]?.sessionId).toBe(session.id);
      expect(results.every((result) => result.excerpt.includes('migration compatibility'))).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('ignores empty and one-character search queries', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-session-search-'));
    try {
      expect(searchSessionHistory(projectRoot, '')).toEqual([]);
      expect(searchSessionHistory(projectRoot, 'x')).toEqual([]);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
