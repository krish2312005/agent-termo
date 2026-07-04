// =============================================================================
// Memory & Timeline Runtime
// =============================================================================

import { readFileSync as readFile, appendFileSync as appendFile, writeFileSync as writeFile, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Memory System ────────────────────────────────────────────────────────────

export async function loadMemory(projectRoot: string): Promise<string> {
  const path = resolve(projectRoot, 'docs', 'MEMORY.md');
  if (!existsSync(path)) return '';
  try {
    return readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

export async function appendToMemory(projectRoot: string, entry: string): Promise<void> {
  const path = resolve(projectRoot, 'docs', 'MEMORY.md');
  const timestamp = new Date().toISOString().split('T')[0];
  appendFile(path, '\n\n## ' + timestamp + '\n\n' + entry, 'utf-8');
}

// ── Timeline System ──────────────────────────────────────────────────────────

const TIMELINE_TEMPLATE =
  '# Project Timeline\n\nThis document tracks the complete chronological history of the project.\n\n---\n\n';

export async function loadTimeline(projectRoot: string): Promise<string> {
  const path = resolve(projectRoot, 'docs', 'TIMELINE.md');
  if (!existsSync(path)) {
    try {
      writeFile(path, TIMELINE_TEMPLATE, 'utf-8');
    } catch {
      // ignore
    }
    return '';
  }
  try {
    return readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

export async function appendToTimeline(
  projectRoot: string,
  agent: string,
  phase: string,
  actions: string[],
  notes: string[] = [],
): Promise<void> {
  const path = resolve(projectRoot, 'docs', 'TIMELINE.md');
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);

  const entry =
    '\n\n---\n\n## [' +
    timestamp +
    '] - ' +
    agent +
    '\n\n### Phase/Activity\n' +
    phase +
    '\n\n### Actions Taken\n' +
    actions.map((a) => '- ' + a).join('\n') +
    '\n\n### Notes\n' +
    (notes.length > 0 ? notes.map((n) => '- ' + n).join('\n') : '- (none)');

  appendFile(path, entry, 'utf-8');
}

export async function logToTimeline(projectRoot: string, message: string): Promise<void> {
  const path = resolve(projectRoot, 'docs', 'TIMELINE.md');
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  appendFile(path, '\n- [' + timestamp + '] ' + message, 'utf-8');
}