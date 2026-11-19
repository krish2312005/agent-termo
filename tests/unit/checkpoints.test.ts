import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  createCheckpoint, findCheckpoint, latestRedoableCheckpoint, latestUndoableCheckpoint,
  listCheckpoints, recordCheckpointAfter, recordCheckpointBefore, redoCheckpoint, undoCheckpoint,
} from '../../src/runtime/checkpoints.js';

const roots: string[] = [];
function project(): string {
  const root = mkdtempSync(resolve(tmpdir(), 'agent-termo-checkpoints-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function applyRecordedChange(root: string, checkpointId: string, path: string, content: string): void {
  recordCheckpointBefore(root, checkpointId, path);
  const target = resolve(root, path);
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, content, 'utf-8');
  recordCheckpointAfter(root, checkpointId, path);
}

describe('checkpoints', () => {
  it('restores original file contents and redoes the change', () => {
    const root = project();
    mkdirSync(resolve(root, 'src'), { recursive: true });
    writeFileSync(resolve(root, 'src/app.ts'), 'before', 'utf-8');
    const checkpoint = createCheckpoint(root, 'Build feature', 'automatic');
    applyRecordedChange(root, checkpoint.id, 'src/app.ts', 'after');

    expect(latestUndoableCheckpoint(root)?.id).toBe(checkpoint.id);
    expect(undoCheckpoint(root, checkpoint.id).status).toBe('undone');
    expect(readFileSync(resolve(root, 'src/app.ts'), 'utf-8')).toBe('before');
    expect(latestRedoableCheckpoint(root)?.id).toBe(checkpoint.id);
    expect(redoCheckpoint(root, checkpoint.id).status).toBe('applied');
    expect(readFileSync(resolve(root, 'src/app.ts'), 'utf-8')).toBe('after');
  });

  it('undoes created files and restores deleted files', () => {
    const root = project();
    writeFileSync(resolve(root, 'remove.txt'), 'original', 'utf-8');
    const checkpoint = createCheckpoint(root, 'Create and delete files');
    applyRecordedChange(root, checkpoint.id, 'new.txt', 'created');
    recordCheckpointBefore(root, checkpoint.id, 'remove.txt');
    rmSync(resolve(root, 'remove.txt'));
    recordCheckpointAfter(root, checkpoint.id, 'remove.txt');

    undoCheckpoint(root, checkpoint.id);
    expect(() => readFileSync(resolve(root, 'new.txt'), 'utf-8')).toThrow();
    expect(readFileSync(resolve(root, 'remove.txt'), 'utf-8')).toBe('original');
    redoCheckpoint(root, checkpoint.id);
    expect(readFileSync(resolve(root, 'new.txt'), 'utf-8')).toBe('created');
    expect(() => readFileSync(resolve(root, 'remove.txt'), 'utf-8')).toThrow();
  });

  it('does not overwrite files changed independently after the checkpoint', () => {
    const root = project();
    writeFileSync(resolve(root, 'app.txt'), 'before', 'utf-8');
    const checkpoint = createCheckpoint(root, 'Safe restore');
    applyRecordedChange(root, checkpoint.id, 'app.txt', 'agent change');
    writeFileSync(resolve(root, 'app.txt'), 'external change', 'utf-8');

    expect(() => undoCheckpoint(root, checkpoint.id)).toThrow(/changed outside the checkpoint/i);
    expect(readFileSync(resolve(root, 'app.txt'), 'utf-8')).toBe('external change');
  });

  it('resolves IDs and prevents snapshots of Agent-Termo runtime or outside paths', () => {
    const root = project();
    const checkpoint = createCheckpoint(root, 'Manual', 'manual');
    expect(findCheckpoint(root, '#' + checkpoint.id)?.id).toBe(checkpoint.id);
    expect(listCheckpoints(root)).toHaveLength(1);
    expect(() => recordCheckpointBefore(root, checkpoint.id, '.agent-termo/sessions/x.json')).toThrow(/runtime files/i);
    expect(() => recordCheckpointBefore(root, checkpoint.id, '../outside.txt')).toThrow(/inside the project/i);
  });
});
