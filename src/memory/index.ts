// =============================================================================
// Memory & Timeline Runtime
//
// Shared project state lives in <project>/docs. Agent-Termo's private session
// history lives in <project>/.agent-termo/logs so it is never confused with
// the project's MEMORY.md or TIMELINE.md.
// =============================================================================

import { appendFileSync as appendFile, existsSync, mkdirSync, readFileSync as readFile } from 'node:fs';
import { dirname } from 'node:path';
import {
  ensureProjectDocs,
  runtimeTimelinePath,
  sessionLogPath,
} from '../runtime/paths.js';

function readIfExists(path: string): string {
  if (!existsSync(path)) return '';
  try {
    return readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

function appendSafe(path: string, content: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFile(path, content, 'utf-8');
  } catch {
    // Persistence failures must never crash the agent.
  }
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 16);
}

// ── Private session log (.agent-termo/logs/session.md) ──────────────────────

export function loadSessionLog(projectRoot: string): string {
  return readIfExists(sessionLogPath(projectRoot));
}

export function appendToSessionLog(entry: string, projectRoot: string): void {
  const date = new Date().toISOString().split('T')[0];
  appendSafe(sessionLogPath(projectRoot), '\n\n## ' + date + '\n\n' + entry);
}

// ── Private runtime timeline (.agent-termo/logs/timeline.md) ────────────────

export function logAgentTermoTimeline(message: string, projectRoot: string): void {
  appendSafe(runtimeTimelinePath(projectRoot), '\n- [' + timestamp() + '] ' + message);
}

// ── Shared project memory (docs/MEMORY.md) ──────────────────────────────────

export async function loadMemory(projectRoot: string): Promise<string> {
  try {
    const { memoryPath } = ensureProjectDocs(projectRoot);
    return readIfExists(memoryPath);
  } catch {
    return '';
  }
}

export async function appendToMemory(projectRoot: string, entry: string): Promise<void> {
  let path: string;
  try {
    path = ensureProjectDocs(projectRoot).memoryPath;
  } catch {
    return;
  }
  const date = new Date().toISOString().split('T')[0];
  appendSafe(path, '\n\n## ' + date + '\n\n' + entry);
}

// ── Shared project timeline (docs/TIMELINE.md) ──────────────────────────────

export async function loadTimeline(projectRoot: string): Promise<string> {
  try {
    const { timelinePath } = ensureProjectDocs(projectRoot);
    return readIfExists(timelinePath);
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
  let path: string;
  try {
    path = ensureProjectDocs(projectRoot).timelinePath;
  } catch {
    return;
  }

  const entry =
    '\n\n---\n\n## [' +
    timestamp() +
    '] - ' +
    agent +
    '\n\n### Phase/Activity\n' +
    phase +
    '\n\n### Actions Taken\n' +
    actions.map((a) => '- ' + a).join('\n') +
    '\n\n### Notes\n' +
    (notes.length > 0 ? notes.map((n) => '- ' + n).join('\n') : '- (none)');

  appendSafe(path, entry);
}

export async function logToTimeline(projectRoot: string, message: string): Promise<void> {
  let path: string;
  try {
    path = ensureProjectDocs(projectRoot).timelinePath;
  } catch {
    return;
  }
  appendSafe(path, '\n- [' + timestamp() + '] ' + message);
}
