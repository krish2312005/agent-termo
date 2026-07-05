// =============================================================================
// Terminal UI — chalk-based, clean CLI styling with diff viewer
// =============================================================================

import Chalk from 'chalk';
import type { ProposedFileChange } from '../types/index.js';
import { loadAgentTermoMemory, loadAgentTermoTimeline } from '../memory/index.js';
import type { ConversationMessage } from '../types/index.js';

const c: typeof Chalk = Chalk as unknown as typeof Chalk;

// =============================================================================
// WELCOME BANNER
// =============================================================================

export function printWelcome(projectRoot: string): void {
	console.log('');
	console.log(c.magenta.bold(' AGENT-TERMO'));
	console.log(c.dim(' AI-Powered Terminal Coding Agent'));
	console.log('');
	console.log(c.dim(' Model: ') + c.cyan.bold('Nvidia NIM (OpenAI-compatible)'));
	console.log(c.dim(' Project: ') + c.white(projectRoot));
	console.log('');
	console.log(c.dim(' Commands:'));
	console.log(
		' ' + c.cyan('/help') + c.dim(' — show all commands') + '\n' +
		' ' + c.cyan('/clear') + c.dim(' — clear conversation & screen') + '\n' +
		' ' + c.cyan('/memory') + c.dim(' — view Agent-Termo memory') + '\n' +
		' ' + c.cyan('/timeline') + c.dim(' — view recent activity') + '\n' +
		' ' + c.cyan('/model') + c.dim(' — show current AI model') + '\n' +
		' ' + c.cyan('/agents') + c.dim(' — list all agents') + '\n' +
		' ' + c.cyan('/history') + c.dim(' — show message count') + '\n' +
		' ' + c.cyan('/exit') + c.dim(' — quit'),
	);
	console.log('');
	console.log(c.dim(' ────────────────────────────────────────────────────────────────'));
	console.log('');
}

// =============================================================================
// MESSAGE DISPLAY
// =============================================================================

export function printUserMessage(msg: ConversationMessage): void {
	const time = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false });
	console.log('\n' + c.green('[' + time + '] You'));
	console.log(c.dim('─'.repeat(80)));
	console.log(c.green(msg.content) + '\n');
}

export function printAssistantMessage(content: string): void {
	const time = new Date().toLocaleTimeString('en-US', { hour12: false });
	console.log('\n' + c.magenta('[' + time + '] Agent-Termo'));
	console.log(c.dim('─'.repeat(80)));
	console.log(c.magenta(content) + '\n');
}

// =============================================================================
// TOOL CALL DISPLAY
// =============================================================================

export function printToolCall(toolName: string, args: Record<string, unknown>): void {
	const argsSummary = Object.entries(args)
		.map(([k, v]) => k + '=' + JSON.stringify(v))
		.join(', ');
	console.log('');
	console.log(c.blue('[Tool] ') + c.cyan(toolName));
	const truncated = argsSummary.slice(0, 200);
	if (truncated) console.log(c.dim(' ' + truncated));
}

export function printToolResult(
	toolName: string,
	result: { success: boolean; output?: string; error?: string },
	parsedOutput?: { needsApproval?: boolean; proposedChange?: ProposedFileChange },
): void {
	// If the tool result contains a proposed change, show the diff + prompt
	if (parsedOutput?.needsApproval && parsedOutput.proposedChange) {
		console.log('');
		printDiffViewer(parsedOutput.proposedChange);
		return;
	}

	if (result.success) {
		const out = result.output
			? result.output.slice(0, 200) + (result.output.length > 200 ? '...' : '')
			: '(success)';
		console.log('');
		console.log(c.green('[Done] ') + c.cyan(toolName) + ' ' + c.green('OK'));
		const short = out.length > 80 ? out.slice(0, 80) + '...' : out;
		console.log(c.green(' ' + short));
	} else {
		console.log('');
		console.log(c.red('[Error] ') + c.red(toolName + ': ' + (result.error?.slice(0, 200) ?? 'unknown error')));
	}
}

// =============================================================================
// DIFF VIEWER — Claude Code-style change display
// =============================================================================

export function printDiffViewer(change: ProposedFileChange): void {
	const diff = change.diff;

	// File header
	console.log('');
	console.log(c.bold(c.cyan(' ─── ' + diff.file + ' ───')));

	// Stat line
	const actionLabel = change.isDeletion
		? c.red('[- DELETE]')
		: change.isNewFile
			? c.green('[+ NEW]')
			: c.blue('[~ MODIFY]');
	const stat = c.dim('+' + diff.additions) + ' ' + c.red('-' + diff.deletions);
	console.log(' ' + actionLabel + ' ' + stat);

	// Diff lines
	for (const line of diff.lines) {
		const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
		const color = line.type === 'add' ? c.green : line.type === 'remove' ? c.red : c.dim;
		const lineNum = line.lineNumber > 0 ? String(line.lineNumber).padStart(4) : ' ';
		console.log(' ' + color(prefix + lineNum + '│' + line.content));
	}

	// Summary footer
	console.log('');
	console.log(c.dim(' ── ') + c.green('+' + diff.additions) + c.dim(' added, ') + c.red('-' + diff.deletions) + c.dim(' removed ') + c.dim('─'));
}

// =============================================================================
// ACCEPT / REJECT PROMPT — Claude Code-style keyboard interaction
// =============================================================================

export async function promptAcceptReject(message: string = 'Accept this change?'): Promise<'accept' | 'reject'> {
	process.stdout.write('\n' + c.yellow(message) + ' ');
	process.stdout.write(c.dim('[') + c.green('Y') + c.dim('/') + c.red('n') + c.dim('] '));

	return new Promise((resolve) => {
		// Allow a flag to auto-reject (used when detecting stale REPL listeners)
		let alreadyHandled = false;

		const onData = (key: string): void => {
			if (alreadyHandled) return;
			alreadyHandled = true;
			const keyName = getKeyName(key);

			switch (keyName) {
				case 'y':
				case 'Y':
				case 'enter':
				case 'return':
					process.stdout.write(c.green('yes') + '\n');
					cleanup();
					resolve('accept');
					break;
				case 'n':
				case 'N':
				case 'escape':
					process.stdout.write(c.red('no') + '\n');
					cleanup();
					resolve('reject');
					break;
				case 'ctrl+c':
					process.stdout.write(c.red('cancelled') + '\n');
					cleanup();
					resolve('reject');
					break;
				default:
					// Ignore other keys, re-arm for next key
					alreadyHandled = false;
					break;
			}
		};

		const cleanup = (): void => {
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stdin.removeListener('data', onData);
		};

		// Remove any other stale data listeners to prevent double-handling
		const listeners = process.stdin.listenerCount('data');
		if (listeners > 5) {
			// Sanity: if there are too many listeners, something went wrong
			process.stdin.removeAllListeners('data');
		}

		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', onData);
	});
}

// =============================================================================
// STATUS MESSAGES
// =============================================================================

export function printError(message: string, hint?: string): void {
	console.log('');
	console.log(c.red('[Error] ' + message));
	if (hint) console.log(c.dim(' Hint: ' + hint));
}

export function printSuccess(message: string): void {
	console.log(c.green('Done: ' + message));
}

export function printInfo(message: string): void {
	console.log(c.blue('[Info] ') + message);
}

// =============================================================================
// AGENT-TERMO MEMORY + TIMELINE DISPLAY
// =============================================================================

function clearCurrentLine(): void {
	process.stdout.write('\x1b[2K');
}

export async function printMemoryFile(): Promise<void> {
	const mem = loadAgentTermoMemory();
	if (!mem) {
		process.stdout.write('\n');
		clearCurrentLine();
		process.stdout.write(c.blue('[Info] ') + 'Agent-Termo memory is empty. (Normal for new sessions.)\n');
		return;
	}
	process.stdout.write('\n');
	clearCurrentLine();
	process.stdout.write(c.bold('=== AGENT-TERMO MEMORY ===') + '\n');
	process.stdout.write(c.dim('─'.repeat(80)) + '\n');
	process.stdout.write(mem + '\n');
	process.stdout.write(c.dim('─'.repeat(80)) + '\n\n');
}

export async function printTimelineFile(): Promise<void> {
	const tl = loadAgentTermoTimeline();
	if (!tl || tl.trim().length === 0) {
		process.stdout.write('\n');
		clearCurrentLine();
		process.stdout.write(c.blue('[Info] ') + 'Timeline is empty.\n');
		return;
	}
	const lines = tl.split('\n');
	const totalLines = lines.length;
	const recentCount = Math.min(40, totalLines);
	const recent = lines.slice(-recentCount).join('\n');
	process.stdout.write('\n');
	clearCurrentLine();
	process.stdout.write(c.bold('=== AGENT-TERMO TIMELINE (recent entries) ===') + '\n');
	process.stdout.write(c.dim('─'.repeat(80)) + '\n');
	process.stdout.write(recent + '\n');
	process.stdout.write(c.dim('─'.repeat(80)) + '\n');
	if (totalLines > recentCount) {
		process.stdout.write(c.dim('... (' + (totalLines - recentCount) + ' earlier entries hidden)') + '\n');
	}
	process.stdout.write('\n');
}

// =============================================================================
// HELP + AGENTS DISPLAY
// =============================================================================

export function printHelp(): void {
	process.stdout.write('\n' + c.bold('Agent-Termo ') + c.dim('— available commands') + '\n');
	process.stdout.write(c.dim('─'.repeat(80)) + '\n');
	console.log(' ' + c.cyan('/help') + c.dim(' show all commands'));
	console.log(' ' + c.cyan('/clear') + c.dim(' clear conversation & screen'));
	console.log(' ' + c.cyan('/memory') + c.dim(' view Agent-Termo memory'));
	console.log(' ' + c.cyan('/timeline') + c.dim(' view recent activity'));
	console.log(' ' + c.cyan('/model') + c.dim(' show current AI model'));
	console.log(' ' + c.cyan('/agents') + c.dim(' list all agents'));
	console.log(' ' + c.cyan('/history') + c.dim(' show message count'));
	console.log(' ' + c.cyan('/exit') + c.dim(' quit'));
	console.log('');
}

export function printAgentsList(agents: Array<{ name: string; description: string }>): void {
	process.stdout.write('\n' + c.bold('Available Agents:') + '\n');
	process.stdout.write(c.dim('─'.repeat(80)) + '\n');
	for (const a of agents) {
		const short = a.description.length > 40 ? a.description.slice(0, 40) + '...' : a.description;
		process.stdout.write(' ' + c.cyan(a.name.padEnd(28)) + ' ' + c.dim(short) + '\n');
	}
	process.stdout.write(c.dim('─'.repeat(80)) + '\n\n');
}

// =============================================================================
// INPUT STATE + REPL LOOP
// =============================================================================

class InputState {
	line = '';
	cursor = 0;
	histIdx = -1;
	history: string[] = [];
	boundOnData: ((key: string) => void) | null = null;

	constructor() { this.history = []; }
}

// =============================================================================
// Cursor helpers
// =============================================================================

export function saveCursorPosition(): void {
	process.stdout.write('\x1b[s');
}

export function restoreCursorPosition(): void {
	process.stdout.write('\x1b[u');
}

export function moveToFreshLine(): void {
	process.stdout.write(' '.repeat(200) + '\r');
}

/**
 * Create an input handler that manages stdin raw mode for the REPL.
 * IMPORTANT: The listener is removed when Enter/Return is pressed to
 * prevent stale listeners from interfering with promptAcceptReject().
 */
export function createInput(): {
	question: (prompt: string) => Promise<string>;
	close: () => void;
	showPrompt: () => void;
} {
	let closeFn: (() => void) | null = null;

	return {
		async question(_prompt: string): Promise<string> {
			return new Promise<string>((resolve) => {
				process.stdin.setRawMode(true);
				process.stdin.resume();
				process.stdin.setEncoding('utf8');
				process.stdin.setMaxListeners(20);

				const state = new InputState();
				const inputPrompt = c.magenta('> ');

				function finalize(l: string): void {
					if (l.trim()) {
						state.history.unshift(l);
						if (state.history.length > 50) state.history.pop();
					}
					state.histIdx = -1;
				}

				closeFn = (): void => {
					process.stdin.setRawMode(false);
					process.stdin.pause();
					finalize('');
					if (state.boundOnData) {
						process.stdin.removeListener('data', state.boundOnData);
						state.boundOnData = null;
					}
				};

				moveToFreshLine();
				process.stdout.write(inputPrompt);
				saveCursorPosition();
				process.stdout.write('\x1b[?25h');

				function onData(key: string): void {
					const keyName = getKeyName(key);

					if (keyName === 'return' || keyName === 'enter') {
						finalize(state.line);
						process.stdout.write('\n');
						// CRITICAL: Remove listener so promptAcceptReject doesn't get double-handled
						process.stdin.removeListener('data', state.boundOnData!);
						state.boundOnData = null;
						process.stdin.setRawMode(false);
						process.stdin.pause();
						resolve(state.line);
						return;
					}

					if (keyName === 'ctrl+c') {
						finalize(state.line);
						process.stdout.write('\n');
						process.stdin.removeListener('data', state.boundOnData!);
						state.boundOnData = null;
						process.stdin.setRawMode(false);
						process.stdin.pause();
						process.exit(0);
						return;
					}

					if (keyName === 'up') {
						if (state.history.length > 0 && state.histIdx < state.history.length - 1) {
							state.histIdx++;
							state.line = state.history[state.histIdx] ?? '';
							state.cursor = state.line.length;
							restoreCursorPosition();
							process.stdout.write(' '.repeat(200) + '\r' + inputPrompt + state.line);
						}
						return;
					}

					if (keyName === 'down') {
						if (state.histIdx > 0) {
							state.histIdx--;
							state.line = state.history[state.histIdx] ?? '';
						} else {
							state.histIdx = -1;
							state.line = '';
						}
						state.cursor = state.line.length;
						restoreCursorPosition();
						process.stdout.write(' '.repeat(200) + '\r' + inputPrompt + state.line);
						return;
					}

					if (keyName === 'backspace') {
						if (state.cursor > 0) {
							state.line = state.line.slice(0, state.cursor - 1) + state.line.slice(state.cursor);
							state.cursor = Math.max(0, state.cursor - 1);
							restoreCursorPosition();
							process.stdout.write(' '.repeat(200) + '\r' + inputPrompt + state.line);
						}
						return;
					}

					if (keyName === 'left') {
						if (state.cursor > 0) {
							state.cursor--;
							restoreCursorPosition();
							process.stdout.write('\r' + inputPrompt + state.line);
						}
						return;
					}

					if (keyName === 'right') {
						if (state.cursor < state.line.length) {
							state.cursor++;
							restoreCursorPosition();
							process.stdout.write('\r' + inputPrompt + state.line);
						}
						return;
					}

					if (key.length === 1 && key.charCodeAt(0) >= 0x20) {
						state.line = state.line.slice(0, state.cursor) + key + state.line.slice(state.cursor);
						state.cursor++;
						restoreCursorPosition();
						process.stdout.write(' '.repeat(200) + '\r' + inputPrompt + state.line);
					}
				}

				state.boundOnData = (key: string) => onData(key);
				process.stdin.on('data', state.boundOnData);
			});
		},

		close(): void { if (closeFn) closeFn(); },

		showPrompt(): void {
			moveToFreshLine();
			process.stdout.write(c.magenta('> '));
			saveCursorPosition();
		},
	};
}

// =============================================================================
// SPINNER
// =============================================================================

let spinnerInterval: ReturnType<typeof setInterval> | null = null;

export function startSpinner(message: string): void {
	spinnerInterval = setInterval(() => {
		process.stdout.write('\r' + ' ' + c.dim(message) + '... ');
	}, 80);
}

export function stopSpinner(success?: boolean): void {
	if (spinnerInterval) {
		clearInterval(spinnerInterval);
		spinnerInterval = null;
	}
	if (success === true) {
		process.stdout.write('\r' + c.green('done.') + '\n');
	} else if (success === false) {
		process.stdout.write('\r' + c.red('failed.') + '\n');
	}
}

export function clearScreen(): void {
	process.stdout.write('\x1b[2J\x1b[H');
}

// =============================================================================
// KEY NAME PARSER
// =============================================================================

export function getKeyName(ch: string): string {
	if (ch === '\r') return 'return';
	if (ch === '\n') return 'enter';
	if (ch === '\x03') return 'ctrl+c';
	if (ch === '\x1b') return 'escape';
	if (ch === '\x7f' || ch === '\b') return 'backspace';
	if (ch === '\x04') return 'ctrl+d';
	if (ch === '\t') return 'tab';
	if (ch === '\x1b[A') return 'up';
	if (ch === '\x1b[B') return 'down';
	if (ch === '\x1b[C') return 'right';
	if (ch === '\x1b[D') return 'left';
	if (ch === '\x1b[3~') return 'delete';
	if (ch === '\x1b[F') return 'end';
	if (ch === '\x1b[H') return 'home';
	if (ch === '\x1b[5~') return 'pageup';
	if (ch === '\x1b[6~') return 'pagedown';
	if (ch.startsWith('\x1b[')) return ch;
	return ch.length === 1 ? ch : ch;
}
