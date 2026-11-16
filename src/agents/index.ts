// =============================================================================
// Agent Loader + System Prompt Builder
// =============================================================================

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shellDescription } from '../utils/shell.js';
import type { Agent } from '../types/index.js';

function parseAgentMeta(content: string): { description: string; tools: string[] } {
  const descMatch = content.match(/^description:\s*(.+)$/m);
  const toolsMatch = content.match(/^tools:\s*\[(.+)\]/m);
  const toolsStr = toolsMatch?.[1] ?? '';
  const tools = toolsStr
    ? toolsStr.split(',').map((t) => t.trim().replace(/^["']|["']$/g, ''))
    : ['file:read', 'file:write', 'file:edit', 'file:delete', 'file:glob', 'grep', 'bash:execute', 'git:status', 'git:commit', 'git:push', 'git:log'];
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
- When using function calls, use the provided tools directly and respond with the function only — no preamble.

CONVERSATION MODE (default):
Just chat. Say things like "I'm doing well!" or "2+2 is 4." — no tools needed.

TOOL MODE (when asked to code/build/fix files):
Use these functions (JSON tool_calls format):
{"tool_calls":[{"id":"call_1","name":"function_name","arguments":{"key":"value"}}]}

Available functions:
- file:read(path) → read a file
- file:write(path, content) → overwrite a file completely
- file:edit(path, old_string, new_string, replace_all?) → edit a specific, unique section (set replace_all to replace every occurrence)
- file:delete(path) → delete a file after explicit user instruction
- file:glob(pattern) → list files matching a glob (e.g. "src/**/*.ts")
- grep(pattern, path, glob?) → search for text in files
- bash:execute(command) → run a shell command
- git:status() / git:commit(message) / git:push() → version control
- agent:delegate(agent, task, context?) → spawn a specialist sub-agent and receive its result

WORKFLOW CONTINUITY:
- When the user says "continue", resume the interrupted task from the last completed step using the conversation history. Never restart the task from the beginning or redo work that is already done.
- If a step failed, verify the current state of the files (file:read) and continue from there.

DOCUMENTATION DELIVERABLES:
- When the workflow or a delegated agent produces documentation (architecture, progress, design system, etc.), write it as a Markdown file into the project's docs/ directory with file:write (e.g. docs/PROJECT_PROGRESS.md, docs/TECH_STACK.md). Do not merely describe the documentation — actually write the files.
- When the active agent is project-manager, automatically delegate every required specialist task. Emit independent agent:delegate calls together in one response so they run in parallel; do not wait for the user to request delegation.
- Shared project memory and timeline are only docs/MEMORY.md and docs/TIMELINE.md. Never create .agent-termo/docs, .agent-termo/MEMORY.md or .agent-termo/TIMELINE.md; .agent-termo/ is only for agents, commands and private logs.

When done, say "Done: <brief summary>." Preserve relevant findings from earlier messages. If the user asks for a report, create the requested Markdown file with file:write instead of only describing it. For complex work, delegate independent tasks to specialist agents, compare their results, and coordinate the final implementation yourself. Delegated agents can use tools themselves — they read files and write their own deliverables into docs/.

AVAILABLE FILES:
- docs/MEMORY.md — project context
- docs/TIMELINE.md — recent activity log`;

export function buildSystemPrompt(memory: string, timeline: string, agentDir: string, activeAgentPrompt = ''): string {
	let prompt = SYSTEM_BASE;
	prompt += `\n\n## Project Working Directory\n${agentDir}\nAll relative file paths and shell commands must operate inside this directory. Create and modify the user's files here. Never use /tmp, an OS temp directory, the npm package directory, or another workspace for project files.`;
	prompt += `\n\n## Shell\nbash:execute runs commands with ${shellDescription()}. Use syntax that matches this shell, keep paths relative to the project, and prefer the dedicated file tools for creating and editing files.`;

	if (activeAgentPrompt) {
		prompt += '\n\n## Active Custom Agent Instructions\n' + activeAgentPrompt;
	}

  if (memory) {
    prompt += '\n\n## Project Memory\n' + memory;
  }

	if (timeline) {
		prompt += '\n\n## Recent Timeline (last entries)\n' + timeline.slice(-1500);
	}
	prompt += `\n\nFINAL PATH RULE: The only valid project workspace is ${agentDir}. All created or modified project files must be written there. Do not create project files in /tmp or any temporary workspace.`;

	return prompt;
}
