// =============================================================================
// Agent Loader + System Prompt Builder
// =============================================================================

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shellDescription } from '../utils/shell.js';
import type { Agent, ToolDef } from '../types/index.js';

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
- skill:read(name, path?) → load a relevant skill's SKILL.md or one of its supporting reference files

WORKFLOW CONTINUITY:
- When the user says "continue", resume the interrupted task from the last completed step using the conversation history. Never restart the task from the beginning or redo work that is already done.
- If a step failed, verify the current state of the files (file:read) and continue from there.

QUALITY GATE — MANDATORY FOR CODE AND PROJECT WORK:
- Treat a sub-agent's "done" message as a claim, not proof. The task is incomplete until the actual changed files and validation results have been checked. This is enforced, not just advised: a delegated agent's completion report is automatically rejected if the files it wrote contain stub implementations (e.g. a function body that is only "return null") or if its task implied working code but no test/build/lint/type-check command was ever run during the delegation — in that case agent:delegate returns an error instead of a success, listing exactly what evidence was missing. Do not try to talk around this check or re-delegate the same unfinished work hoping it will pass; fix the actual stub or run the actual check.
- Before implementation, turn the user's request into concrete acceptance criteria. For new projects, define essential user journeys, data rules, error states, and responsive requirements before coding.
- After implementation, inspect the full relevant diff for unfinished placeholders, dead paths, duplicated logic, unsafe casts, missing error handling, hard-coded secrets, inconsistent UI, and changes outside scope.
- Discover the project's package manager from its lockfile and inspect its real scripts. Run relevant tests and every available type-check, lint, and production-build check. Run relevant smoke/E2E tests when configured. Never invent commands or claim a check passed without actual output.
- For UI work, follow design tokens and verify mobile, tablet, and desktop layouts. Exercise navigation, forms, validation, loading, empty, error, and success states. Use existing browser tooling when available; explicitly report when visual/browser verification was not performed.
- The parent agent/project-manager owns the independent final quality gate: after implementation it must run the available \`test-agent\` and \`code-reviewer\`, independently and in parallel where possible. Compare their findings against acceptance criteria rather than accepting summaries blindly.
- Delegated implementation agents must not attempt nested delegation. Run the relevant checks within your own scope, report exact evidence and limitations to the parent, and let the parent coordinate the independent test/review and repair stages.
- Fix reproducible test/build/type/lint failures and critical/high review findings. Send findings to the owning implementation agent, then rerun failed checks and re-review affected code. Repeat up to three repair rounds. If blockers remain, stop and report them honestly; do not call the project complete.
- Never make checks green by deleting tests, weakening assertions, disabling compiler/linter rules, suppressing errors, or replacing real behavior with stubs.
- Final reports must list acceptance criteria, exact verification commands and pass/fail/not-run status, findings resolved, and remaining limitations.

When the active agent is \`project-manager\`, it must run the test-agent and code-reviewer stage after implementation, coordinate repairs, and withhold completion until the gate passes. Apply the same standard to direct coding tasks without a project manager.

DOCUMENTATION DELIVERABLES:
- When the workflow or a delegated agent produces documentation (architecture, progress, design system, etc.), write it as a Markdown file into the project's docs/ directory with file:write (e.g. docs/PROJECT_PROGRESS.md, docs/TECH_STACK.md). Do not merely describe the documentation — actually write the files.
- When the active agent is project-manager, first inspect the relevant project instructions and docs and establish acceptance criteria; then delegate every required specialist task. Emit independent agent:delegate calls together so they can run in parallel.
- A project-manager must not stop at a plan or narration when specialist work is required: after its short context-gathering stage, actually call agent:delegate with exact available agent names and focused tasks.
- Shared project memory and timeline are only docs/MEMORY.md and docs/TIMELINE.md. Never create .agent-termo/docs, .agent-termo/MEMORY.md or .agent-termo/TIMELINE.md; .agent-termo/ is only for agents, commands and private logs.

When done, say "Done: <brief summary>." Preserve relevant findings from earlier messages. If the user asks for a report, create the requested Markdown file with file:write instead of only describing it. For complex work, delegate independent tasks to specialist agents, compare their results, and coordinate the final implementation yourself. Delegated agents can use tools themselves — they read files and write their own deliverables into docs/.

AVAILABLE FILES:
- docs/MEMORY.md — project context
- docs/TIMELINE.md — recent activity log`;

/** Restrict a delegated agent to the tools explicitly declared in its frontmatter. */
export function filterAgentTools(agent: Agent, available: ToolDef[], allowDelegation = false): ToolDef[] {
  const allowed = new Set(agent.tools);
  return available.filter((tool) => allowed.has(tool.name) && (allowDelegation || tool.name !== 'agent:delegate'));
}

const delegateKey = (name: string): string => name.trim().replace(/^@/, '').toLowerCase().replace(/[\s_.]+/g, '-');

/**
 * Read an agent:delegate call tolerantly. Models fill the arguments with the
 * names they know from other tools (subagent_type/prompt, agent_name/…) and
 * vary the case of agent names, so accept those instead of failing the spawn.
 */
export function resolveDelegation(
	args: Record<string, unknown>,
	agents: Agent[],
): { agent: Agent | undefined; requested: string; task: string; context: string } {
	const first = (...keys: string[]): string => {
		for (const key of keys) {
			const value = args[key];
			if (typeof value === 'string' && value.trim()) return value.trim();
		}
		return '';
	};
	const requested = first('agent', 'agent_name', 'agentName', 'subagent_type', 'subagent', 'name');
	const wanted = delegateKey(requested);
	const agent = agents.find((a) => a.name === requested) ?? (wanted ? agents.find((a) => delegateKey(a.name) === wanted) : undefined);
	return { agent, requested, task: first('task', 'prompt', 'instructions', 'description'), context: first('context') };
}

function rosterSection(roster: Array<{ name: string; description: string }>): string {
	const lines = roster.map((a) => {
		const description = a.description.replace(/\s+/g, ' ');
		return `- ${a.name}${description ? ': ' + (description.length > 110 ? description.slice(0, 109) + '…' : description) : ''}`;
	});
	return (
		'\n\n## Available Sub-Agents\n' +
		'Run one with agent:delegate(agent=<exact name below>, task=<focused task>, context=<optional>). ' +
		'Agent instructions that say "Task", "invoke" or "launch" an agent mean exactly this tool call — it is the only way to run a sub-agent, so make the call instead of describing it. ' +
		'Emit independent delegations in the same response so they run in parallel.\n' +
		lines.join('\n')
	);
}

export function buildSystemPrompt(
	memory: string,
	timeline: string,
	agentDir: string,
	activeAgentPrompt = '',
	roster: Array<{ name: string; description: string }> = [],
	termoInstructions = '',
	skillsPrompt = '',
): string {
	let prompt = SYSTEM_BASE;
	prompt += `\n\n## Project Working Directory\n${agentDir}\nAll relative file paths and shell commands must operate inside this directory. Create and modify the user's files here. Never use /tmp, an OS temp directory, the npm package directory, or another workspace for project files.`;
	prompt += `\n\n## Shell\nbash:execute runs commands with ${shellDescription()}. Use syntax that matches this shell, keep paths relative to the project, and prefer the dedicated file tools for creating and editing files.`;

	if (termoInstructions) {
		prompt += '\n\n## Project Instructions (TERMO.md)\n' + termoInstructions;
	}

	if (skillsPrompt) {
		prompt += '\n\n' + skillsPrompt;
	}

	if (activeAgentPrompt) {
		prompt += '\n\n## Active Custom Agent Instructions\n' + activeAgentPrompt;
	}

	if (roster.length > 0) prompt += rosterSection(roster);

  if (memory) {
    prompt += '\n\n## Project Memory\n' + memory;
  }

	if (timeline) {
		prompt += '\n\n## Recent Timeline (last entries)\n' + timeline.slice(-1500);
	}
	prompt += `\n\nFINAL PATH RULE: The only valid project workspace is ${agentDir}. All created or modified project files must be written there. Do not create project files in /tmp or any temporary workspace.`;

	return prompt;
}
