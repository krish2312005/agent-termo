import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllAgents } from '../agents/index.js';
import type { Agent } from '../types/index.js';
import { ensureTermoFile } from './termo-md.js';
import {
  agentTermoAgentsDir,
  agentTermoCommandsDir,
  agentTermoSkillsDir,
  agentTermoLogsDir,
  agentTermoRoot,
  ensureProjectDocs,
  runtimeTimelinePath,
  sessionLogPath,
} from './paths.js';

export interface AgentFolderResult {
  root: string;
  copiedAgents: number;
  copiedCommands: number;
}

export interface AgentCommand {
  name: string;
  description: string;
  prompt: string;
}

function bundledDefaultRoots(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    resolve(here, '.agent-termo-defaults'),
    resolve(here, 'defaults'),
    resolve(here, '..', '..', 'src', 'runtime', 'defaults'),
  ];
}

function bundledClaudeRoots(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [resolve(here, '.claude'), resolve(here, '..', '.claude'), resolve(process.cwd(), '.claude')];
}

function copyMarkdownDirectory(source: string, target: string): number {
  if (!existsSync(source)) return 0;
  mkdirSync(target, { recursive: true });
  let count = 0;
  for (const file of readdirSync(source)) {
    if (!file.endsWith('.md')) continue;
    const destination = resolve(target, file);
    if (!existsSync(destination)) {
      cpSync(resolve(source, file), destination);
      count++;
    }
  }
  return count;
}

/** Move an old .agent-termo/memory.md or timeline.md to its logs/ location. */
function moveLegacyLog(source: string, target: string): void {
  if (!existsSync(source)) return;
  try {
    const content = readFileSync(source, 'utf-8');
    if (content.trim()) {
      const separator = content.startsWith('\n') ? '' : '\n';
      appendFileSync(target, separator + content + (content.endsWith('\n') ? '' : '\n'), 'utf-8');
    }
    rmSync(source, { force: true });
  } catch {
    // Leave the legacy file alone if it cannot be moved.
  }
}

/** Remove the old generated .agent-termo/docs/README.md wrapper folder. */
function removeLegacyDocsFolder(root: string): void {
  const legacyDocs = resolve(root, 'docs');
  if (!existsSync(legacyDocs)) return;
  try {
    const entries = readdirSync(legacyDocs);
    const generatedReadme =
      entries.length === 1 &&
      entries[0] === 'README.md' &&
      readFileSync(resolve(legacyDocs, 'README.md'), 'utf-8').startsWith('# Agent-Termo Runtime Docs');
    if (entries.length === 0 || generatedReadme) rmSync(legacyDocs, { recursive: true, force: true });
  } catch {
    // Never delete a folder that could contain user files.
  }
}

/**
 * Create the project structure and migrate files written by older versions.
 * Safe to call on every launch: it only creates missing folders and moves
 * known legacy runtime files.
 */
export function ensureAgentStructure(projectRoot: string): string {
  const root = agentTermoRoot(projectRoot);
  mkdirSync(agentTermoAgentsDir(projectRoot), { recursive: true });
  mkdirSync(agentTermoCommandsDir(projectRoot), { recursive: true });
  mkdirSync(agentTermoSkillsDir(projectRoot), { recursive: true });
  mkdirSync(agentTermoLogsDir(projectRoot), { recursive: true });
  ensureProjectDocs(projectRoot);

  moveLegacyLog(resolve(root, 'memory.md'), sessionLogPath(projectRoot));
  moveLegacyLog(resolve(root, 'timeline.md'), runtimeTimelinePath(projectRoot));
  removeLegacyDocsFolder(root);

  return root;
}

export function ensureAgentFolder(projectRoot: string): AgentFolderResult {
  const root = ensureAgentStructure(projectRoot);
  const agents = agentTermoAgentsDir(projectRoot);
  const commands = agentTermoCommandsDir(projectRoot);

  let copiedAgents = 0;
  let copiedCommands = 0;

  // Bring forward legacy Claude assets first, then fill in Agent-Termo defaults.
  // Existing project-specific files always win and are never overwritten.
  for (const bundled of bundledClaudeRoots()) {
    copiedAgents += copyMarkdownDirectory(resolve(bundled, 'agents'), agents);
    copiedCommands += copyMarkdownDirectory(resolve(bundled, 'commands'), commands);
  }

  for (const bundled of bundledDefaultRoots()) {
    copiedAgents += copyMarkdownDirectory(resolve(bundled, 'agents'), agents);
    copiedCommands += copyMarkdownDirectory(resolve(bundled, 'commands'), commands);
    copyMarkdownDirectory(resolve(bundled, 'templates'), resolve(root, 'templates'));
    copyMarkdownDirectory(resolve(bundled, 'workflow'), root);
  }

  ensureTermoFile(projectRoot);
  return { root, copiedAgents, copiedCommands };
}

export function loadProjectAgents(projectRoot: string): Agent[] {
  // Bundled/legacy .claude agents plus project .agent-termo agents. A project
  // agent with the same name overrides the bundled one instead of hiding the
  // rest of the roster.
  const byName = new Map<string, Agent>();
  for (const agent of loadAllAgents(resolve(projectRoot, '.claude'))) byName.set(agent.name, agent);
  for (const agent of loadAllAgents(agentTermoRoot(projectRoot))) byName.set(agent.name, agent);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function loadAgentCommands(projectRoot: string): AgentCommand[] {
  const candidates = [agentTermoCommandsDir(projectRoot), resolve(projectRoot, '.claude', 'commands')];
  for (const directory of candidates) {
    if (!existsSync(directory)) continue;
    const commands = readdirSync(directory)
      .filter((file) => file.endsWith('.md'))
      .map((file) => {
        const raw = readFileSync(resolve(directory, file), 'utf-8');
        return {
          name: file.replace(/\.md$/, ''),
          description: raw.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '',
          prompt: raw.replace(/^---[\s\S]+?---\n/, '').trim(),
        };
      });
    if (commands.length > 0) return commands.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [];
}
