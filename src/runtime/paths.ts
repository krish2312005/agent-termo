// =============================================================================
// Canonical project paths
//
// One place decides where Agent-Termo keeps its files:
//   <project>/docs/MEMORY.md          shared project memory
//   <project>/docs/TIMELINE.md        shared project timeline
//   <project>/.agent-termo/agents     project agent definitions
//   <project>/.agent-termo/commands   project slash commands
//   <project>/.agent-termo/skills     project skills
//   <project>/.agent-termo/logs       private session/runtime logs
// =============================================================================

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const MEMORY_TEMPLATE = '# Project Memory\n\n## Project Context\n(Add project context here)\n';
export const TIMELINE_TEMPLATE = '# Project Timeline\n\nThis document tracks the complete chronological history of the project.\n\n---\n\n';

export interface ProjectDocsPaths {
  docsDir: string;
  memoryPath: string;
  timelinePath: string;
}

/** Create the shared docs/ files if they do not exist yet. */
export function ensureProjectDocs(projectRoot: string): ProjectDocsPaths {
  const docsDir = resolve(projectRoot, 'docs');
  const memoryPath = resolve(docsDir, 'MEMORY.md');
  const timelinePath = resolve(docsDir, 'TIMELINE.md');

  mkdirSync(docsDir, { recursive: true });
  if (!existsSync(memoryPath)) writeFileSync(memoryPath, MEMORY_TEMPLATE, 'utf-8');
  if (!existsSync(timelinePath)) writeFileSync(timelinePath, TIMELINE_TEMPLATE, 'utf-8');

  return { docsDir, memoryPath, timelinePath };
}

export function agentTermoRoot(projectRoot: string): string {
  return resolve(projectRoot, '.agent-termo');
}

export function agentTermoAgentsDir(projectRoot: string): string {
  return resolve(agentTermoRoot(projectRoot), 'agents');
}

export function agentTermoCommandsDir(projectRoot: string): string {
  return resolve(agentTermoRoot(projectRoot), 'commands');
}

export function agentTermoSkillsDir(projectRoot: string): string {
  return resolve(agentTermoRoot(projectRoot), 'skills');
}

export function agentTermoLogsDir(projectRoot: string): string {
  return resolve(agentTermoRoot(projectRoot), 'logs');
}

/** Private chat/session history. Not a project document. */
export function sessionLogPath(projectRoot: string): string {
  return resolve(agentTermoLogsDir(projectRoot), 'session.md');
}

/** Private low-level runtime activity log. Not the project timeline. */
export function runtimeTimelinePath(projectRoot: string): string {
  return resolve(agentTermoLogsDir(projectRoot), 'timeline.md');
}
