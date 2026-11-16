// =============================================================================
// Agent-Termo — Main REPL entry point
// =============================================================================

import { NimClient, parseToolCallsFromText, type ThinkingCapacity } from './llm/client.js';
import { TOOL_DEFINITIONS } from './llm/tools.js';
import { executeTool, applyFileChange, setTerminalHooks, killRunningTerminal } from './tools/index.js';
import { loadMemory, loadTimeline, logToTimeline, logAgentTermoTimeline, appendToSessionLog, appendToTimeline, loadSessionLog } from './memory/index.js';
import { buildSystemPrompt } from './agents/index.js';
import { resolveProjectRoot, saveNimModel, saveNimThinking, savePermissionMode } from './utils/config.js';
import { resolve } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { ensureAgentFolder, ensureAgentStructure, loadProjectAgents, loadAgentCommands, type AgentCommand } from './runtime/agent-folder.js';
import { commandApprovalKey, isCommandApprovalRequired, loadAllowedCommands, saveAllowedCommands } from './runtime/permissions.js';
import {
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
	setPermissionMode,
	promptCommandApproval,
	startTerminalPanel,
	appendTerminalOutput,
	finishTerminalPanel,
	startSubAgentActivity,
	recordSubAgentActivity,
	finishSubAgentActivity,
	printSubAgents,
	startBackgroundCommandListener,
} from './ui/index.js';
import type { ConversationMessage, ToolCall, ToolResult, ProposedFileChange } from './types/index.js';

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

function dedup(arr: ToolCall[]): ToolCall[] {
	// Providers occasionally reuse one id for parallel calls. Keep genuinely
	// different calls (with a fresh id) instead of silently dropping them.
	const seen = new Map<string, string>();
	const result: ToolCall[] = [];
	for (const tc of arr) {
		const signature = tc.name + ':' + JSON.stringify(tc.arguments);
		const existing = seen.get(tc.id);
		if (existing === undefined) {
			seen.set(tc.id, signature);
			result.push(tc);
		} else if (existing !== signature) {
			const id = `${tc.id}-${result.length}`;
			seen.set(id, signature);
			result.push({ ...tc, id });
		}
	}
	return result;
}

export function shouldRunDelegationsInParallel(toolCalls: ToolCall[]): boolean {
	return toolCalls.length > 1 && toolCalls.every((toolCall) => toolCall.name === 'agent:delegate');
}

class RequestCancelledError extends Error {
	constructor() {
		super('Request cancelled');
		this.name = 'RequestCancelledError';
	}
}

type PermissionMode = 'ask' | 'files' | 'auto';

function isRequestCancelled(err: unknown): boolean {
	return err instanceof RequestCancelledError || (err instanceof Error && /abort|cancel/i.test(err.name + ' ' + err.message));
}

function providerError(err: unknown): string {
	if (err && typeof err === 'object') {
		const details = err as { status?: number; code?: string; message?: string; error?: { message?: string } };
		const prefix = [details.status, details.code].filter(Boolean).join(' ');
		return `${prefix ? prefix + ': ' : ''}${details.error?.message ?? details.message ?? String(err)}`;
	}
	return err instanceof Error ? err.message : String(err);
}

/** Transient provider failures worth one automatic retry before surfacing. */
export function isTransientError(err: unknown): boolean {
	return /429|500|502|503|504|timeout|timed out|connection error|connection reset|ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR|socket hang up|fetch failed|network/i.test(
		providerError(err),
	);
}

// =============================================================================
// Task state — lets an interrupted run be resumed with "continue" instead of
// restarted. The full conversation (including tool results) is preserved, so
// the model knows exactly where the work stopped.
// =============================================================================

type TaskStatus = 'idle' | 'running' | 'interrupted';

interface TaskState {
	goal: string;
	status: TaskStatus;
	reason: string;
	lastActions: string[];
}

function newTaskState(): TaskState {
	return { goal: '', status: 'idle', reason: '', lastActions: [] };
}

function recordTaskAction(state: TaskState, action: string): void {
	state.lastActions.push(action);
	if (state.lastActions.length > 15) state.lastActions.shift();
}

/**
 * Mark a run complete. An interrupted run stays interrupted so "continue" can
 * still resume it instead of dropping back to idle.
 */
export function finishTaskState(state: TaskState): void {
	if (state.status === 'interrupted') return;
	state.status = 'idle';
	state.reason = '';
}

/** Does this input mean "keep going from where you stopped"? */
function isContinueRequest(input: string): boolean {
	return /^(?:\/)?continue\b/i.test(input.trim()) || input.trim().toLowerCase() === 'c';
}

/** Build the continuation directive injected when the user says "continue". */
function buildContinueMessage(state: TaskState): string {
	const lines = [
		'Continue the previous task from exactly where it stopped. Do NOT restart the task from the beginning and do not redo work that is already done.',
		'',
		`Original goal: ${state.goal}`,
		`Reason the run stopped: ${state.reason || 'the previous run ended before finishing'}`,
	];
	if (state.lastActions.length > 0) {
		lines.push('', 'Last completed actions (oldest first):');
		for (const action of state.lastActions) lines.push('- ' + action);
	}
	lines.push(
		'',
		'The full conversation history above (including every tool result) is still valid. Resume from the step that follows the last completed action. If the last action was in flight when the run stopped, re-verify its result before moving on, then continue the task until it is fully complete.',
	);
	return lines.join('\n');
}

async function withEscapeCancellation<T>(nimClient: NimClient, operation: () => Promise<T>): Promise<T> {
	if (!process.stdin.isTTY) return operation();
	let cancelled = false;
	let rejectCancellation: ((error: Error) => void) | undefined;
	const cancellation = new Promise<T>((_, reject) => {
		rejectCancellation = reject;
	});
	const stop = listenKeys((key) => {
		if (key.name === 'escape' || key.name === 'ctrl+c') {
			if (cancelled) return;
			cancelled = true;
			nimClient.cancelCurrentRequest();
			printInfo(key.name === 'ctrl+c' ? 'Response interrupted.' : 'Response cancelled.');
			rejectCancellation?.(new RequestCancelledError());
		}
	}, () => rejectCancellation?.(new RequestCancelledError()));
	try {
		const result = await Promise.race([operation(), cancellation]);
		if (cancelled) throw new RequestCancelledError();
		return result;
	} catch (err) {
		if (cancelled || isRequestCancelled(err)) throw new RequestCancelledError();
		throw err;
	} finally {
		stop();
	}
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

function describeToolActivity(toolName: string, args: Record<string, unknown>, output: string | undefined, change: ProposedFileChange | undefined, applied: boolean, success: boolean): { actions: string[]; notes: string[] } {
	const target = typeof args.path === 'string' ? `File: ${args.path}` : typeof args.command === 'string' ? `Command: ${args.command}` : typeof args.task === 'string' ? `Task: ${args.task}` : '';
	const actions = [`Requested tool: ${toolName}`, ...(target ? [target] : [])];
	const notes = [`Result: ${success ? 'succeeded' : 'failed'}`];
	if (change) notes.push(`File change: ${applied ? 'applied to project' : 'rejected by user'}`);
	const resultText = (output ?? '').replace(/\s+/g, ' ').slice(0, 500);
	if (resultText) notes.push('Details: ' + resultText);
	return { actions, notes };
}

interface InputController {
	close(): void;
	showPrompt(): void;
}

async function executeToolWithReview(
	toolName: string,
	args: Record<string, unknown>,
	projectRoot: string,
	input: InputController,
	permissionMode: PermissionMode,
	allowedCommands: Set<string>,
): Promise<{ toolResult: { success: boolean; output?: string; error?: string }; change?: ProposedFileChange; applied: boolean }> {
	printToolCall(toolName, args);
	const approvalKey = commandApprovalKey(toolName, args);
	if (permissionMode !== 'auto' && isCommandApprovalRequired(toolName) && !allowedCommands.has(approvalKey)) {
		input.close();
		const decision = await promptCommandApproval(typeof args.command === 'string' ? args.command : approvalKey);
		input.showPrompt();
		if (decision === 'reject') return { toolResult: { success: false, error: 'Command rejected by user' }, applied: false };
		if (decision === 'always') {
			allowedCommands.add(approvalKey);
			try { saveAllowedCommands(projectRoot, allowedCommands); } catch { printInfo('Command allowed for this session but could not be saved.'); }
		}
	}
	startSpinner('Running ' + toolName);
	const toolResult = await executeTool(toolName, args, projectRoot);
	stopSpinner(toolResult.success);

	const proposedChange = extractProposedChange(toolName, toolResult.output ?? '');

	if (proposedChange) {
		if (permissionMode === 'auto' || permissionMode === 'files') {
			const applyResult = await applyFileChange(proposedChange, projectRoot);
			if (applyResult.success) printSuccess('Auto-applied: ' + (applyResult.output ?? proposedChange.path));
			else printError(applyResult.error ?? 'Failed to auto-apply change');
			return { toolResult: applyResult, change: proposedChange, applied: applyResult.success };
		}
			// Pause REPL input to prevent stale listeners from interfering with promptAcceptReject
		input.close();

		// Show terminal diff viewer
		printToolResult(toolName, { success: toolResult.success, output: toolResult.output, error: toolResult.error }, { needsApproval: true, proposedChange });

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

const DELEGATED_TOOL_BUDGET = 8;

/**
 * Run a delegated specialist agent. The sub-agent gets real tool access in a
 * bounded loop, so it can actually read files and write its deliverables (for
 * example its documentation into the project's docs/ folder) instead of only
 * describing what it would do. Nested delegation is not allowed.
 */
async function runDelegatedAgent(
	projectRoot: string,
	toolCall: ToolCall,
	nimClient: NimClient,
	input: InputController,
	permissionMode: PermissionMode,
	allowedCommands: Set<string>,
	taskState: TaskState,
): Promise<ToolResult> {
	const started = Date.now();
	const agentName = String(toolCall.arguments.agent ?? '').trim();
	const task = String(toolCall.arguments.task ?? '').trim();
	const context = String(toolCall.arguments.context ?? '').trim();
	const agents = loadProjectAgents(projectRoot);
	const agent = agents.find((candidate) => candidate.name === agentName);
	if (!agent || !task) {
			return { id: toolCall.id, name: toolCall.name, success: false, error: `Unknown agent or empty task: ${agentName}`, durationMs: Date.now() - started };
	}

	startSubAgentActivity(toolCall.id, agent.name, task);
	printInfo('Delegating to ' + agent.name + '…');
	// Each parallel worker gets its own client/controller so cancelling one request
	// or updating its usage cannot interrupt a sibling worker.
	const delegatedClient = new NimClient(projectRoot);
	delegatedClient.setModel(nimClient.getModel());
	delegatedClient.setThinkingCapacity(nimClient.getThinkingCapacity());
	const [projectMemory, projectTimeline] = await Promise.all([
		loadMemory(projectRoot),
		loadTimeline(projectRoot),
	]);
	const delegatedMessages: ConversationMessage[] = [
		{ id: crypto.randomUUID(), role: 'system', content: buildSystemPrompt(projectMemory, projectTimeline, projectRoot, agent.systemPrompt), timestamp: new Date(), agent: agent.name },
		{
			id: crypto.randomUUID(),
			role: 'user',
			content:
				`You are a delegated sub-agent named ${agent.name}. Complete only this focused task using the available tools, then report concise findings for the parent agent.\n\n` +
				`When the task produces documentation or deliverable files, write them into the project's docs/ directory with file:write — do not merely describe them.\n\n` +
				`Task:\n${task}\n\nParent context:\n${context || '(none)'}`,
			timestamp: new Date(),
		},
	];

	// Sub-agents cannot delegate further; they get every other tool.
	const delegatedToolDefs = TOOL_DEFINITIONS.filter((t) => t.name !== 'agent:delegate');
	let finalText = '';

	try {
		for (let iteration = 0; iteration < DELEGATED_TOOL_BUDGET; iteration++) {
			let result: { content: string; toolCalls: ToolCall[] };
			try {
					result = await withEscapeCancellation(delegatedClient, () =>
						delegatedClient.complete(delegatedMessages, delegatedClient.buildToolDefs(delegatedToolDefs)),
					);
					setScreenStatus({ usage: delegatedClient.formatUsage() });
			} catch (err) {
				if (isRequestCancelled(err)) {
						finishSubAgentActivity(toolCall.id, 'cancelled');
						return { id: toolCall.id, name: toolCall.name, success: false, error: 'Sub-agent run cancelled.', durationMs: Date.now() - started };
				}
				// The model may not support native tool calling — plain text fallback.
					const fallback = await withEscapeCancellation(delegatedClient, () => delegatedClient.complete(delegatedMessages, undefined));
				result = {
					content: fallback.content,
					toolCalls: fallback.toolCalls.length > 0 ? fallback.toolCalls : parseToolCallsFromText(fallback.content),
				};
			}

			const toolCalls = dedup(result.toolCalls);
			if (toolCalls.length === 0) {
				finalText = result.content.trim();
				break;
			}

			delegatedMessages.push({
				id: crypto.randomUUID(),
				role: 'assistant',
				content: result.content || '',
				toolCalls,
				timestamp: new Date(),
			});

			for (const tc of toolCalls) {
				const execution = await executeToolWithReview(tc.name, tc.arguments, projectRoot, input, permissionMode, allowedCommands);
				const toolResult = execution.toolResult;
					const target = String(tc.arguments.path ?? tc.arguments.command ?? task).slice(0, 80);
					recordSubAgentActivity(toolCall.id, `${tc.name} ${target} — ${toolResult.success ? 'ok' : 'failed'}`);
				recordTaskAction(taskState, `[${agent.name}] ${tc.name} ${target} ${toolResult.success ? 'ok' : 'failed'}`);
				delegatedMessages.push({
					id: tc.id,
					role: 'tool',
					content: (toolResult.success ? 'Result: ' : 'Error: ') + (toolResult.success ? (toolResult.output ?? '') : toolResult.error),
					timestamp: new Date(),
				});
				logAgentTermoTimeline(`Sub-agent ${agent.name} tool: ${tc.name} -- ${toolResult.success ? 'OK' : 'ERR'}`, projectRoot);
			}
		}

			const output = finalText || '(sub-agent returned no text)';
			finishSubAgentActivity(toolCall.id, 'completed', output);
		logAgentTermoTimeline(`Sub-agent ${agent.name} completed delegated task: ${task.slice(0, 120)}`, projectRoot);
		void appendToTimeline(projectRoot, agent.name, 'Delegated task completed', [`Task: ${task.slice(0, 300)}`], [`Summary: ${output.replace(/\s+/g, ' ').slice(0, 400)}`]);
		return { id: toolCall.id, name: toolCall.name, success: true, output: `[${agent.name}]\n${output}`, durationMs: Date.now() - started };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			finishSubAgentActivity(toolCall.id, 'failed', message);
		logAgentTermoTimeline(`Sub-agent ${agent.name} failed: ${message.slice(0, 120)}`, projectRoot);
		return { id: toolCall.id, name: toolCall.name, success: false, error: message, durationMs: Date.now() - started };
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
	permissionMode: PermissionMode,
	allowedCommands: Set<string>,
	taskState: TaskState,
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

				// Execute all delegation calls in parallel. Ordinary tools stay sequential
				// because concurrent writes or terminal commands can race with each other.
				const allDelegations = shouldRunDelegationsInParallel(toolCalls);
				const executions: Array<{ toolResult: { success: boolean; output?: string; error?: string }; applied: boolean; change?: ProposedFileChange }> = [];
				if (allDelegations) {
					executions.push(...await Promise.all(toolCalls.map((tc) => runDelegatedAgent(projectRoot, tc, nimClient, input, permissionMode, allowedCommands, taskState).then((toolResult) => ({ toolResult, applied: false })) )));
				} else {
					for (const tc of toolCalls) {
						executions.push(tc.name === 'agent:delegate'
							? { toolResult: await runDelegatedAgent(projectRoot, tc, nimClient, input, permissionMode, allowedCommands, taskState), applied: false }
							: await executeToolWithReview(tc.name, tc.arguments, projectRoot, input, permissionMode, allowedCommands));
					}
				}

				for (const [index, tc] of toolCalls.entries()) {
					const execution = executions[index]!;

				const toolResult = execution.toolResult;
				// Delegated runs bypass executeToolWithReview, so show their
				// result explicitly instead of only feeding it to the model.
				if (tc.name === 'agent:delegate') printToolResult(tc.name, toolResult);
			const statusText = toolResult.success ? 'OK' : ('ERR: ' + (toolResult.error ? toolResult.error.slice(0, 80) : 'unknown error'));
			const changeNote = execution.change ? (execution.applied ? ' (applied)' : ' (rejected)') : '';
			const target = String(tc.arguments.path ?? tc.arguments.command ?? tc.arguments.task ?? '').slice(0, 80);
			recordTaskAction(taskState, `${tc.name} ${target} ${execution.applied ? '(applied)' : toolResult.success ? 'ok' : 'failed'}`);

				conversation.push({
					id: tc.id,
					role: 'tool',
				content: (toolResult.success ? 'Result: ' : 'Error: ') + (toolResult.success ? (toolResult.output ?? '') : toolResult.error) + changeNote,
				timestamp: new Date(),
			});

				logAgentTermoTimeline('Tool: ' + tc.name + ' -- ' + statusText + changeNote, projectRoot);
				const activity = describeToolActivity(tc.name, tc.arguments, toolResult.output, execution.change, execution.applied, toolResult.success);
				void appendToTimeline(projectRoot, 'Agent-Termo', 'Tool execution: ' + tc.name, activity.actions, activity.notes);
			}

			// Send conversation (including tool results) back to the LLM
			// The LLM will either produce text or more tool calls
			startSpinner('Working');
		let result: { content: string; toolCalls: ToolCall[] };
		try {
			const tools = nimClient.buildToolDefs(TOOL_DEFINITIONS);
			try {
					result = await withEscapeCancellation(nimClient, () => nimClient.complete(conversation, tools));
			} catch (transient) {
				if (isRequestCancelled(transient) || !isTransientError(transient)) throw transient;
				// One automatic retry for transient provider failures so a
				// long task does not die mid-flight on a blip.
				printInfo('Transient provider error (' + providerError(transient) + ') — retrying…');
				await new Promise((delay) => setTimeout(delay, 1500));
					result = await withEscapeCancellation(nimClient, () => nimClient.complete(conversation, tools));
			}
			setScreenStatus({ usage: nimClient.formatUsage() });
			} catch (err) {
				if (isRequestCancelled(err)) {
					stopSpinner();
					// The task can be resumed with "continue".
					taskState.status = 'interrupted';
					taskState.reason = 'cancelled by user';
					printInfo('Task paused. Type "continue" to resume from where it stopped.');
					return '';
				}
				// and parse any JSON tool calls emitted in the content.
				try {
					const fallback = await withEscapeCancellation(nimClient, () => nimClient.complete(conversation, undefined));
				setScreenStatus({ usage: nimClient.formatUsage() });
				result = {
					content: fallback.content,
					toolCalls: fallback.toolCalls.length > 0 ? fallback.toolCalls : parseToolCallsFromText(fallback.content),
				};
				} catch (err2) {
					stopSpinner();
					printError('NVIDIA NIM provider error: ' + providerError(err2));
					// Keep everything done so far and let "continue" resume the task.
					taskState.status = 'interrupted';
					taskState.reason = providerError(err2);
					appendToSessionLog('### Interrupted task\n\nGoal: ' + taskState.goal + '\nReason: ' + taskState.reason + '\nLast actions: ' + taskState.lastActions.join('; '), projectRoot);
					printInfo('The task was interrupted. Type "continue" to resume from where it stopped.');
					// Do not return stale narration from an earlier turn; the
					// caller must not treat this interrupted run as finished.
					return '';
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

	if (finalText.trim()) {
		void appendToTimeline(projectRoot, 'Agent-Termo', 'Completed tool-assisted request', ['Assistant summary: ' + finalText.replace(/\s+/g, ' ').slice(0, 700)], []);
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

	// One canonical layout: shared project docs live in docs/, while agents,
	// commands and private logs live under .agent-termo/. Older versions also
	// wrote .agent-termo/memory.md and timeline.md; those are migrated here.
	try {
		ensureAgentStructure(projectRoot);
	} catch {
		// Read-only filesystem or similar: tools will surface the error.
	}

	const memory = await loadMemory(projectRoot);
	// Recent session log gives the session (and a later "continue") context
	// from previous sessions, including interrupted tasks.
	const recentSession = loadSessionLog(projectRoot);
	const memoryContext = recentSession ? recentSession.slice(-4000) : '';
	const nimClient = new NimClient(projectRoot);
	let permissionMode: PermissionMode = process.env.AGENT_TERMO_PERMISSION_MODE === 'files'
		? 'files'
		: process.env.AGENT_TERMO_PERMISSION_MODE === 'auto' || process.env.AGENT_TERMO_AUTO_APPROVE === '1'
			? 'auto'
			: 'ask';
	const allowedCommands = loadAllowedCommands(projectRoot);
	const agentRoot = resolve(projectRoot, '.agent-termo');
	let customAgents = loadProjectAgents(projectRoot);
	setAgentNames(customAgents.map((agent) => agent.name));
	const contextFiles = discoverProjectFiles(projectRoot);
	setContextFiles(contextFiles);
	// Stream live bash output into the terminal panel below the input box.
	setTerminalHooks({
		onStart: startTerminalPanel,
		onOutput: appendTerminalOutput,
		onEnd: finishTerminalPanel,
	});
	let customCommands: AgentCommand[] = loadAgentCommands(projectRoot);
	const refreshCommandCompletion = (): void => {
		setCommands([...COMMANDS, ...customCommands.map((command) => ({ name: '/' + command.name, description: command.description || 'project command' }))]);
	};
	refreshCommandCompletion();
	let activeAgentName = '';
	let activeAgentPrompt = '';
	let currentGoal = '';
	const taskState = newTaskState();
	const buildSessionPrompt = (): string => {
		let prompt = buildSystemPrompt(memory, '', projectRoot, activeAgentPrompt);
		if (memoryContext) prompt += '\n\n## Recent Session Log (previous sessions, may include interrupted tasks)\n' + memoryContext;
		if (taskState.goal && taskState.status !== 'idle') {
			prompt += '\n\n## Active Task\n' + taskState.goal + '\nStatus: ' + taskState.status + (taskState.reason ? ' (' + taskState.reason + ')' : '');
		}
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
	setScreenStatus({ usage: nimClient.formatUsage() });
	setPermissionMode(permissionMode);
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
			let stopBackgroundCommands: () => void = () => undefined;
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
						if (cmd === '/permissions' || cmd.startsWith('/permissions ')) {
							const requested = userInput.trim().slice('/permissions'.length).trim().toLowerCase();
							if (requested === 'auto' || requested === 'yes' || requested === 'on' || requested === 'skip' || requested === 'always') permissionMode = 'auto';
							else if (requested === 'files' || requested === 'file' || requested === 'safe') permissionMode = 'files';
							else if (requested === 'ask' || requested === 'off' || requested === 'no') permissionMode = 'ask';
							else permissionMode = permissionMode === 'ask' ? 'files' : permissionMode === 'files' ? 'auto' : 'ask';
							process.env.AGENT_TERMO_PERMISSION_MODE = permissionMode;
							process.env.AGENT_TERMO_AUTO_APPROVE = permissionMode === 'auto' ? '1' : '0';
							setPermissionMode(permissionMode);
							try {
								savePermissionMode(permissionMode);
							} catch {
								printInfo('Permission mode changed for this session but could not be saved.');
							}
							printSuccess(permissionMode === 'auto' ? 'Permission mode: AUTO-ACCEPT (files and terminal commands run without prompts).' : permissionMode === 'files' ? 'Permission mode: FILES-AUTO (file changes apply; terminal commands still ask).' : 'Permission mode: ASK before applying changes.');
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
						customAgents = loadProjectAgents(projectRoot);
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
						printInfo(`Permissions: ${permissionMode.toUpperCase()}`);
						printInfo(`Token usage: ${nimClient.formatUsage()}`);
						printInfo(`Agent: ${activeAgentName || '(default)'}`);
						printInfo(`Goal: ${currentGoal || '(none)'}`);
						printInfo(`Messages: ${conversation.length - 1}`);
						continue mainLoop;
					}
					if (cmd === '/terminal' || cmd.startsWith('/terminal ')) {
						printUserMessage(userInput);
						displayedInput = true;
						const sub = cmd.slice('/terminal'.length).trim().toLowerCase();
						if (sub === 'kill' || sub === 'stop') {
							if (killRunningTerminal()) {
								printInfo('Agent terminal command killed.');
							} else {
								printInfo('No terminal command is running.');
							}
						} else if (sub === 'list' || sub === 'status' || sub === '') {
							const { terminalPanelVisible, terminalPanelState } = await import('./ui/screen.js');
							const visible = terminalPanelVisible();
							const state = terminalPanelState();
							if (state) {
								const status = state.exitCode === null ? 'running' : state.exitCode === 0 ? 'exit ' + state.exitCode : 'exit ' + state.exitCode + ' (failed)';
								printInfo('Terminal: ' + state.command + ' — ' + status);
								if (!visible) printInfo('(panel closed — press Ctrl+O to open)');
							} else {
								printInfo('No terminal session.');
							}
						} else {
							printInfo('Usage: /terminal [list|kill] — list shows status, kill stops running command.');
						}
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
						if (cmd === '/subagents' || cmd.startsWith('/subagents ')) {
							printSubAgents(userInput.trim().slice('/subagents'.length).trim() || undefined);
							continue mainLoop;
						}
					if (cmd === '/exit' || cmd === '/quit') {
					cleanup();
					break;
				}

				if (cmd === '/continue') {
					// Falls through to the shared "continue" handling below the
					// command block, which resumes an interrupted task in place.
					printUserMessage(userInput);
					displayedInput = true;
				} else {
					printError('Unknown command: ' + cmd, 'Type /help for available commands.');
					continue mainLoop;
				}
			}

			// "continue" / "/continue" resumes an interrupted task from the exact
			// point where it stopped instead of restarting from scratch.
			const wantsContinue = isContinueRequest(rawInput);
			if (wantsContinue && taskState.status === 'idle') {
				printInfo('Nothing to continue — no task is in progress or interrupted.');
				continue mainLoop;
			}
			const continuing = wantsContinue && taskState.status !== 'idle';
			if (continuing) {
				if (!displayedInput) {
					printUserMessage(rawInput);
					displayedInput = true;
				}
				printInfo('Resuming interrupted task from where it stopped…');
				userInput = buildContinueMessage(taskState);
				taskState.status = 'running';
				taskState.reason = '';
			} else {
				taskState.goal = userInput.replace(/\s+/g, ' ').slice(0, 300);
				taskState.reason = '';
				taskState.lastActions = [];
				taskState.status = 'running';
			}

			const userMsg: ConversationMessage = {
				id: crypto.randomUUID(),
				role: 'user',
				content: userInput,
				timestamp: new Date(),
				};
				conversation.push(userMsg);
				rememberChat(projectRoot, 'User', userInput);
				void appendToTimeline(projectRoot, activeAgentName || 'Agent-Termo', 'User request', ['Request: ' + userInput.replace(/\s+/g, ' ').slice(0, 700)], []);
				if (!displayedInput) printUserMessage(userInput);
				stopBackgroundCommands = startBackgroundCommandListener((command) => {
					printSubAgents(command.slice('/subagents'.length).trim() || undefined);
				});

				// Tools are always available: gating them by keywords made the agent
			// break mid-task whenever a follow-up message lacked a trigger word.
			const tools = nimClient.buildToolDefs(TOOL_DEFINITIONS);

				{
					startSpinner('Working');
					try {
							const result = await withEscapeCancellation(nimClient, () => nimClient.complete(conversation, tools));
						setScreenStatus({ usage: nimClient.formatUsage() });
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
						const finalText = await runToolLoop(conversation, projectRoot, toolCalls, input, nimClient, permissionMode, allowedCommands, taskState);
						if (finalText && finalText.trim() && finalText.trim() !== 'null') {
							printAssistantMessage(finalText.trim());
						}
					}
					} catch (err) {
						stopSpinner();
						if (isRequestCancelled(err)) {
							// The task can be resumed with "continue".
							if (taskState.status === 'running') {
								taskState.status = 'interrupted';
								taskState.reason = 'cancelled by user';
									printInfo('Task paused. Type "continue" to resume from where it stopped.');
								}
								stopBackgroundCommands();
								continue mainLoop;
						}
						// Tool calling failed (e.g. HTTP 400 because the model does not
					// support the `tools` parameter). Retry without tools and parse
					// any JSON tool calls the model may have emitted as plain text.
						printInfo('NVIDIA NIM tool request failed: ' + providerError(err) + ' — retrying without tools.');
						try {
								const fallback = await withEscapeCancellation(nimClient, () => nimClient.complete(conversation, undefined));
							setScreenStatus({ usage: nimClient.formatUsage() });
						const toolCalls = dedup(
							fallback.toolCalls.length > 0 ? fallback.toolCalls : parseToolCallsFromText(fallback.content),
						);
						if (toolCalls.length > 0) {
							const narration = (fallback.content ?? '').trim().replace(/^null$/, '').trim();
							if (narration && !narration.includes('"tool_calls"')) printAssistantMessage(narration);
							const finalText = await runToolLoop(conversation, projectRoot, toolCalls, input, nimClient, permissionMode, allowedCommands, taskState);
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
						printError('NVIDIA NIM provider error: ' + providerError(err2));
						// Keep the conversation intact so "continue" can resume.
						if (taskState.status === 'running') {
							taskState.status = 'interrupted';
							taskState.reason = providerError(err2);
							appendToSessionLog('### Interrupted task\n\nGoal: ' + taskState.goal + '\nReason: ' + taskState.reason + '\nLast actions: ' + taskState.lastActions.join('; '), projectRoot);
								printInfo('The task was interrupted. Type "continue" to resume from where it stopped.');
							}
							stopBackgroundCommands();
							continue mainLoop;
					}
				}
			}

				stopBackgroundCommands();

				// The run reached the end without throwing: the task is complete,
			// unless it was interrupted and must remain resumable with "continue".
			finishTaskState(taskState);

			if (conversation.length > 42) {
				compactConversation(conversation);
			}
			} catch (err) {
				input.close();
			stopSpinner();
			printError('Session error: ' + (err instanceof Error ? err.message : String(err)));
			if (taskState.status === 'running') {
				taskState.status = 'interrupted';
				taskState.reason = err instanceof Error ? err.message : String(err);
				appendToSessionLog('### Interrupted task\n\nGoal: ' + taskState.goal + '\nReason: ' + taskState.reason + '\nLast actions: ' + taskState.lastActions.join('; '), projectRoot);
				printInfo('The task was interrupted. Type "continue" to resume from where it stopped.');
			}
		}
	}
}

function rememberChat(projectRoot: string, role: 'User' | 'Assistant', content: string): void {
	const trimmed = content.trim();
	if (trimmed) appendToSessionLog('### ' + role + '\n\n' + trimmed.slice(0, 12000), projectRoot);
}
