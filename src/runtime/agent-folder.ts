import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export function ensureAgentFolder(projectRoot: string): AgentFolderResult {
  const root = resolve(projectRoot, '.agent-termo');
  const agents = resolve(root, 'agents');
  const commands = resolve(root, 'commands');
  const docs = resolve(root, 'docs');
  mkdirSync(docs, { recursive: true });
  mkdirSync(resolve(root, 'logs'), { recursive: true });
  mkdirSync(agents, { recursive: true });
  mkdirSync(commands, { recursive: true });
	if (!existsSync(resolve(root, 'memory.md'))) writeFileSync(resolve(root, 'memory.md'), '# Agent-Termo Memory\n', 'utf-8');
	if (!existsSync(resolve(root, 'timeline.md'))) writeFileSync(resolve(root, 'timeline.md'), '# Agent-Termo Timeline\n', 'utf-8');
	if (!existsSync(resolve(docs, 'README.md'))) writeFileSync(resolve(docs, 'README.md'), '# Agent-Termo Runtime Docs\n\nThis folder contains project-local Agent-Termo runtime documentation.\n', 'utf-8');

  let copiedAgents = 0;
  let copiedCommands = 0;
  for (const bundled of bundledClaudeRoots()) {
    if (copiedAgents === 0) copiedAgents = copyMarkdownDirectory(resolve(bundled, 'agents'), agents);
    if (copiedCommands === 0) copiedCommands = copyMarkdownDirectory(resolve(bundled, 'commands'), commands);
    if (copiedAgents > 0 && copiedCommands > 0) break;
  }

  return { root, copiedAgents, copiedCommands };
}

export function loadAgentCommands(projectRoot: string): AgentCommand[] {
  const candidates = [resolve(projectRoot, '.agent-termo', 'commands'), resolve(projectRoot, '.claude', 'commands')];
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
