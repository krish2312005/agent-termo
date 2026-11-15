// =============================================================================
// Terminal UI — chalk-based styling, markdown output, diff viewer
// Layout (pinned input box, scroll region) and keyboard input live in screen.ts
// =============================================================================

import Chalk from 'chalk';
import type { ProposedFileChange } from '../types/index.js';
import { loadAgentTermoMemory, loadAgentTermoTimeline } from '../memory/index.js';
import {
	clipText,
	listenKeys,
	resetScreen,
	setCommands,
	terminalWidth,
	type CommandInfo,
} from './screen.js';

export {
	createInput,
	initScreen,
	pick,
	setScreenStatus,
	listenKeys,
	setAgentNames,
	setNextInput,
	setCommands,
	type InputController,
	type PickItem,
} from './screen.js';

const c: typeof Chalk = Chalk as unknown as typeof Chalk;
const out = process.stdout;

export const COMMANDS: CommandInfo[] = [
	{ name: '/help', description: 'show all commands' },
	{ name: '/clear', description: 'clear conversation & screen' },
	{ name: '/memory', description: 'view Agent-Termo memory' },
	{ name: '/timeline', description: 'view recent activity' },
	{ name: '/model', description: 'switch NVIDIA NIM model (or /model <id>)' },
		{ name: '/agents', description: 'list all agents' },
		{ name: '/agent', description: 'select a custom agent' },
		{ name: '/agent-folder', description: 'create or refresh .agent-termo agents and commands' },
		{ name: '/goal', description: 'set or show the current goal' },
		{ name: '/status', description: 'show session status' },
		{ name: '/context', description: 'show context and runtime paths' },
		{ name: '/compact', description: 'summarize and compact conversation context' },
		{ name: '/report', description: 'analyze the project and create a report file' },
		{ name: '/history', description: 'show message count' },
	{ name: '/exit', description: 'quit' },
];
setCommands(COMMANDS);

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
const visibleLength = (s: string): number => s.replace(ANSI_RE, '').length;
const rule = (): string => c.dim('─'.repeat(Math.max(10, Math.min(terminalWidth() - 2, 100))));

// =============================================================================
// WELCOME BANNER
// =============================================================================

export function printWelcome(projectRoot: string, model: string): void {
	const width = Math.max(40, Math.min(terminalWidth() - 2, 64));
	const inner = width - 2;
	const room = inner - 2;
	const row = (content: string): string =>
		' ' + c.magenta('│') + ' ' + content + ' '.repeat(Math.max(0, room - visibleLength(content))) + ' ' + c.magenta('│');
	const field = (label: string, value: string): string =>
		c.dim(label.padEnd(7)) + c.cyan(clipText(value, room - 7));

	out.write('\n');
	out.write(' ' + c.magenta('╭' + '─'.repeat(inner) + '╮') + '\n');
	out.write(row(c.magenta.bold('✻ Agent-Termo')) + '\n');
	out.write(row(c.dim(clipText('AI coding agent for your terminal', room))) + '\n');
	out.write(row('') + '\n');
	out.write(row(field('model', model)) + '\n');
	out.write(row(field('cwd', projectRoot)) + '\n');
	out.write(' ' + c.magenta('╰' + '─'.repeat(inner) + '╯') + '\n');
	out.write('\n');
	out.write(
		c.dim('  ') + c.cyan('/help') + c.dim(' commands · ') + c.cyan('/model') + c.dim(' switch NIM model · ') +
			c.cyan('@agent') + c.dim(' invoke · ') + c.cyan('Tab') + c.dim(' completes') + '\n\n',
	);
}

// =============================================================================
// MARKDOWN OUTPUT — line-buffered so streamed replies render as they arrive
// =============================================================================

function inline(text: string): string {
	return text
		.split(/(`[^`]+`)/)
		.map((seg) =>
			seg.length > 1 && seg.startsWith('`') && seg.endsWith('`')
				? c.cyan(seg.slice(1, -1))
				: seg
					.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => c.cyan(label) + c.dim(' (' + url + ')'))
					.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_m, boldA: string, boldB: string) => c.bold(boldA ?? boldB))
					.replace(/~~(.+?)~~/g, (_m, g: string) => c.strikethrough(g))
					.replace(/(?<!\w)\*([^*\n]+)\*|(?<!\w)_([^_\n]+)_/g, (_m, italicA: string, italicB: string) => c.italic(italicA ?? italicB))
					// Chalk can disable styling in redirected or Windows terminals; delimiters
					// must still be removed even when no ANSI styling is emitted.
					.replace(/\*\*|__|~~/g, ''),
		)
		.join('');
}

export class MarkdownPrinter {
	private pending = '';
	private inCode = false;
	private first = true;
	private lastBlank = false;

	/** `beforeFirstOutput` runs once, just before the first line is printed (stop the spinner there). */
	constructor(private readonly beforeFirstOutput?: () => void) {}

	push(text: string): void {
		this.pending += text;
		let nl = this.pending.indexOf('\n');
		while (nl !== -1) {
			const line = this.pending.slice(0, nl).replace(/\r$/, '');
			this.pending = this.pending.slice(nl + 1);
			this.emit(line);
			nl = this.pending.indexOf('\n');
		}
	}

	end(): void {
		if (this.pending) this.emit(this.pending.replace(/\r$/, ''));
		this.pending = '';
	}

	get printed(): boolean {
		return !this.first;
	}

	private emit(line: string): void {
		const blank = line.trim() === '';
		if (!this.inCode && blank && (this.first || this.lastBlank)) return;
		this.lastBlank = blank && !this.inCode;

		if (this.first) {
			this.beforeFirstOutput?.();
			out.write('\n');
		}
		const prefix = this.first ? c.magenta('● ') : '  ';
		this.first = false;
		// Blank prose lines stay empty (no trailing indent); code keeps its gutter.
		out.write(blank && !this.inCode ? '\n' : prefix + this.render(line) + '\n');
	}

	private render(line: string): string {
		const fence = /^\s*```\s*([\w+-]*)/.exec(line);
		if (fence) {
			this.inCode = !this.inCode;
			return this.inCode ? c.dim('┌─ ' + (fence[1] || 'code')) : c.dim('└─');
		}
		if (this.inCode) return c.dim('│ ') + c.cyan(line.replace(/\t/g, '  '));

		const heading = /^#{1,6}\s+(.*)$/.exec(line);
		if (heading) return c.bold.magenta(inline(heading[1] ?? ''));
		if (/^\s*([-*_])\1{2,}\s*$/.test(line)) return c.dim('─'.repeat(Math.min(40, terminalWidth() - 4)));

		const task = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
		if (task) return (task[1] ?? '') + c.magenta(task[2]?.toLowerCase() === 'x' ? '☑' : '☐') + ' ' + inline(task[3] ?? '');
		const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
		if (bullet) return (bullet[1] ?? '') + c.magenta('•') + ' ' + inline(bullet[2] ?? '');

		const numbered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
		if (numbered) return (numbered[1] ?? '') + c.magenta(numbered[2] + '.') + ' ' + inline(numbered[3] ?? '');
		if (/^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/.test(line)) return c.dim('─'.repeat(Math.min(terminalWidth() - 4, 80)));
		if (/^\s*\|.*\|\s*$/.test(line)) {
			const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => inline(cell.trim()));
			return c.dim('│ ') + cells.join(c.dim(' │ ')) + c.dim(' │');
		}

		const quote = /^>\s?(.*)$/.exec(line);
		if (quote) return c.dim('▎ ') + c.italic(inline(quote[1] ?? ''));

		return inline(line);
	}
}

// =============================================================================
// MESSAGE DISPLAY
// =============================================================================

export function printUserMessage(text: string): void {
	const lines = text.split('\n');
	out.write('\n' + c.green.bold('❯ ') + c.bold(lines[0] ?? '') + '\n');
	for (const l of lines.slice(1)) out.write('  ' + c.bold(l) + '\n');
}

export function printAssistantMessage(content: string): void {
	const md = new MarkdownPrinter();
	md.push(content);
	md.end();
}

// =============================================================================
// TOOL CALL DISPLAY
// =============================================================================

export function printToolCall(toolName: string, args: Record<string, unknown>): void {
	const summary = Object.entries(args)
		.map(([k, v]) => {
			const raw = typeof v === 'string' ? v : JSON.stringify(v);
			return k + '=' + clipText(String(raw ?? '').replace(/\s+/g, ' '), 40);
		})
		.join(', ');
	const room = terminalWidth() - toolName.length - 6;
	out.write('\n' + c.blue('● ') + c.bold(toolName) + c.dim('(' + clipText(summary, room) + ')') + '\n');
}

export function printToolResult(
	toolName: string,
	result: { success: boolean; output?: string; error?: string },
	parsedOutput?: { needsApproval?: boolean; proposedChange?: ProposedFileChange },
): void {
	// A proposed file change is shown as a diff, then the accept/reject prompt.
	if (parsedOutput?.needsApproval && parsedOutput.proposedChange) {
		printDiffViewer(parsedOutput.proposedChange);
		return;
	}

	const room = terminalWidth() - 8;
	if (result.success) {
		// One line of output is shown as-is; longer output (file contents, command
		// logs) is summarised, since the full text goes to the model.
		const lines = (result.output ?? '').split('\n').filter((l) => l.trim() !== '');
		const summary = lines.length > 1 ? `${lines.length} lines` : clipText((lines[0] ?? '').trim() || 'done', room);
		out.write(c.dim('  ⎿  ') + c.green('✓ ') + summary + '\n');
	} else {
		const message = (result.error ?? 'unknown error').split('\n')[0] ?? 'unknown error';
		out.write(c.dim('  ⎿  ') + c.red('✗ ' + clipText(`${toolName}: ${message}`, room)) + '\n');
	}
}

// =============================================================================
// DIFF VIEWER
// =============================================================================

export function printDiffViewer(change: ProposedFileChange): void {
	const diff = change.diff;
	const room = Math.max(20, terminalWidth() - 14);

	const label = change.isDeletion
		? c.red('DELETE')
		: change.isNewFile
			? c.green('NEW')
			: c.blue('MODIFY');

	out.write('\n  ' + c.bold.cyan(diff.file) + '  ' + label + '  ' + c.green('+' + diff.additions) + ' ' + c.red('-' + diff.deletions) + '\n');
	out.write('  ' + c.dim('─'.repeat(Math.max(10, Math.min(terminalWidth() - 4, 100)))) + '\n');

	for (const line of diff.lines) {
		const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
		const color = line.type === 'add' ? c.green : line.type === 'remove' ? c.red : c.dim;
		const num = line.lineNumber > 0 ? String(line.lineNumber).padStart(4) : '    ';
		const text = clipText(line.content.replace(/\t/g, '  '), room);
		out.write('  ' + color(prefix + num + ' │ ' + text) + '\n');
	}
	out.write('\n');
}

// =============================================================================
// ACCEPT / REJECT PROMPT
// =============================================================================

export function promptAcceptReject(message: string = 'Accept this change?'): Promise<'accept' | 'reject'> {
	out.write(
		'\n' + c.yellow('? ') + c.bold(message) + c.dim(' [') + c.green('Y') + c.dim('/') + c.red('n') + c.dim('] '),
	);

	return new Promise((resolve) => {
		let done = false;
		let stop: () => void = () => undefined;

		const answer = (accepted: boolean | 'cancelled'): void => {
			done = true;
			stop();
			out.write(
				accepted === true ? c.green('yes') + '\n' : accepted === false ? c.red('no') + '\n' : c.red('cancelled') + '\n',
			);
			resolve(accepted === true ? 'accept' : 'reject');
		};

		stop = listenKeys((key) => {
			if (done) return;
			const first = key.text?.[0]?.toLowerCase();
			if (key.name === 'enter' || first === 'y') answer(true);
			else if (key.name === 'escape' || first === 'n') answer(false);
			else if (key.name === 'ctrl+c') answer('cancelled');
		});
	});
}

// =============================================================================
// STATUS MESSAGES
// =============================================================================

export function printError(message: string, hint?: string): void {
	out.write('\n' + c.red('✗ ' + message) + '\n');
	if (hint) out.write(c.dim('  Hint: ' + hint) + '\n');
}

export function printSuccess(message: string): void {
	out.write(c.green('✓ ' + message) + '\n');
}

export function printInfo(message: string): void {
	out.write(c.blue('ℹ ') + message + '\n');
}

// =============================================================================
// AGENT-TERMO MEMORY + TIMELINE DISPLAY
// =============================================================================

export async function printMemoryFile(projectRoot?: string): Promise<void> {
	const mem = loadAgentTermoMemory(projectRoot);
	if (!mem) {
		printInfo('Agent-Termo memory is empty. (Normal for new sessions.)');
		return;
	}
	out.write('\n' + c.bold('Agent-Termo memory') + '\n' + rule() + '\n' + mem + '\n' + rule() + '\n\n');
}

export async function printTimelineFile(projectRoot?: string): Promise<void> {
	const tl = loadAgentTermoTimeline(projectRoot);
	if (!tl || tl.trim().length === 0) {
		printInfo('Timeline is empty.');
		return;
	}
	const lines = tl.split('\n');
	const recentCount = Math.min(40, lines.length);
	out.write('\n' + c.bold('Agent-Termo timeline') + c.dim(' (recent entries)') + '\n' + rule() + '\n');
	out.write(lines.slice(-recentCount).join('\n') + '\n' + rule() + '\n');
	if (lines.length > recentCount) {
		out.write(c.dim('… ' + (lines.length - recentCount) + ' earlier entries hidden') + '\n');
	}
	out.write('\n');
}

// =============================================================================
// HELP + AGENTS DISPLAY
// =============================================================================

export function printHelp(): void {
	out.write('\n' + c.bold('Commands') + '\n' + rule() + '\n');
	for (const cmd of COMMANDS) {
		out.write('  ' + c.cyan(cmd.name.padEnd(11)) + c.dim(cmd.description) + '\n');
	}
	out.write('\n' + c.bold('Keys') + '\n' + rule() + '\n');
	const keys: Array<[string, string]> = [
		['↑ / ↓', 'input history'],
		['Tab', 'complete a /command'],
		['Ctrl+A / Ctrl+E', 'start / end of line'],
		['Ctrl+W / Ctrl+U', 'delete word / to line start'],
		['Ctrl+C', 'clear the line, or quit when empty'],
	];
	for (const [k, d] of keys) out.write('  ' + c.cyan(k.padEnd(17)) + c.dim(d) + '\n');
	out.write('\n');
}

export function printAgentsList(agents: Array<{ name: string; description: string }>): void {
	out.write('\n' + c.bold('Available agents') + '\n' + rule() + '\n');
	const room = Math.max(10, terminalWidth() - 34);
	for (const a of agents) {
		out.write('  ' + c.cyan(a.name.padEnd(30)) + c.dim(clipText(a.description.replace(/\s+/g, ' '), room)) + '\n');
	}
	out.write('\n');
}

// =============================================================================
// SPINNER
// =============================================================================

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerTimer: ReturnType<typeof setInterval> | null = null;

export function startSpinner(message: string): void {
	stopSpinner();
	if (!out.isTTY) {
		out.write(c.dim(message + '…') + '\n');
		return;
	}

	const startedAt = Date.now();
	let frame = 0;
	const label = clipText(message, Math.max(10, terminalWidth() - 14));
	const render = (): void => {
		const secs = Math.floor((Date.now() - startedAt) / 1000);
		out.write('\r\x1b[2K' + c.magenta(FRAMES[frame++ % FRAMES.length] ?? '⠋') + ' ' + c.dim(`${label}… ${secs}s`));
	};

	out.write('\x1b[?25l');
	render();
	spinnerTimer = setInterval(render, 80);
}

/** Stops the spinner and clears its line. The argument is kept for older call sites and is ignored. */
export function stopSpinner(_success?: boolean): void {
	if (!spinnerTimer) return;
	clearInterval(spinnerTimer);
	spinnerTimer = null;
	out.write('\r\x1b[2K\x1b[?25h');
}

export function clearScreen(): void {
	resetScreen();
}
