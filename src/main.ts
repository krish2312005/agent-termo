// =============================================================================
// Agent-Termo — Main REPL entry point
// =============================================================================

import { NimClient, fromWireToolName } from './llm/client.js';
import { TOOL_DEFINITIONS } from './llm/tools.js';
import { executeTool, applyFileChange } from './tools/index.js';
import { loadMemory, logToTimeline, logAgentTermoTimeline, appendToAgentTermoMemory } from './memory/index.js';
import { loadAllAgents } from './agents/index.js';
import { buildSystemPrompt } from './agents/index.js';
import { resolveProjectRoot, saveNimModel } from './utils/config.js';
import { resolve } from 'node:path';
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
} from './ui/index.js';
import type { ConversationMessage, ToolCall, ProposedFileChange } from './types/index.js';

const TOOL_KEYWORDS = [
	'build', 'create', 'write', 'edit', 'modify', 'file', 'code', 'function', 'class',
	'component', 'debug', 'fix', 'git', 'commit', 'push', 'install', 'npm', 'run',
	'bash', 'shell', 'command', 'read', 'grep', 'check', 'show', 'implement',
	'configure', 'setup', 'src', 'package', 'app', 'project', 'api', 'deploy',
	'test', 'compile', 'typescript', 'javascript', 'python', 'node', 'add', 'delete', 'report', 'analyze', 'analysis', 'bug', 'issue',
];

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
		if (key.name === 'escape') {
			cancelled = true;
			nimClient.cancelCurrentRequest();
			printInfo('Response cancelled.');
		}
	});
	try {
		return await operation();
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
			const execution = await executeToolWithReview(tc.name, tc.arguments, projectRoot, input);

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
	conversation.splice(1, conversation.length - 1 - keep);
	conversation.splice(1, 0, {
		id: crypto.randomUUID(),
		role: 'system',
		content: '## Compacted Conversation Context\n' + summary.slice(0, 6000),
		timestamp: new Date(),
	});
	return `Compacted ${prior.length} earlier messages; preserved the latest ${Math.min(keep, conversation.length - 2)} messages.`;
}

/**
 * /model            — pick from the live NVIDIA NIM catalogue (falls back to a built-in list)
 * /model <model-id> — switch directly, e.g. /model meta/llama-3.3-70b-instruct
 */
async function handleModelCommand(arg: string, nimClient: NimClient, projectRoot: string): Promise<void> {
	let selected: string | null = arg || null;

	if (!selected) {
		startSpinner('Fetching NVIDIA NIM models');
		const { models, live, error } = await nimClient.listModels();
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

export async function runRepl(projectRoot?: string): Promise<void> {
	projectRoot = resolveProjectRoot(projectRoot);

	const memory = await loadMemory(projectRoot);
	const nimClient = new NimClient(projectRoot);
	const agentRoot = resolve(projectRoot, '.agent-termo');
	const projectAgents = loadAllAgents(agentRoot);
	const customAgents = projectAgents.length > 0 ? projectAgents : loadAllAgents(resolve(projectRoot, '.claude'));
	setAgentNames(customAgents.map((agent) => agent.name));
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

	initScreen({ model: nimClient.getModel(), project: projectRoot });
	printWelcome(projectRoot, nimClient.getModel());
	logAgentTermoTimeline('Agent-Termo session started. Model: ' + nimClient.getModel(), projectRoot);
	void logToTimeline(projectRoot, 'Agent-Termo session started. Model: ' + nimClient.getModel());
	logAgentTermoTimeline('Commands: /help /clear /memory /timeline /model /agents /history', projectRoot);
	void logToTimeline(projectRoot, 'Commands: /help /clear /memory /timeline /model /agents /history');

	const input = createInput();

	const activateAgent = (name: string): boolean => {
		const selected = customAgents.find((agent) => agent.name === name);
		if (!selected) return false;
		activeAgentName = selected.name;
		activeAgentPrompt = selected.systemPrompt;
		conversation[0]!.content = buildSessionPrompt();
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
		if (selected) activateAgent(selected);
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
				if (lowerInput === '/report' || lowerInput.startsWith('/report ')) {
					const requestedPath = userInput.trim().slice('/report'.length).trim() || 'report.md';
					printUserMessage(rawInput);
					displayedInput = true;
						userInput = `Review the current project and our entire conversation context. Identify bugs, risks, and actionable improvements. Create a detailed Markdown report at ${requestedPath} using file:write. Include evidence with file paths and line references, severity, reproduction steps, and recommended fixes. Do not only describe the report: write it to disk, then summarize what was written.`;
					}
					const agentTask = /^\/agent\s+(\S+)\s+(.+)$/i.exec(userInput);
					if (agentTask) {
						if (!activateAgent(agentTask[1]!)) {
							printError('Unknown agent: ' + agentTask[1], 'Use /agents to list available agents.');
							continue mainLoop;
						}
						printUserMessage(rawInput);
						displayedInput = true;
						userInput = agentTask[2]!;
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
					if (cmd === '/agents') {
						printAgentsList(customAgents);
						printInfo('Custom agents directory: ' + agentRoot + '/agents');
						await chooseAgent();
						continue mainLoop;
					}
					if (cmd === '/agent' || cmd.startsWith('/agent ')) {
						const requested = userInput.trim().slice('/agent'.length).trim();
							if (!requested) await chooseAgent();
							else if (!activateAgent(requested)) printError('Unknown agent: ' + requested, 'Use /agents to list available agents.');
						continue mainLoop;
					}
					if (cmd === '/goal' || cmd.startsWith('/goal ')) {
						const requested = userInput.trim().slice('/goal'.length).trim();
						if (requested) {
							currentGoal = requested;
							conversation[0]!.content = buildSessionPrompt();
							printSuccess('Goal set: ' + currentGoal);
						} else printInfo(currentGoal ? 'Current goal: ' + currentGoal : 'No goal set. Use /goal <description>.');
						continue mainLoop;
					}
					if (cmd === '/status') {
						printInfo(`Project: ${projectRoot}`);
						printInfo(`Model: ${nimClient.getModel()}`);
						printInfo(`Agent: ${activeAgentName || '(default)'}`);
						printInfo(`Goal: ${currentGoal || '(none)'}`);
						printInfo(`Messages: ${conversation.length - 1}`);
						continue mainLoop;
					}
					if (cmd === '/context') {
						printInfo('Context messages: ' + (conversation.length - 1));
						printInfo('Runtime directory: ' + agentRoot);
						printInfo('Project docs: ' + resolve(projectRoot, 'docs'));
						printInfo('Use /compact when the conversation becomes large.');
						continue mainLoop;
					}
					if (cmd === '/compact') {
						printSuccess(compactConversation(conversation));
						continue mainLoop;
					}
				if (cmd === '/history' || cmd === '/hist') {
					printInfo('Conversation (excluding system): ' + (conversation.length - 1) + ' messages');
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
				conversation.splice(1, conversation.length - 42);
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
