// =============================================================================
// Memory & Timeline Runtime
// =============================================================================

import { readFileSync as readFile, appendFileSync as appendFile, writeFileSync as writeFile, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Agent-Termo Home Memory ──────────────────────────────────────────────────

function ensureAgentTermoDir(projectRoot?: string): string {
 const dir = projectRoot
   ? resolve(projectRoot, '.agent-termo')
   : resolve(process.env.HOME || process.env.USERPROFILE || '.', '.agent-termo');
 try {
   mkdirSync(resolve(dir, 'agents'), { recursive: true });
   mkdirSync(resolve(dir, 'logs'), { recursive: true });
   mkdirSync(resolve(dir, 'docs'), { recursive: true });
 } catch {
   // non-fatal; callers will handle missing file
 }
 return dir;
}

const AGENT_TERMO_MEMORY_PATH = resolve(ensureAgentTermoDir(), 'memory.md');

export function loadAgentTermoMemory(projectRoot?: string): string {
 const path = projectRoot ? resolve(ensureAgentTermoDir(projectRoot), 'memory.md') : AGENT_TERMO_MEMORY_PATH;
 if (!existsSync(path)) return '';
 try {
   return readFile(path, 'utf-8');
 } catch {
   return '';
 }
}

export function appendToAgentTermoMemory(entry: string, projectRoot?: string): void {
 const path = projectRoot ? resolve(ensureAgentTermoDir(projectRoot), 'memory.md') : AGENT_TERMO_MEMORY_PATH;
 const timestamp = new Date().toISOString().split('T')[0];
 const content = '\n\n## ' + timestamp + '\n\n' + entry;
 try {
   appendFile(path, content, 'utf-8');
 } catch {
   // ignore persistence failure
 }
}

const AGENT_TERMO_TIMELINE_PATH = resolve(ensureAgentTermoDir(), 'timeline.md');

export function loadAgentTermoTimeline(projectRoot?: string): string {
 const path = projectRoot ? resolve(ensureAgentTermoDir(projectRoot), 'timeline.md') : AGENT_TERMO_TIMELINE_PATH;
 if (!existsSync(path)) return '';
 try {
   return readFile(path, 'utf-8');
 } catch {
   return '';
 }
}

export function logAgentTermoTimeline(message: string, projectRoot?: string): void {
 const path = projectRoot ? resolve(ensureAgentTermoDir(projectRoot), 'timeline.md') : AGENT_TERMO_TIMELINE_PATH;
 const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
 const entry = '\n- [' + timestamp + '] ' + message;
 try {
   appendFile(path, entry, 'utf-8');
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
 let path: string;
 try {
   path = ensureProjectDocs(projectRoot).memoryPath;
 } catch {
   return;
 }
 const timestamp = new Date().toISOString().split('T')[0];
 try {
   appendFile(path, '\n\n## ' + timestamp + '\n\n' + entry, 'utf-8');
 } catch {
   // Project memory persistence must not crash the agent.
 }
}

// ── Timeline System ──────────────────────────────────────────────────────────

const TIMELINE_TEMPLATE = '# Project Timeline\n\nThis document tracks the complete chronological history of the project.\n\n---\n\n';
const MEMORY_TEMPLATE = '# Project Memory\n\n## Project Context\n(Add project context here)\n';

function ensureProjectDocs(projectRoot: string): { memoryPath: string; timelinePath: string } {
 const docsDir = resolve(projectRoot, 'docs');
 const memoryPath = resolve(docsDir, 'MEMORY.md');
 const timelinePath = resolve(docsDir, 'TIMELINE.md');

 mkdirSync(docsDir, { recursive: true });
 if (!existsSync(memoryPath)) writeFile(memoryPath, MEMORY_TEMPLATE, 'utf-8');
 if (!existsSync(timelinePath)) writeFile(timelinePath, TIMELINE_TEMPLATE, 'utf-8');
 return { memoryPath, timelinePath };
}

export async function loadTimeline(projectRoot: string): Promise<string> {
 let path: string;
 try {
   path = ensureProjectDocs(projectRoot).timelinePath;
 } catch {
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
 let path: string;
 try {
   path = ensureProjectDocs(projectRoot).timelinePath;
 } catch {
   return;
 }
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

 try {
   appendFile(path, entry, 'utf-8');
 } catch {
   // Project logging must never prevent the agent from starting.
 }
}

export async function logToTimeline(projectRoot: string, message: string): Promise<void> {
 let path: string;
 try {
   path = ensureProjectDocs(projectRoot).timelinePath;
 } catch {
   return;
 }
 const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
 try {
   appendFile(path, '\n- [' + timestamp + '] ' + message, 'utf-8');
 } catch {
   // Project logging must never prevent the agent from starting.
 }
}
