// =============================================================================
// Agent-Termo — Main REPL entry point
// =============================================================================

import { NimClient, fromWireToolName, type ThinkingCapacity } from './llm/client.js';
import { TOOL_DEFINITIONS } from './llm/tools.js';
import { executeTool, applyFileChange } from './tools/index.js';
import { loadMemory, logToTimeline, logAgentTermoTimeline, appendToAgentTermoMemory } from './memory/index.js';
import { loadAllAgents } from './agents/index.js';
import { buildSystemPrompt } from './agents/index.js';
import { resolveProjectRoot, saveNimModel, saveNimThinking } from './utils/config.js';
import { resolve } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { ensureAgentFolder, loadAgentCommands, type AgentCommand } from './runtime/agent-folder.js';
import {
	MarkdownPrinter,
	printWelcome,
	printUserMessage,
	printAssistantMessage,
	printToolCall,
	printToolResult,
	printError,
	printSuccess,
	printInfo,
	printHelp,
	printAgentsList,
	printMemoryFile,
	printTimelineFile,
	startSpinner,
	stopSpinner,
	clearScreen,
	createInput,
	initScreen,
	pick,
	setScreenStatus,
	promptAcceptReject,
	listenKeys,
	setAgentNames,
	setNextInput,
	setCommands,
	COMMANDS,
	setContextFiles,
} from './ui/index.js';
import type { ConversationMessage, ToolCall, ToolResult, ProposedFileChange } from './types/index.js';

const TOOL_KEYWORDS = [
	'build', 'create', 'write', 'edit', 'modify', 'file', 'code', 'function', 'class',
	'component', 'debug', 'fix', 'git', 'commit', 'push', 'install', 'npm', 'run',
	'bash', 'shell', 'command', 'read', 'grep', 'check', 'show', 'implement',
	'configure', 'setup', 'src', 'package', 'app', 'project', 'api', 'deploy',
	'test', 'compile', 'typescript', 'javascript', 'python', 'node', 'add', 'delete', 'report', 'analyze', 'analysis', 'bug', 'issue', 'sub-agent', 'subagent', 'delegate',
];

function discoverProjectFiles(projectRoot: string): string[] {
	const files: string[] = [];
	const ignored = new Set(['.git', 'node_modules', '.agent-termo', 'dist', 'build', 'coverage']);
	const walk = (directory: string, depth: number): void => {
		if (depth > 4 || files.length >= 500) return;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (ignored.has(entry.name) || entry.name.startsWith('.')) continue;
			const full = resolve(directory, entry.name);
			if (entry.isDirectory()) walk(full, depth + 1);
			else files.push(full.slice(projectRoot.length + 1));
			if (files.length >= 500) return;
		}
	};
	try { walk(projectRoot, 0); } catch { /* inaccessible directories are omitted */ }
	return files;
}

function expandContextMentions(input: string, projectRoot: string, contextFiles: string[]): { text: string; attached: string[] } {
	const attached: string[] = [];
	const text = input.replace(/(^|\s)@([^\s]+)/g, (whole, prefix: string, name: string) => {
		if (!contextFiles.includes(name)) return whole;
		try {
			const content = readFileSync(resolve(projectRoot, name), 'utf-8').slice(0, 30_000);
				attached.push(`## Attached file: ${name}\n\n\`\`\`\n${content}\n\`\`\``);
			return prefix;
		} catch {
			return whole;
		}
	});
	return { text: text.trim() || (attached.length > 0 ? 'Inspect the attached project files and summarize the relevant context.' : input), attached };
}

function mightNeedTools(message: string): boolean {
	const lower = message.toLowerCase();
	return TOOL_KEYWORDS.some((w) => lower.includes(w));
}

function dedup(arr: ToolCall[]): ToolCall[] {
	const seen = new Set<string>();
	return arr.filter((tc) => {
		if (seen.has(tc.id)) return false;
		seen.add(tc.id);
		return true;
	});
}

class RequestCancelledError extends Error {
	constructor() {
		super('Request cancelled');
		this.name = 'RequestCancelledError';
	}
}

function isRequestCancelled(err: unknown): boolean {
	return err instanceof RequestCancelledError || (err instanceof Error && /abort|cancel/i.test(err.name + ' ' + err.message));
}

async function withEscapeCancellation<T>(nimClient: NimClient, operation: () => Promise<T>): Promise<T> {
	if (!process.stdin.isTTY) return operation();
	let cancelled = false;
	const stop = listenKeys((key) => {
		if (key.name === 'escape' || key.name === 'ctrl+c') {
			cancelled = true;
			nimClient.cancelCurrentRequest();
			printInfo(key.name === 'ctrl+c' ? 'Response interrupted.' : 'Response cancelled.');
		}
	});
	try {
		const result = await operation();
		if (cancelled) throw new RequestCancelledError();
		return result;
	} catch (err) {
		if (cancelled || isRequestCancelled(err)) throw new RequestCancelledError();
		throw err;
	} finally {
		stop();
	}
}

/**
 * Get a plain-text assistant response without tool calling: stream first, fall
 * back to a single non-streaming completion. Appends the assistant message to
 * the conversation and prints it. Never throws: if both the stream and the
 * retry fail, an LLM error is printed and no message is appended.
 */
async function replyWithText(
	conversation: ConversationMessage[],
	nimClient: NimClient,
	projectRoot: string,
): Promise<void> {
	startSpinner('Thinking');
	const md = new MarkdownPrinter(() => stopSpinner());
	try {
		const gen = nimClient.streamComplete(conversation, undefined, (text: string) => md.push(text));
		// The generator streams everything, then yields once at the end; the
		// chunks have already been rendered through the callback.
			const streamed = await withEscapeCancellation(nimClient, () => gen.next());
			md.end();
			stopSpinner();
			const streamedText = streamed.value?.content?.trim() ?? '';
			if (streamedText) {
				conversation.push({ id: crypto.randomUUID(), role: 'assistant', content: streamedText, timestamp: new Date() });
				rememberChat(projectRoot, 'Assistant', streamedText);
			}
			return;
		} catch (err) {
			md.end();
			stopSpinner();
			if (isRequestCancelled(err)) return;
		}

	startSpinner('Retrying');
	try {
			const result = await withEscapeCancellation(nimClient, () => nimClient.complete(conversation, undefined));
		stopSpinner();
		const cleanText = (result.content ?? '').trim();
		if (cleanText) {
			conversation.push({
				id: crypto.randomUUID(),
				role: 'assistant',
					content: cleanText,
					timestamp: new Date(),
				});
				rememberChat(projectRoot, 'Assistant', cleanText);
				printAssistantMessage(cleanText);
		}
	} catch (err) {
		stopSpinner();
		printError('LLM error: ' + (err instanceof Error ? err.message : String(err)));
	}
}

/**
 * Parse JSON tool calls that a non-tool-calling model may emit as plain text,
 * e.g. {"tool_calls":[{"id":"call_1","name":"file:write","arguments":{...}}]}.
 * Returns an empty array when nothing parseable is found.
 */
function parseToolCallsFromText(text: string): ToolCall[] {
	let cleaned = (text ?? '').trim();
	cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

	let obj: { tool_calls?: unknown };
	try {
		obj = JSON.parse(cleaned);
	} catch {
		const start = cleaned.indexOf('{');
		const end = cleaned.lastIndexOf('}');
		if (start === -1 || end === -1 || end <= start) return [];
		try {
			obj = JSON.parse(cleaned.slice(start, end + 1));
		} catch {
			return [];
		}
	}

	const rawCalls = Array.isArray(obj.tool_calls) ? obj.tool_calls : [];
	return rawCalls.map((tc: { id?: string; name?: string; function?: { name?: string; arguments?: unknown } }) => ({
		id: tc.id ?? crypto.randomUUID(),
		name: fromWireToolName(tc.name ?? (tc.function?.name ?? '')),
		arguments:
			typeof tc.function?.arguments === 'string'
				? (() => { try { return JSON.parse(tc.function.arguments as string); } catch { return { _raw: tc.function.arguments }; } })()
				: (tc.function?.arguments ?? {}),
	}));
}

function extractProposedChange(toolName: string, resultOutput: string): ProposedFileChange | undefined {
	const isFileTool = toolName === 'file:write' || toolName === 'file:edit' || toolName === 'file:delete';
	if (!isFileTool) return undefined;
	try {
		const parsed = JSON.parse(resultOutput);
		if (parsed?.needsApproval && parsed?.proposedChange) {
			return parsed.proposedChange as ProposedFileChange;
		}
	} catch {
		// Not JSON — tool returned a simple string
	}
	return undefined;
}

interface InputController {
	close(): void;
	showPrompt(): void;
}

/**
 * Open a VS Code diff window for the proposed change.
 * Writes original + proposed content to temp files and launches `code --diff`.
 */
async function openVsCodeDiff(change: ProposedFileChange): Promise<void> {
	try {
		const { exec } = await import('node:child_process');
		const { promisify } = await import('node:util');
		const { mkdtemp, writeFile } = await import('node:fs/promises');
		const { basename } = await import('node:path');
		const { tmpdir } = await import('node:os');

		const execAsync = promisify(exec);

		const originalPath = change.path;
		const tmpDir = await mkdtemp(tmpdir() + '/agent-termo-diff-');
		const tmpFile = tmpDir + '/' + basename(originalPath);

		await writeFile(tmpFile, change.proposedContent, 'utf-8');

		// Write original content to a temp file for diff display
		if (!change.isNewFile && change.originalContent.length > 0) {
			const originalTmp = tmpDir + '/original-' + basename(originalPath);
			await writeFile(originalTmp, change.originalContent, 'utf-8');
			execAsync(`code --diff "${originalTmp}" "${tmpFile}" --wait`).catch(() => {
				// VS Code not available or user closed — continue silently
			});
		} else {
			// New file: just open the proposed file
			execAsync(`code "${tmpFile}" --wait`).catch(() => {
				// Silently fall back
			});
		}
	} catch {
		// Silently fall back to terminal diff view
	}
}

async function executeToolWithReview(
	toolName: string,
	args: Record<string, unknown>,
	projectRoot: string,
	input: InputController,
): Promise<{ toolResult: { success: boolean; output?: string; error?: string }; change?: ProposedFileChange; applied: boolean }> {
	printToolCall(toolName, args);
	startSpinner('Running ' + toolName);
	const toolResult = await executeTool(toolName, args, projectRoot);
	stopSpinner(toolResult.success);

	const proposedChange = extractProposedChange(toolName, toolResult.output ?? '');

	if (proposedChange) {
		// Pause REPL input to prevent stale listeners from interfering with promptAcceptReject
		input.close();

		// Show terminal diff viewer
		printToolResult(toolName, { success: toolResult.success, output: toolResult.output, error: toolResult.error }, { needsApproval: true, proposedChange });

		// Also open VS Code diff window (non-blocking, fire-and-forget)
			void openVsCodeDiff(proposedChange);

		const decision = await promptAcceptReject('Accept this change?');

		// Restore input for next REPL iteration
		input.showPrompt();

		if (decision === 'accept') {
			startSpinner('Writing to disk');
			const applyResult = await applyFileChange(proposedChange, projectRoot);
			stopSpinner(applyResult.success);
			if (applyResult.success) {
				printSuccess(applyResult.output ?? 'Change applied');
				return { toolResult: applyResult, change: proposedChange, applied: true };
			} else {
				printError(applyResult.error ?? 'Failed to apply change');
				return { toolResult: applyResult, change: proposedChange, applied: false };
			}
		} else {
			printInfo('Change rejected — file was not modified');
			return { toolResult, change: proposedChange, applied: false };
		}
	}

	printToolResult(toolName, toolResult);
	return { toolResult, applied: false };
}

async function runDelegatedAgent(projectRoot: string, toolCall: ToolCall, nimClient: NimClient): Promise<ToolResult> {
	const started = Date.now();
	const agentName = String(toolCall.arguments.agent ?? '').trim();
	const task = String(toolCall.arguments.task ?? '').trim();
	const context = String(toolCall.arguments.context ?? '').trim();
	const projectAgentRoot = resolve(projectRoot, '.agent-termo');
	const projectAgents = loadAllAgents(projectAgentRoot);
	const agents = projectAgents.length > 0 ? projectAgents : loadAllAgents(resolve(projectRoot, '.claude'));
	const agent = agents.find((candidate) => candidate.name === agentName);
	if (!agent || !task) {
		return { id: toolCall.id, name: toolCall.name, success: false, error: `Unknown agent or empty task: ${agentName}`, durationMs: Date.now() - started };
	}

	const delegatedMessages: ConversationMessage[] = [
		{ id: crypto.randomUUID(), role: 'system', content: buildSystemPrompt('', '', projectRoot, agent.systemPrompt), timestamp: new Date(), agent: agent.name },
		{ id: crypto.randomUUID(), role: 'user', content: `You are a delegated sub-agent named ${agent.name}. Complete only this focused task and return concise findings for the parent agent. Do not claim to modify files unless the parent explicitly asks and you have evidence.\n\nTask:\n${task}\n\nParent context:\n${context || '(none)'}`, timestamp: new Date() },
	];

	try {
		const result = await withEscapeCancellation(nimClient, () => nimClient.complete(delegatedMessages, undefined));
		const output = result.content.trim() || '(sub-agent returned no text)';
		logAgentTermoTimeline(`Sub-agent ${agent.name} completed delegated task: ${task.slice(0, 120)}`, projectRoot);
		return { id: toolCall.id, name: toolCall.name, success: true, output: `[${agent.name}]\n${output}`, durationMs: Date.now() - started };
	} catch (error) {
		return { id: toolCall.id, name: toolCall.name, success: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started };
	}
}

/**
 * Run the tool-call loop: execute tools, feed results back to the LLM,
 * and repeat until the LLM stops issuing tool calls.
 */
async function runToolLoop(
	conversation: ConversationMessage[],
	projectRoot: string,
	initialToolCalls: ToolCall[],
	input: InputController,
	nimClient: NimClient,
): Promise<string> {
	let toolCalls = initialToolCalls;
	let finalText = '';

	// Continue looping while the LLM keeps issuing tool calls
	while (toolCalls.length > 0) {
		// OpenAI-compatible APIs require the assistant tool-call message directly
		// before the corresponding tool results. Without this message, the next
		// request is rejected and file operations appear not to work.
		conversation.push({
			id: crypto.randomUUID(),
			role: 'assistant',
			content: finalText || '',
			toolCalls,
			timestamp: new Date(),
		});

			// Execute all tool calls from this turn
			for (const tc of toolCalls) {
				const execution = tc.name === 'agent:delegate'
					? { toolResult: await runDelegatedAgent(projectRoot, tc, nimClient), applied: false, change: undefined }
					: await executeToolWithReview(tc.name, tc.arguments, projectRoot, input);

				const toolResult = execution.toolResult;
			const statusText = toolResult.success ? 'OK' : ('ERR: ' + (toolResult.error ? toolResult.error.slice(0, 80) : 'unknown error'));
			const changeNote = execution.change ? (execution.applied ? ' (applied)' : ' (rejected)') : '';

				conversation.push({
					id: tc.id,
					role: 'tool',
				content: (toolResult.success ? 'Result: ' : 'Error: ') + (toolResult.success ? (toolResult.output ?? '') : toolResult.error) + changeNote,
				timestamp: new Date(),
			});

			void logToTimeline(projectRoot, 'Tool: ' + tc.name + ' -- ' + statusText + changeNote);
			logAgentTermoTimeline('Tool: ' + tc.name + ' -- ' + statusText + changeNote, projectRoot);
		}

		// Send conversation (including tool results) back to the LLM
		// The LLM will either produce text or more tool calls
		startSpinner('Working');
		let result: { content: string; toolCalls: ToolCall[] };
		try {
			const tools = nimClient.buildToolDefs(TOOL_DEFINITIONS);
				result = await withEscapeCancellation(nimClient, () => nimClient.complete(conversation, tools));
			} catch (err) {
				if (isRequestCancelled(err)) {
					stopSpinner();
					return '';
				}
			// Model doesn't support native tool calling — fall back to plain text
			// and parse any JSON tool calls emitted in the content.
			try {
				const fallback = await withEscapeCancellation(nimClient, () => nimClient.complete(conversation, undefined));
				result = {
					content: fallback.content,
					toolCalls: parseToolCallsFromText(fallback.content),
				};
			} catch (err2) {
				stopSpinner();
				printError('LLM error: ' + (err2 instanceof Error ? err2.message : String(err2)));
				break;
			}
		}
		stopSpinner();

		finalText = result.content;
		toolCalls = dedup(result.toolCalls);

		// If the LLM produced text alongside tool calls, save it
		if (finalText && finalText.trim() && finalText.trim() !== 'null') {
				if (toolCalls.length === 0) {
					conversation.push({
						id: crypto.randomUUID(),
						role: 'assistant',
						content: finalText.trim(),
						timestamp: new Date(),
					});
				}
			// Narration that comes with more tool calls is shown now; the
			// final answer (no tool calls) is printed by the caller.
			if (toolCalls.length > 0) printAssistantMessage(finalText.trim());
		}
	}

	return finalText;
}

function compactConversation(conversation: ConversationMessage[]): string {
	const keep = 12;
	const prior = conversation.slice(1, -keep);
	if (prior.length === 0) return 'Nothing to compact yet.';
	const summary = prior
		.filter((message) => message.role === 'user' || message.role === 'assistant')
		.map((message) => `${message.role}: ${message.content.replace(/\s+/g, ' ').slice(0, 500)}`)
		.join('\n');
	const base = conversation[0];
	if (base) {
		base.content = base.content.replace(/\n\n## Compacted Conversation Context[\s\S]*$/, '') + '\n\n## Compacted Conversation Context\n' + summary.slice(0, 6000);
	}
	const recent = conversation.slice(-keep).filter((message) => message.role !== 'tool' && !message.toolCalls);
	conversation.splice(1);
	conversation.push(...recent);
	return `Compacted ${prior.length} earlier messages; preserved the latest ${recent.length} messages.`;
}

/**
 * /model            — pick from the live NVIDIA NIM catalogue (falls back to a built-in list)
 * /model <model-id> — switch directly, e.g. /model meta/llama-3.3-70b-instruct
 */
async function handleModelCommand(arg: string, nimClient: NimClient, projectRoot: string): Promise<void> {
	let selected: string | null = arg || null;

	if (!selected) {
		startSpinner('Fetching NVIDIA NIM models');
			let modelList: Awaited<ReturnType<NimClient['listModels']>>;
			try {
				modelList = await withEscapeCancellation(nimClient, () => nimClient.listModels());
			} catch (error) {
				stopSpinner();
				if (isRequestCancelled(error)) return;
				throw error;
			}
			const { models, live, error } = modelList;
		stopSpinner();
		if (!live) {
			printInfo('Could not fetch the live model list (' + (error ?? 'unknown error') + '). Showing built-in suggestions; you can type any model ID.');
		}

		selected = await pick({
			title: 'Select a model',
			items: models.map((m) => ({ value: m.id, label: m.id, hint: m.note })),
			current: nimClient.getModel(),
			allowCustom: true,
		});
		if (!selected) {
			printInfo('Model unchanged: ' + nimClient.getModel());
			return;
		}
	}

	if (selected === nimClient.getModel()) {
		printInfo('Already using ' + selected);
		return;
	}

	nimClient.setModel(selected);
	setScreenStatus({ model: selected });
	logAgentTermoTimeline('Model switched to ' + selected, projectRoot);
	void logToTimeline(projectRoot, 'Model switched to ' + selected);

	try {
		saveNimModel(selected);
		printSuccess('Model set to ' + selected + ' (saved as your default)');
	} catch {
		printSuccess('Model set to ' + selected + ' for this session');
		printInfo('Could not save it as your default.');
	}
}

async function handleThinkingCommand(arg: string, nimClient: NimClient, projectRoot: string): Promise<void> {
	const capacities: Array<{ value: ThinkingCapacity; label: string; hint: string }> = [
		{ value: 'off', label: 'off', hint: 'NVIDIA /no_think concise mode' },
		{ value: 'auto', label: 'auto', hint: 'let the selected model decide' },
		{ value: 'low', label: 'low', hint: 'short focused reasoning' },
		{ value: 'medium', label: 'medium', hint: 'moderate reasoning' },
		{ value: 'high', label: 'high', hint: 'thorough reasoning' },
	];
	const requested = arg.trim().toLowerCase() as ThinkingCapacity;
	const valid = capacities.some((item) => item.value === requested);
	const selectedValue = valid ? requested : await pick({ title: 'Select thinking capacity', items: capacities, current: nimClient.getThinkingCapacity() });
	if (!selectedValue || !capacities.some((item) => item.value === selectedValue)) return;
	const selected = selectedValue as ThinkingCapacity;
	nimClient.setThinkingCapacity(selected);
	process.env.NIM_THINKING = selected;
	setScreenStatus({ thinking: selected });
	try {
		saveNimThinking(selected);
	} catch {
		printInfo('Thinking capacity set for this session; could not save the preference.');
	}
	logAgentTermoTimeline('Thinking capacity set to ' + selected, projectRoot);
	void logToTimeline(projectRoot, 'Thinking capacity set to ' + selected);
	printSuccess('Thinking capacity: ' + selected);
}

export async function runRepl(projectRoot?: string): Promise<void> {
	projectRoot = resolve(resolveProjectRoot(projectRoot ?? process.cwd()));

	const memory = await loadMemory(projectRoot);
	const nimClient = new NimClient(projectRoot);
	const agentRoot = resolve(projectRoot, '.agent-termo');
	const loadProjectAgents = () => {
		const projectAgents = loadAllAgents(agentRoot);
		return projectAgents.length > 0 ? projectAgents : loadAllAgents(resolve(projectRoot, '.claude'));
	};
	let customAgents = loadProjectAgents();
	setAgentNames(customAgents.map((agent) => agent.name));
	const contextFiles = discoverProjectFiles(projectRoot);
	setContextFiles(contextFiles);
	let customCommands: AgentCommand[] = loadAgentCommands(projectRoot);
	const refreshCommandCompletion = (): void => {
		setCommands([...COMMANDS, ...customCommands.map((command) => ({ name: '/' + command.name, description: command.description || 'project command' }))]);
	};
	refreshCommandCompletion();
	let activeAgentName = '';
	let activeAgentPrompt = '';
	let currentGoal = '';
	const buildSessionPrompt = (): string => {
		let prompt = buildSystemPrompt(memory, '', projectRoot, activeAgentPrompt);
		if (currentGoal) prompt += '\n\n## Current Goal\n' + currentGoal;
		return prompt;
	};

	const session = { id: crypto.randomUUID(), projectRoot, startedAt: new Date() };

	const conversation: ConversationMessage[] = [
		{
			id: crypto.randomUUID(),
			role: 'system',
			content: buildSessionPrompt(),
			timestamp: new Date(),
		},
	];
	const refreshSystemPrompt = (): void => {
		const compacted = conversation[0]?.content.match(/\n\n## Compacted Conversation Context[\s\S]*$/)?.[0] ?? '';
		conversation[0]!.content = buildSessionPrompt() + compacted;
	};

	initScreen({ model: nimClient.getModel(), project: projectRoot, thinking: nimClient.getThinkingCapacity() });
	printWelcome(projectRoot, nimClient.getModel());
	logAgentTermoTimeline('Agent-Termo session started. Model: ' + nimClient.getModel(), projectRoot);
	void logToTimeline(projectRoot, 'Agent-Termo session started. Model: ' + nimClient.getModel());
	logAgentTermoTimeline('Commands: /help /clear /memory /timeline /model /thinking /agents /history', projectRoot);
	void logToTimeline(projectRoot, 'Commands: /help /clear /memory /timeline /model /thinking /agents /history');

	const input = createInput();

	const activateAgent = (name: string, seedInput = true): boolean => {
		const selected = customAgents.find((agent) => agent.name === name);
		if (!selected) return false;
		activeAgentName = selected.name;
		activeAgentPrompt = selected.systemPrompt;
		refreshSystemPrompt();
		if (seedInput) setNextInput('@' + selected.name + ' ');
		logAgentTermoTimeline('Active custom agent: ' + selected.name, projectRoot);
		printSuccess('Active agent: ' + selected.name);
		return true;
	};

	const chooseAgent = async (): Promise<void> => {
		if (customAgents.length === 0) {
			printInfo('No custom agents found. Add Markdown agents to ' + agentRoot + '/agents');
			return;
		}
		const selected = await pick({
			title: 'Select an agent',
			items: customAgents.map((agent) => ({ value: agent.name, label: agent.name, hint: agent.description })),
			current: activeAgentName,
		});
		if (selected) activateAgent(selected, true);
	};

	const cleanup = () => {
		input.close();
		process.stdout.write('\n');
		console.log(
			'Session complete. ' +
			Math.round((Date.now() - session.startedAt.getTime()) / 60000) +
			' minutes.',
		);
		process.exit(0);
	};
	process.on('SIGINT', cleanup);

	mainLoop: while (true) {
		try {
				const rawInput = await input.question('');
				let userInput = rawInput;
				if (!userInput) continue;
			if (userInput === 'exit' || userInput === 'quit') {
				cleanup();
				break;
			}

				let displayedInput = false;
					const lowerInput = userInput.toLowerCase().trim();
					const customCommandMatch = /^\/([A-Za-z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(userInput);
					const customCommand = customCommandMatch
						? customCommands.find((command) => command.name.toLowerCase() === customCommandMatch[1]!.toLowerCase())
						: undefined;
					if (customCommand) {
						printUserMessage(rawInput);
						displayedInput = true;
						const args = customCommandMatch?.[2]?.trim() ?? '';
						userInput = customCommand.prompt.replace(/\$ARGUMENTS|\$ARGS/g, args) + (args && !customCommand.prompt.includes('$ARGUMENTS') && !customCommand.prompt.includes('$ARGS') ? `\n\nUser arguments:\n${args}` : '');
					}
					const contextExpansion = expandContextMentions(userInput, projectRoot, contextFiles);
					if (contextExpansion.attached.length > 0) {
						if (!displayedInput) printUserMessage(rawInput);
						displayedInput = true;
						userInput = contextExpansion.text + '\n\n' + contextExpansion.attached.join('\n\n');
					}
					if (lowerInput === '/report' || lowerInput.startsWith('/report ')) {
					const requestedPath = userInput.trim().slice('/report'.length).trim() || 'report.md';
					printUserMessage(rawInput);
					displayedInput = true;
						userInput = `Review the current project and our entire conversation context. Identify bugs, risks, and actionable improvements. Create a detailed Markdown report at ${requestedPath} using file:write. Include evidence with file paths and line references, severity, reproduction steps, and recommended fixes. Do not only describe the report: write it to disk, then summarize what was written.`;
					}
					const agentTask = /^\/agent\s+(\S+)\s+(.+)$/i.exec(userInput);
					if (agentTask) {
						if (!activateAgent(agentTask[1]!, false)) {
							printError('Unknown agent: ' + agentTask[1], 'Use /agents to list available agents.');
							continue mainLoop;
						}
						printUserMessage(rawInput);
						displayedInput = true;
						userInput = agentTask[2]!;
					}
					const atAgent = /^@([A-Za-z0-9._-]+)(?:\s+(.+))?$/.exec(userInput);
					if (atAgent) {
						if (!activateAgent(atAgent[1]!, Boolean(!atAgent[2]))) {
							printError('Unknown agent: ' + atAgent[1], 'Use /agents to list available agents.');
							continue mainLoop;
						}
						if (atAgent[2]) {
							printUserMessage(rawInput);
							displayedInput = true;
							userInput = atAgent[2];
						} else {
							continue mainLoop;
						}
					}

					if (userInput.startsWith('/') && !displayedInput) {
				const cmd = userInput.toLowerCase().trim();
				printUserMessage(userInput);

				if (cmd === '/help' || cmd === '/') {
					printHelp();
					continue mainLoop;
				}
				if (cmd === '/clear' || cmd === '/cls') {
					conversation.length = 1;
					clearScreen();
					printWelcome(projectRoot, nimClient.getModel());
					printSuccess('Conversation cleared.');
					continue mainLoop;
				}
				if (cmd === '/memory') {
					await printMemoryFile(projectRoot);
					continue mainLoop;
				}
				if (cmd === '/timeline' || cmd === '/tl') {
					await printTimelineFile(projectRoot);
					continue mainLoop;
				}
					if (cmd === '/model' || cmd.startsWith('/model ')) {
						// Take the argument from the original text: model IDs are case-sensitive.
						await handleModelCommand(userInput.trim().slice('/model'.length).trim(), nimClient, projectRoot);
						continue mainLoop;
					}
					if (cmd === '/thinking' || cmd.startsWith('/thinking ')) {
						await handleThinkingCommand(userInput.trim().slice('/thinking'.length).trim(), nimClient, projectRoot);
						continue mainLoop;
					}
					if (cmd === '/agents') {
						printAgentsList(customAgents);
						printInfo('Custom agents directory: ' + agentRoot + '/agents');
						await chooseAgent();
						continue mainLoop;
					}
					if (cmd === '/agent-folder') {
						const result = ensureAgentFolder(projectRoot);
						customAgents = loadProjectAgents();
						customCommands = loadAgentCommands(projectRoot);
						setAgentNames(customAgents.map((agent) => agent.name));
						refreshCommandCompletion();
						printSuccess('Agent folder ready: ' + result.root);
						printInfo(`Agents copied: ${result.copiedAgents}; commands copied: ${result.copiedCommands}`);
						continue mainLoop;
					}
					if (cmd === '/agent' || cmd.startsWith('/agent ')) {
						const requested = userInput.trim().slice('/agent'.length).trim();
							if (!requested) await chooseAgent();
							else if (!activateAgent(requested, true)) printError('Unknown agent: ' + requested, 'Use /agents to list available agents.');
						continue mainLoop;
					}
					if (cmd === '/goal' || cmd.startsWith('/goal ')) {
						const requested = userInput.trim().slice('/goal'.length).trim();
						if (requested) {
							currentGoal = requested;
								refreshSystemPrompt();
							printSuccess('Goal set: ' + currentGoal);
						} else printInfo(currentGoal ? 'Current goal: ' + currentGoal : 'No goal set. Use /goal <description>.');
						continue mainLoop;
					}
					if (cmd === '/status') {
						printInfo(`Project: ${projectRoot}`);
						printInfo(`Model: ${nimClient.getModel()}`);
						printInfo(`Thinking: ${nimClient.getThinkingCapacity()}`);
						printInfo(`Agent: ${activeAgentName || '(default)'}`);
						printInfo(`Goal: ${currentGoal || '(none)'}`);
						printInfo(`Messages: ${conversation.length - 1}`);
						continue mainLoop;
					}
					if (cmd === '/context') {
						printInfo('Context messages: ' + (conversation.length - 1));
						printInfo('Approximate context characters: ' + conversation.reduce((total, message) => total + message.content.length, 0));
						printInfo('Active agent: ' + (activeAgentName || '(default)'));
						printInfo('Current goal: ' + (currentGoal || '(none)'));
						printInfo('Use @agent or @path/to/file to add context.');
						printInfo('Runtime directory: ' + agentRoot);
						printInfo('Project docs: ' + resolve(projectRoot, 'docs'));
						printInfo('Use /compact when the conversation becomes large.');
						continue mainLoop;
					}
					if (cmd === '/compact') {
						printSuccess(compactConversation(conversation));
						continue mainLoop;
					}
					if (cmd === '/history' || cmd === '/hist' || cmd.startsWith('/history ')) {
						const requested = Number.parseInt(userInput.trim().slice('/history'.length).trim() || '12', 10);
						const count = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 50) : 12;
						const messages = conversation.filter((message) => message.role !== 'system').slice(-count);
						printInfo(`Conversation history (${messages.length} messages):`);
						for (const message of messages) {
							printInfo(`${message.role}: ${message.content.replace(/\s+/g, ' ').slice(0, 500)}`);
						}
						continue mainLoop;
				}
				if (cmd === '/exit' || cmd === '/quit') {
					cleanup();
					break;
				}

				printError('Unknown command: ' + cmd, 'Type /help for available commands.');
				continue mainLoop;
			}

			const userMsg: ConversationMessage = {
				id: crypto.randomUUID(),
				role: 'user',
				content: userInput,
				timestamp: new Date(),
				};
				conversation.push(userMsg);
				rememberChat(projectRoot, 'User', userInput);
					if (!displayedInput) printUserMessage(userInput);

			const useTools = mightNeedTools(userInput);
			const tools = useTools ? nimClient.buildToolDefs(TOOL_DEFINITIONS) : undefined;

			if (useTools) {
				startSpinner('Working');
				try {
						const result = await withEscapeCancellation(nimClient, () => nimClient.complete(conversation, tools));
					const fullText = result.content;
						const toolCalls = dedup(result.toolCalls);
					stopSpinner();

					if (toolCalls.length === 0) {
						// No tool calls — just display the text response
						const cleanText = (fullText ?? '').trim().replace(/^null$/, '').trim();
						if (cleanText) {
							conversation.push({
								id: crypto.randomUUID(),
								role: 'assistant',
								content: cleanText,
								timestamp: new Date(),
				});
				rememberChat(projectRoot, 'Assistant', cleanText);
				printAssistantMessage(cleanText);
						}
					} else {
						// Show any narration that came with the first tool calls
						const narration = (fullText ?? '').trim().replace(/^null$/, '').trim();
						if (narration) printAssistantMessage(narration);

						// Run the tool-call loop: execute tools, feed results back, repeat
						const finalText = await runToolLoop(conversation, projectRoot, toolCalls, input, nimClient);
						if (finalText && finalText.trim() && finalText.trim() !== 'null') {
							printAssistantMessage(finalText.trim());
						}
					}
					} catch (err) {
						stopSpinner();
						if (isRequestCancelled(err)) {
							continue mainLoop;
						}
						// Tool calling failed (e.g. HTTP 400 because the model does not
					// support the `tools` parameter). Retry without tools and parse
					// any JSON tool calls the model may have emitted as plain text.
					printInfo('Tool calls not supported by this model — retrying without tools.');
					try {
							const fallback = await withEscapeCancellation(nimClient, () => nimClient.complete(conversation, undefined));
						const toolCalls = dedup(
							fallback.toolCalls.length > 0 ? fallback.toolCalls : parseToolCallsFromText(fallback.content),
						);
						if (toolCalls.length > 0) {
							const narration = (fallback.content ?? '').trim().replace(/^null$/, '').trim();
							if (narration && !narration.includes('"tool_calls"')) printAssistantMessage(narration);
							const finalText = await runToolLoop(conversation, projectRoot, toolCalls, input, nimClient);
							if (finalText && finalText.trim() && finalText.trim() !== 'null') {
								rememberChat(projectRoot, 'Assistant', finalText);
								printAssistantMessage(finalText.trim());
							}
						} else {
							const cleanText = (fallback.content ?? '').trim().replace(/^null$/, '').trim();
							if (cleanText) {
								conversation.push({ id: crypto.randomUUID(), role: 'assistant', content: cleanText, timestamp: new Date() });
								printAssistantMessage(cleanText);
							}
							}
					} catch (err2) {
						printError('LLM error: ' + (err2 instanceof Error ? err2.message : String(err2)));
						conversation.pop();
						continue mainLoop;
					}
				}
			} else {
				await replyWithText(conversation, nimClient, projectRoot);
			}

			if (conversation.length > 42) {
				compactConversation(conversation);
			}
		} catch (err) {
			input.close();
			stopSpinner();
			printError('Session error: ' + (err instanceof Error ? err.message : String(err)));
		}
	}
}

function rememberChat(projectRoot: string, role: 'User' | 'Assistant', content: string): void {
	const trimmed = content.trim();
	if (trimmed) appendToAgentTermoMemory('### ' + role + '\n\n' + trimmed.slice(0, 12000), projectRoot);
}
