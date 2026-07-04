// =============================================================================
// Agent Loader + System Prompt Builder
// =============================================================================

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Agent } from '../types/index.js';

function parseAgentMeta(content: string): { description: string; tools: string[] } {
  const descMatch = content.match(/^description:\s*(.+)$/m);
  const toolsMatch = content.match(/^tools:\s*\[(.+)\]/m);
  const toolsStr = toolsMatch?.[1] ?? '';
  const tools = toolsStr
    ? toolsStr.split(',').map((t) => t.trim().replace(/^["']|["']$/g, ''))
    : ['file:read', 'file:write', 'file:edit', 'file:glob', 'grep', 'bash:execute', 'git:status', 'git:commit', 'git:push', 'git:log'];
  return { description: descMatch?.[1]?.trim() ?? '', tools };
}

export function loadAgentPrompt(agentName: string, agentDir: string): string | null {
  const candidate = resolve(agentDir, 'agents', agentName + '.md');
  try {
    const content = readFileSync(candidate, 'utf-8');
    const withoutFrontmatter = content.replace(/^---[\s\S]+?---\n/, '');
    return withoutFrontmatter.trim();
  } catch {
    return null;
  }
}

export function loadAllAgents(agentDir: string): Agent[] {
  const agentsDir = resolve(agentDir, 'agents');
  try {
    const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
    const agents: Agent[] = files.map((file) => {
      const agentId = file.replace(/\.md$/, '');
      const content = readFileSync(resolve(agentsDir, file), 'utf-8');
      const meta = parseAgentMeta(content);
      const withoutFrontmatter = content.replace(/^---[\s\S]+?---\n/, '').trim();
      return { name: agentId, description: meta.description, systemPrompt: withoutFrontmatter, tools: meta.tools };
    });
    return agents.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

// =============================================================================
// Agent System Prompt Builder
// =============================================================================

const SYSTEM_BASE = `You are Agent-Termo, a helpful AI assistant in a terminal.

RESPONSE RULES (follow these strictly):
- Be concise and direct. 1-3 sentences for simple questions.
- Never output verbose chain-of-thought or reasoning — just the answer.
- For coding tasks: briefly explain what you did, show key code.
- Never write "null" or placeholders in your response.
- When using function calls, respond with the function only — no preamble.

CONVERSATION MODE (default):
Just chat. Say things like "I'm doing well!" or "2+2 is 4." — no tools needed.

TOOL MODE (when asked to code/build/fix files):
Use these functions (JSON tool_calls format):
{"tool_calls":[{"id":"call_1","name":"function_name","arguments":{"key":"value"}}]}

Available functions:
- file:read(path) → read a file
- file:write(path, content) → overwrite a file completely
- file:edit(path, old_string, new_string) → edit a specific line section
- file:glob(pattern) → list files matching a glob (e.g. "src/**/*.ts")
- grep(pattern, path, glob?) → search for text in files
- bash:execute(command) → run a shell command
- git:status() / git:commit(message) / git:push() → version control

When done, say "Done: <brief summary>."

AVAILABLE FILES:
- docs/MEMORY.md — project context
- docs/TIMELINE.md — recent activity log`;

export function buildSystemPrompt(memory: string, timeline: string, _agentDir: string): string {
  let prompt = SYSTEM_BASE;

  if (memory) {
    prompt += '\n\n## Project Memory\n' + memory;
  }

  if (timeline) {
    prompt += '\n\n## Recent Timeline (last entries)\n' + timeline.slice(-1500);
  }

  return prompt;
}