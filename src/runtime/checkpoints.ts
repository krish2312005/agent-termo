import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync,
  renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { agentTermoCheckpointsDir } from './paths.js';

export type CheckpointKind = 'automatic' | 'manual' | 'plan';
export type CheckpointStatus = 'active' | 'applied' | 'undone';

interface FileState {
  exists: boolean;
  content?: string;
  mode?: number;
  hash: string;
}
interface CheckpointEntry {
  path: string;
  before: FileState;
  after: FileState;
}
export interface Checkpoint {
  id: string;
  label: string;
  kind: CheckpointKind;
  status: CheckpointStatus;
  createdAt: string;
  updatedAt: string;
  entries: CheckpointEntry[];
}

function checkpointDirectory(projectRoot: string): string {
  return agentTermoCheckpointsDir(projectRoot);
}
function checkpointPath(projectRoot: string, id: string): string {
  if (!/^\\d{3,}$/.test(id)) throw new Error('Invalid checkpoint ID.');
  return resolve(checkpointDirectory(projectRoot), id + '.json');
}
function hashState(exists: boolean, content = '', mode = 0): string {
  return createHash('sha256').update(exists ? String(mode) + '\\0' + content : 'missing').digest('hex');
}
function validateState(value: unknown): value is FileState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return typeof state.exists === 'boolean' && typeof state.hash === 'string' &&
    (!state.exists || typeof state.content === 'string');
}
function parseCheckpoint(value: unknown): Checkpoint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== 'string' || !/^\\d{3,}$/.test(item.id) ||
    typeof item.label !== 'string' ||
    !['automatic', 'manual', 'plan'].includes(String(item.kind)) ||
    !['active', 'applied', 'undone'].includes(String(item.status)) ||
    typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string' ||
    !Array.isArray(item.entries)
  ) return undefined;
  const entries: CheckpointEntry[] = [];
  for (const entryValue of item.entries) {
    if (!entryValue || typeof entryValue !== 'object') return undefined;
    const entry = entryValue as Record<string, unknown>;
    if (typeof entry.path !== 'string' || !validateState(entry.before) || !validateState(entry.after)) return undefined;
    entries.push({ path: entry.path, before: entry.before, after: entry.after });
  }
  return {
    id: item.id, label: item.label, kind: item.kind as CheckpointKind,
    status: item.status as CheckpointStatus, createdAt: item.createdAt,
    updatedAt: item.updatedAt, entries,
  };
}
function saveCheckpoint(projectRoot: string, checkpoint: Checkpoint): void {
  const directory = checkpointDirectory(projectRoot);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const target = checkpointPath(projectRoot, checkpoint.id);
  const temporary = target + '.' + randomUUID() + '.tmp';
  try {
    checkpoint.updatedAt = new Date().toISOString();
    writeFileSync(temporary, JSON.stringify(checkpoint, null, 2) + '\\n', { encoding: 'utf-8', mode: 0o600 });
    renameSync(temporary, target);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* Temporary file may not exist. */ }
    throw error;
  }
}
export function getCheckpoint(projectRoot: string, id: string): Checkpoint | undefined {
  try {
    return parseCheckpoint(JSON.parse(readFileSync(checkpointPath(projectRoot, id), 'utf-8')));
  } catch {
    return undefined;
  }
}
export function listCheckpoints(projectRoot: string): Checkpoint[] {
  const directory = checkpointDirectory(projectRoot);
  if (!existsSync(directory)) return [];
  const checkpoints: Checkpoint[] = [];
  for (const file of readdirSync(directory)) {
    if (!/^\\d{3,}\\.json$/.test(file)) continue;
    const checkpoint = getCheckpoint(projectRoot, file.slice(0, -5));
    if (checkpoint) checkpoints.push(checkpoint);
  }
  return checkpoints.sort((a, b) => Number(b.id) - Number(a.id));
}
export function createCheckpoint(projectRoot: string, label: string, kind: CheckpointKind = 'automatic'): Checkpoint {
  const directory = checkpointDirectory(projectRoot);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  let highest = 0;
  for (const file of readdirSync(directory)) {
    const match = /^(\\d{3,})\\.json$/.exec(file);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  const now = new Date().toISOString();
  const checkpoint: Checkpoint = {
    id: String(highest + 1).padStart(3, '0'),
    label: label.trim().slice(0, 160) || 'Manual checkpoint',
    kind, status: kind === 'manual' ? 'active' : 'applied',
    createdAt: now, updatedAt: now, entries: [],
  };
  saveCheckpoint(projectRoot, checkpoint);
  return checkpoint;
}
function safeRelativePath(projectRoot: string, filePath: string): string {
  const root = resolve(projectRoot);
  const fullPath = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
  const rel = relative(root, fullPath);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new Error('Checkpoint path must be inside the project: ' + filePath);
  }
  const normalized = rel.split(sep).join('/');
  const rootSegment = normalized.split('/')[0]?.toLowerCase();
  if (rootSegment === '.agent-termo' || rootSegment === '.git') {
    throw new Error('Agent-Termo and Git runtime files cannot be included in checkpoints.');
  }
  return normalized;
}
function resolveSafePath(projectRoot: string, relativePath: string): string {
  if (safeRelativePath(projectRoot, relativePath) !== relativePath) {
    throw new Error('Invalid checkpoint file path: ' + relativePath);
  }
  const parts = relativePath.split('/');
  if (parts.length === 0 || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Invalid checkpoint file path: ' + relativePath);
  }
  let current = resolve(projectRoot);
  for (let index = 0; index < parts.length; index++) {
    current = resolve(current, parts[index]!);
    try {
      const info = lstatSync(current);
      if (info.isSymbolicLink()) throw new Error('Refusing to follow a symbolic link: ' + relativePath);
      if (index < parts.length - 1 && !info.isDirectory()) throw new Error('A parent path is not a directory: ' + relativePath);
      if (index === parts.length - 1 && !info.isFile()) throw new Error('Checkpoint target is not a regular file: ' + relativePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
  }
  return current;
}
function captureState(projectRoot: string, relativePath: string): FileState {
  const target = resolveSafePath(projectRoot, relativePath);
  try {
    const info = lstatSync(target);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('Checkpoint target is not a regular file: ' + relativePath);
    const content = readFileSync(target, 'utf-8');
    const mode = info.mode & 0o777;
    return { exists: true, content, mode, hash: hashState(true, content, mode) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false, hash: hashState(false) };
    throw error;
  }
}
function statesMatch(left: FileState, right: FileState): boolean {
  return left.exists === right.exists && left.hash === right.hash;
}
export function recordCheckpointBefore(projectRoot: string, id: string, filePath: string): void {
  const checkpoint = getCheckpoint(projectRoot, id);
  if (!checkpoint || checkpoint.status === 'undone') throw new Error('Checkpoint is not available: #' + id);
  const normalized = safeRelativePath(projectRoot, filePath);
  if (checkpoint.entries.some((entry) => entry.path === normalized)) return;
  const before = captureState(projectRoot, normalized);
  checkpoint.entries.push({ path: normalized, before, after: before });
  saveCheckpoint(projectRoot, checkpoint);
}
export function recordCheckpointAfter(projectRoot: string, id: string, filePath: string): void {
  const checkpoint = getCheckpoint(projectRoot, id);
  if (!checkpoint || checkpoint.status === 'undone') throw new Error('Checkpoint is not available: #' + id);
  const normalized = safeRelativePath(projectRoot, filePath);
  const entry = checkpoint.entries.find((candidate) => candidate.path === normalized);
  if (!entry) throw new Error('File was not recorded before modification: ' + normalized);
  entry.after = captureState(projectRoot, normalized);
  saveCheckpoint(projectRoot, checkpoint);
}
export function activeManualCheckpointIds(projectRoot: string): string[] {
  return listCheckpoints(projectRoot)
    .filter((checkpoint) => checkpoint.kind === 'manual' && checkpoint.status === 'active')
    .map((checkpoint) => checkpoint.id);
}
function restoreState(projectRoot: string, relativePath: string, state: FileState): void {
  const target = resolveSafePath(projectRoot, relativePath);
  if (!state.exists) {
    try { unlinkSync(target); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return;
  }
  if (typeof state.content !== 'string') throw new Error('Checkpoint content is missing for ' + relativePath);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = target + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(temporary, state.content, { encoding: 'utf-8', mode: state.mode ?? 0o644 });
    renameSync(temporary, target);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* Temporary file may not exist. */ }
    throw error;
  }
}
function rebaseActiveManualCheckpoints(projectRoot: string, changedPaths: string[], exceptId: string): void {
  const changed = new Set(changedPaths);
  for (const checkpoint of listCheckpoints(projectRoot)) {
    if (checkpoint.id === exceptId || checkpoint.kind !== 'manual' || checkpoint.status !== 'active') continue;
    let modified = false;
    for (const entry of checkpoint.entries) {
      if (!changed.has(entry.path)) continue;
      entry.after = captureState(projectRoot, entry.path);
      modified = true;
    }
    if (modified) saveCheckpoint(projectRoot, checkpoint);
  }
}
function restoreCheckpoint(projectRoot: string, checkpoint: Checkpoint, direction: 'undo' | 'redo'): Checkpoint {
  const expectedKey = direction === 'undo' ? 'after' : 'before';
  const targetKey = direction === 'undo' ? 'before' : 'after';
  const conflicts: string[] = [];
  for (const entry of checkpoint.entries) {
    if (!statesMatch(captureState(projectRoot, entry.path), entry[expectedKey])) conflicts.push(entry.path);
  }
  if (conflicts.length > 0) {
    throw new Error('Cannot ' + direction + ' checkpoint #' + checkpoint.id +
      ' because these files changed outside the checkpoint: ' + conflicts.slice(0, 8).join(', ') +
      (conflicts.length > 8 ? ', …' : ''));
  }
  const rollback = checkpoint.entries.map((entry) => ({ path: entry.path, state: captureState(projectRoot, entry.path) }));
  const restored: string[] = [];
  try {
    for (const entry of checkpoint.entries) {
      restoreState(projectRoot, entry.path, entry[targetKey]);
      restored.push(entry.path);
    }
  } catch (error) {
    for (const previous of rollback) {
      if (!restored.includes(previous.path)) continue;
      try { restoreState(projectRoot, previous.path, previous.state); } catch { /* Best-effort rollback. */ }
    }
    throw error;
  }
  checkpoint.status = direction === 'undo' ? 'undone' : checkpoint.kind === 'manual' ? 'active' : 'applied';
  saveCheckpoint(projectRoot, checkpoint);
  try { rebaseActiveManualCheckpoints(projectRoot, checkpoint.entries.map((entry) => entry.path), checkpoint.id); }
  catch { /* The completed restore remains valid if an unrelated manual marker cannot be rebased. */ }
  return checkpoint;
}
export function findCheckpoint(projectRoot: string, requestedId: string): Checkpoint | undefined {
  const clean = requestedId.trim().replace(/^#/, '');
  return listCheckpoints(projectRoot).find((checkpoint) =>
    checkpoint.id === clean || checkpoint.id === clean.padStart(3, '0'),
  );
}
export function latestUndoableCheckpoint(projectRoot: string): Checkpoint | undefined {
  return listCheckpoints(projectRoot).find((checkpoint) =>
    (checkpoint.status === 'applied' || checkpoint.status === 'active') && checkpoint.entries.length > 0,
  );
}
export function latestRedoableCheckpoint(projectRoot: string): Checkpoint | undefined {
  return listCheckpoints(projectRoot)
    .filter((checkpoint) => checkpoint.status === 'undone' && checkpoint.entries.length > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
export function undoCheckpoint(projectRoot: string, id: string): Checkpoint {
  const checkpoint = getCheckpoint(projectRoot, id);
  if (!checkpoint || (checkpoint.status !== 'applied' && checkpoint.status !== 'active')) {
    throw new Error('Checkpoint is not available to undo: #' + id);
  }
  if (checkpoint.entries.length === 0) throw new Error('Checkpoint #' + id + ' has no file changes to undo.');
  return restoreCheckpoint(projectRoot, checkpoint, 'undo');
}
export function redoCheckpoint(projectRoot: string, id: string): Checkpoint {
  const checkpoint = getCheckpoint(projectRoot, id);
  if (!checkpoint || checkpoint.status !== 'undone') throw new Error('Checkpoint is not available to redo: #' + id);
  if (checkpoint.entries.length === 0) throw new Error('Checkpoint #' + id + ' has no file changes to redo.');
  return restoreCheckpoint(projectRoot, checkpoint, 'redo');
}
