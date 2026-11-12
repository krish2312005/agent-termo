// =============================================================================
// Agent-Termo — Main REPL entry point
// =============================================================================

import { NimClient } from './llm/client.js';
import { TOOL_DEFINITIONS } from './llm/tools.js';
import { executeTool, applyFileChange } from './tools/index.js';
import { loadMemory, logToTimeline, logAgentTermoTimeline } from './memory/index.js';
import { loadAllAgents } from './agents/index.js';
import { buildSystemPrompt } from './agents/index.js';
import { resolveProjectRoot, saveNimModel } from './utils/config.js';
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
} from './ui/index.js';
import type { ConversationMessage, ToolCall, ProposedFileChange } from './types/index.js';

const TOOL_KEYWORDS = [
	'build', 'create', 'write', 'edit', 'modify', 'file', 'code', 'function', 'class',
	'component', 'debug', 'fix', 'git', 'commit', 'push', 'install', 'npm', 'run',
	'bash', 'shell', 'command', 'read', 'grep', 'check', 'show', 'implement',
	'configure', 'setup', 'src', 'package', 'app', 'project', 'api', 'deploy',
	'test', 'compile', 'typescript', 'javascript', 'python', 'node', 'add', 'delete',
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

function extractProposedChange(toolName: string, resultOutput: string): ProposedFileChange | undefined {
	const isFileTool = toolName === 'file:write' || toolName === 'file:edit';
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
		openVsCodeDiff(proposedChange);

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
		// Execute all tool calls from this turn
		for (const tc of toolCalls) {
			const execution = await executeToolWithReview(tc.name, tc.arguments, projectRoot, input);

			const toolResult = execution.toolResult;
			const statusText = toolResult.success ? 'OK' : ('ERR: ' + (toolResult.error ? toolResult.error.slice(0, 80) : 'unknown error'));
			const changeNote = execution.change ? (execution.applied ? ' (applied)' : ' (rejected)') : '';

			conversation.push({
				id: crypto.randomUUID(),
				role: 'tool',
				content: (toolResult.success ? 'Result: ' : 'Error: ') + (toolResult.success ? (toolResult.output ?? '') : toolResult.error) + changeNote,
				timestamp: new Date(),
			});

			logToTimeline(projectRoot, 'Tool: ' + tc.name + ' -- ' + statusText + changeNote);
			logAgentTermoTimeline('Tool: ' + tc.name + ' -- ' + statusText + changeNote);
		}

		// Send conversation (including tool results) back to the LLM
		// The LLM will either produce text or more tool calls
		startSpinner('Working');
		try {
			const tools = nimClient.buildToolDefs(TOOL_DEFINITIONS);
			const result = await nimClient.complete(conversation, tools);
			finalText = result.content;
			toolCalls = dedup(result.toolCalls);
			stopSpinner();

			// If the LLM produced text alongside tool calls, save it
			if (finalText && finalText.trim() && finalText.trim() !== 'null') {
				conversation.push({
					id: crypto.randomUUID(),
					role: 'assistant',
					content: finalText.trim(),
					timestamp: new Date(),
				});
				// Narration that comes with more tool calls is shown now; the
				// final answer (no tool calls) is printed by the caller.
				if (toolCalls.length > 0) printAssistantMessage(finalText.trim());
			}
		} catch (err) {
			stopSpinner();
			printError('LLM error: ' + (err instanceof Error ? err.message : String(err)));
			break;
		}
	}

	return finalText;
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
	logAgentTermoTimeline('Model switched to ' + selected);
	logToTimeline(projectRoot, 'Model switched to ' + selected);

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
	const systemPrompt = buildSystemPrompt(memory, '', projectRoot);

	const session = { id: crypto.randomUUID(), projectRoot, startedAt: new Date() };

	const conversation: ConversationMessage[] = [
		{
			id: crypto.randomUUID(),
			role: 'system',
			content: systemPrompt,
			timestamp: new Date(),
		},
	];

	initScreen({ model: nimClient.getModel(), project: projectRoot });
	printWelcome(projectRoot, nimClient.getModel());
	logAgentTermoTimeline('Agent-Termo session started. Model: ' + nimClient.getModel());
	logToTimeline(projectRoot, 'Agent-Termo session started. Model: ' + nimClient.getModel());
	logAgentTermoTimeline('Commands: /help /clear /memory /timeline /model /agents /history');
	logToTimeline(projectRoot, 'Commands: /help /clear /memory /timeline /model /agents /history');

	const input = createInput();

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
			const userInput = await input.question('');
			if (!userInput) continue;
			if (userInput === 'exit' || userInput === 'quit') {
				cleanup();
				break;
			}

			if (userInput.startsWith('/')) {
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
					await printMemoryFile();
					continue mainLoop;
				}
				if (cmd === '/timeline' || cmd === '/tl') {
					await printTimelineFile();
					continue mainLoop;
				}
				if (cmd === '/model' || cmd.startsWith('/model ')) {
					// Take the argument from the original text: model IDs are case-sensitive.
					await handleModelCommand(userInput.trim().slice('/model'.length).trim(), nimClient, projectRoot);
					continue mainLoop;
				}
				if (cmd === '/agents') {
					const agents = loadAllAgents(process.env.AGENT_TERMO_DIR || '.claude');
					printAgentsList(agents);
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
			printUserMessage(userInput);

			const useTools = mightNeedTools(userInput);
			const tools = useTools ? nimClient.buildToolDefs(TOOL_DEFINITIONS) : undefined;

			if (useTools) {
				startSpinner('Working');
				try {
					const result = await nimClient.complete(conversation, tools);
					const fullText = result.content;
					let toolCalls = dedup(result.toolCalls);
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
					printError('LLM error: ' + (err instanceof Error ? err.message : String(err)));
					conversation.pop();
					continue mainLoop;
				}
			} else {
				// No tools — stream the response, rendering markdown line by line.
				startSpinner('Thinking');
				const md = new MarkdownPrinter(() => stopSpinner());
				try {
					const gen = nimClient.streamComplete(conversation, undefined, (text: string) => md.push(text));
					// The generator streams everything, then yields once at the end; the
					// chunks have already been rendered through the callback.
					await gen.next();
					md.end();
					stopSpinner();
				} catch {
					md.end();
					stopSpinner();
					startSpinner('Retrying');
					try {
						const result = await nimClient.complete(conversation, undefined);
						stopSpinner();
						const cleanText = (result.content ?? '').trim();
						if (cleanText) {
							conversation.push({
								id: crypto.randomUUID(),
								role: 'assistant',
								content: cleanText,
								timestamp: new Date(),
							});
							printAssistantMessage(cleanText);
						}
					} catch (err2) {
						stopSpinner();
						printError('LLM error: ' + (err2 instanceof Error ? err2.message : String(err2)));
						conversation.pop();
						continue mainLoop;
					}
				}
			}

			if (conversation.length > 42) {
				conversation.splice(1, conversation.length - 42);
			}
		} catch (err) {
			stopSpinner();
			printError('Session error: ' + (err instanceof Error ? err.message : String(err)));
		}
	}
}
