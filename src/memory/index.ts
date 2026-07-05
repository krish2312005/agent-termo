// =============================================================================
// Memory & Timeline Runtime
// =============================================================================

import { readFileSync as readFile, appendFileSync as appendFile, writeFileSync as writeFile, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Agent-Termo Home Memory ──────────────────────────────────────────────────

function ensureAgentTermoDir(): string {
 const dir = resolve(process.env.HOME || process.env.USERPROFILE || '.', '.agent-termo');
 try {
   if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
 } catch {
   // non-fatal; callers will handle missing file
 }
 return dir;
}

const AGENT_TERMO_MEMORY_PATH = resolve(ensureAgentTermoDir(), 'memory.md');

export function loadAgentTermoMemory(): string {
 if (!existsSync(AGENT_TERMO_MEMORY_PATH)) return '';
 try {
   return readFile(AGENT_TERMO_MEMORY_PATH, 'utf-8');
 } catch {
   return '';
 }
}

export function appendToAgentTermoMemory(entry: string): void {
 const timestamp = new Date().toISOString().split('T')[0];
 const content = '\n\n## ' + timestamp + '\n\n' + entry;
 try {
   appendFile(AGENT_TERMO_MEMORY_PATH, content, 'utf-8');
 } catch {
   // ignore persistence failure
 }
}

const AGENT_TERMO_TIMELINE_PATH = resolve(ensureAgentTermoDir(), 'timeline.md');

export function loadAgentTermoTimeline(): string {
 if (!existsSync(AGENT_TERMO_TIMELINE_PATH)) return '';
 try {
   return readFile(AGENT_TERMO_TIMELINE_PATH, 'utf-8');
 } catch {
   return '';
 }
}

export function logAgentTermoTimeline(message: string): void {
 const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
 const entry = '\n- [' + timestamp + '] ' + message;
 try {
   appendFile(AGENT_TERMO_TIMELINE_PATH, entry, 'utf-8');
 } catch {
   // ignore persistence failure
 }
}

// ── Project Memory & Timeline Runtime ──────────────────────────────────────

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

const TIMELINE_TEMPLATE = '# Project Timeline\n\nThis document tracks the complete chronological history of the project.\n\n---\n\n';

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
