import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendToMemory, logToTimeline, loadTimeline } from '../../src/memory/index.js';

describe('packaged-project runtime initialization', () => {
  it('creates docs and timeline before logging in an empty project', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-empty-project-'));
    try {
      await logToTimeline(projectRoot, 'startup smoke test');
      await appendToMemory(projectRoot, 'memory smoke test');

      const timelinePath = join(projectRoot, 'docs', 'TIMELINE.md');
      const memoryPath = join(projectRoot, 'docs', 'MEMORY.md');
      expect(existsSync(timelinePath)).toBe(true);
      expect(existsSync(memoryPath)).toBe(true);
      expect(readFileSync(timelinePath, 'utf-8')).toContain('startup smoke test');
      expect(readFileSync(memoryPath, 'utf-8')).toContain('memory smoke test');
      expect(await loadTimeline(projectRoot)).toContain('startup smoke test');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
