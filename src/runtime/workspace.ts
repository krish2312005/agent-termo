import { lstatSync, realpathSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  '.git', '.agent-termo', 'node_modules', 'dist', 'build', 'coverage',
  '.next', '.turbo', '.venv', 'vendor',
]);
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|c|cpp|h|hpp)$/i;
const MAX_CODE_FILE_BYTES = 4 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;
const MAX_SNAPSHOT_FILES = 5000;

/** Resolve existing filesystem ancestors before checking workspace containment. */
export function isWorkspacePath(projectRoot: string, targetPath: string): boolean {
  try {
    const realRoot = realpathSync(resolve(projectRoot));
    const absoluteTarget = isAbsolute(targetPath) ? resolve(targetPath) : resolve(projectRoot, targetPath);
    let probe = absoluteTarget;
    const missingParts: string[] = [];

    while (true) {
      try {
        lstatSync(probe);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
        const parent = dirname(probe);
        if (parent === probe) return false;
        missingParts.unshift(basename(probe));
        probe = parent;
      }
    }

    const realAncestor = realpathSync(probe);
    const resolvedTarget = missingParts.length > 0 ? resolve(realAncestor, ...missingParts) : realAncestor;
    const fromRoot = relative(realRoot, resolvedTarget);
    return fromRoot === '' || (fromRoot !== '..' && !fromRoot.startsWith('..' + sep) && !isAbsolute(fromRoot));
  } catch {
    return false;
  }
}

/** Snapshot only bounded, regular code files; symlinks and generated trees are not followed. */
export function snapshotWorkspaceFiles(projectRoot: string): Map<string, string> {
  const snapshot = new Map<string, string>();
  let totalBytes = 0;

  const walk = (directory: string): void => {
    if (snapshot.size >= MAX_SNAPSHOT_FILES || totalBytes >= MAX_SNAPSHOT_BYTES) return;
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (snapshot.size >= MAX_SNAPSHOT_FILES || totalBytes >= MAX_SNAPSHOT_BYTES) break;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) walk(resolve(directory, entry.name));
        continue;
      }
      if (!entry.isFile() || !CODE_FILE.test(entry.name)) continue;

      const absolute = resolve(directory, entry.name);
      try {
        const stat = lstatSync(absolute);
        if (stat.size > MAX_CODE_FILE_BYTES || totalBytes + stat.size > MAX_SNAPSHOT_BYTES) continue;
        const content = readFileSync(absolute, 'utf8');
        if (content.includes('\0')) continue;
        const relativePath = relative(projectRoot, absolute).split(sep).join('/');
        snapshot.set(relativePath, content);
        totalBytes += stat.size;
      } catch {
        // A file that disappears or becomes unreadable during a snapshot is omitted.
      }
    }
  };

  walk(resolve(projectRoot));
  return snapshot;
}

export function collectWorkspaceChanges(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): Map<string, string> {
  const changes = new Map<string, string>();
  for (const path of before.keys()) if (!after.has(path)) changes.set(path, '');
  for (const [path, content] of after) if (before.get(path) !== content) changes.set(path, content);
  return changes;
}