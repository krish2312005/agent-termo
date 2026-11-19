// =============================================================================
// Terminal UI — chalk-based styling, markdown output, diff viewer
// Layout (pinned input box, scroll region) and keyboard input live in screen.ts
// =============================================================================

import Chalk from 'chalk';
import type { ProposedFileChange } from '../types/index.js';
import { loadMemory, loadTimeline } from '../memory/index.js';
import { getSubAgent, listSubAgents, subscribeSubAgents } from '../runtime/subagents.js';
import { buildInspector, formatDuration, statusIcon } from './subagent-view.js';
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
	setContextFiles,
	setPermissionMode,
	setNextInput,
	setCommands,
	startTerminalPanel,
	appendTerminalOutput,
	finishTerminalPanel,
	startBackgroundCommandListener,
	clearTerminalPanel,
	toggleTerminalPanel,
	terminalPanelVisible,
	terminalPanelState,
	type InputController,
	type PickItem,
} from './screen.js';

const c: typeof Chalk = Chalk as unknown as typeof Chalk;
const out = process.stdout;

export const COMMANDS: CommandInfo[] = [
	{ name: '/help', description: 'show all commands' },
	{ name: '/clear', description: 'clear conversation & screen' },
	{ name: '/sessions', description: 'browse saved conversations' },
	{ name: '/resume', description: 'restore a saved conversation' },
	{ name: '/fork', description: 'branch a conversation from a saved session' },
	{ name: '/plan', description: 'create, approve, and track an execution plan' },
	{ name: '/checkpoint', description: 'create a manual rollback checkpoint' },
	{ name: '/checkpoints', description: 'list saved file-change checkpoints' },
	{ name: '/undo', description: 'restore the latest or selected checkpoint' },
	{ name: '/redo', description: 'reapply the most recently undone checkpoint' },
	{ name: '/memory', description: 'view project memory (docs/MEMORY.md)' },
	{ name: '/timeline', description: 'view project timeline (docs/TIMELINE.md)' },
		{ name: '/model', description: 'switch NVIDIA NIM model (or /model <id>)' },
			{ name: '/thinking', description: 'select NVIDIA reasoning capacity' },
			{ name: '/permissions', description: 'ask, files, or auto; terminal approvals can be remembered with A' },
		{ name: '/agents', description: 'list all agents' },
		{ name: '/skill', description: 'discover, use, create, import, and delete skills' },
		{ name: '/agent', description: 'select a custom agent' },
		{ name: '/agent-folder', description: 'create or refresh .agent-termo agents and commands' },
		{ name: '/goal', description: 'set or show the current goal' },
		{ name: '/status', description: 'show session status' },
		{ name: '/terminal', description: 'manage agent terminal (list, kill)' },
		{ name: '/context', description: 'show context and runtime paths' },
		{ name: '/compact', description: 'summarize and compact conversation context' },
		{ name: '/continue', description: 'resume an interrupted task from where it stopped' },
		{ name: '/report', description: 'analyze the project and create a report file' },
		{ name: '/history', description: 'show message count' },
		{ name: '/subagents', description: 'show running and completed sub-agent work' },
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
	// The box is wide enough that the model name is always shown in full —
	// never truncated by a label or a narrow box.
	const width = Math.max(40, Math.min(terminalWidth() - 2, Math.max(64, model.length + 14)));
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
	private partialLine = false;

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
		else if (this.partialLine) out.write('\n');
		this.pending = '';
		this.partialLine = false;
	}

	/** Render the current line immediately, even when the model has not emitted a newline yet. */
	flushPartial(): void {
		if (!this.pending) return;
		if (this.first) {
			this.beforeFirstOutput?.();
			out.write('\n');
		}
		const prefix = this.first ? c.magenta('● ') : this.partialLine ? '' : '  ';
		this.first = false;
		out.write(prefix + this.render(this.pending));
		this.pending = '';
		this.partialLine = true;
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
		const prefix = this.first ? c.magenta('● ') : this.partialLine ? '' : '  ';
		this.first = false;
		// Blank prose lines stay empty (no trailing indent); code keeps its gutter.
		out.write(blank && !this.inCode ? '\n' : prefix + this.render(line) + '\n');
		this.partialLine = false;
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

// Sub-agent state lives in runtime/subagents.ts; /subagents and the live monitor
// (screen.ts) are two views of it. These lines mark spawn and completion in the
// scrolling output.
subscribeSubAgents((event) => {
	const activity = event.id ? getSubAgent(event.id) : undefined;
	if (!activity) return;
	if (event.type === 'spawned') {
		out.write(c.magenta('◆ ') + c.bold(activity.agent) + c.dim(' started in parallel') + '\n');
	} else if (event.type === 'finished') {
		const duration = formatDuration((activity.endedAt ?? Date.now()) - activity.startedAt);
		out.write(c.magenta('◆ ') + statusIcon(activity.status) + ' ' + activity.agent + c.dim(` finished in ${duration}`) + '\n');
	}
});

export function printSubAgents(selectedId?: string): void {
	const activities = listSubAgents();
	if (activities.length === 0) {
		printInfo('No sub-agent activity in this session.');
		return;
	}
	if (selectedId) {
		const activity = getSubAgent(selectedId);
		if (!activity) {
			printInfo('Unknown sub-agent. Use /subagents to list activity IDs.');
			return;
		}
		const { head, body } = buildInspector(activity, Math.max(20, Math.min(terminalWidth() - 2, 100)));
		out.write('\n' + c.bold('Sub-agent ' + activity.agent) + c.dim(` [${activity.id}]`) + '\n' + rule() + '\n');
		for (const line of [...head, ...body]) out.write(line + '\n');
		out.write('\n');
		return;
	}
	out.write('\n' + c.bold('Sub-agents') + '\n' + rule() + '\n');
	for (const activity of activities) {
		const duration = formatDuration((activity.endedAt ?? Date.now()) - activity.startedAt);
		out.write(
			`${statusIcon(activity.status)} ${c.cyan(activity.id.padEnd(12))} ${clipText(activity.agent, 24).padEnd(24)} ${activity.status.padEnd(9)} ${duration.padStart(6)} — ` +
				`${clipText(activity.task.replace(/\s+/g, ' '), Math.max(20, terminalWidth() - 60))}\n`,
		);
	}
	out.write(c.dim('Use /subagents <id> to inspect one sub-agent.') + '\n\n');
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
			const message = (result.error ?? 'unknown error').split('\n').find((line) => line.trim())?.trim() ?? 'unknown error';
			out.write(c.dim('  ⎿  ') + c.red('✗ ' + clipText(`${toolName}: ${message}`, room)) + '\n');
		}
}

// =============================================================================
// DIFF VIEWER
// =============================================================================

function highlightCode(text: string, filePath: string): string {
	const language = filePath.split('.').pop()?.toLowerCase() ?? '';
	const keywords = new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'interface', 'type', 'import', 'from', 'export', 'async', 'await', 'new', 'public', 'private', 'def', 'in', 'try', 'catch', 'finally', 'throw', 'extends', 'implements', 'package', 'fun', 'fn', 'struct']);
	const types = new Set(['string', 'number', 'boolean', 'void', 'unknown', 'any', 'true', 'false', 'null', 'undefined', 'None', 'True', 'False']);
	const token = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*|#.*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;
	let last = 0;
	let result = '';
	for (const match of text.matchAll(token)) {
		const index = match.index ?? 0;
		result += text.slice(last, index);
		const value = match[0];
		if (value.startsWith('//') || value.startsWith('#')) result += c.dim.green(value);
		else if (value.startsWith('"') || value.startsWith("'") || value.startsWith('`')) result += c.green(value);
		else if (/^\d/.test(value)) result += c.yellow(value);
		else if (keywords.has(value)) result += c.magenta.bold(value);
		else if (types.has(value)) result += c.cyan(value);
		else if (language === 'json' && /^[A-Za-z_$]/.test(value)) result += c.blue(value);
		else result += value;
		last = index + value.length;
	}
	return result + text.slice(last);
}

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
			const coloredNumber = line.type === 'add' ? c.green(num) : line.type === 'remove' ? c.red(num) : c.dim(num);
			out.write('  ' + color(prefix) + coloredNumber + c.dim(' │ ') + highlightCode(text, diff.file) + '\n');
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
				}, () => answer('cancelled'));
		});
	}

export function promptCommandApproval(command: string): Promise<'once' | 'always' | 'reject'> {
	out.write('\n' + c.yellow('? ') + c.bold('Allow terminal command? ') + c.cyan(clipText(command, terminalWidth() - 24)) + '\n');
	out.write(c.dim('  [Y] once  [A] always for this exact command  [N] reject '));
	return new Promise((resolve) => {
		let done = false;
		let stop: () => void = () => undefined;
		const answer = (value: 'once' | 'always' | 'reject'): void => {
			if (done) return;
			done = true;
			stop();
			out.write(value === 'reject' ? c.red('no\n') : value === 'always' ? c.green('always\n') : c.green('yes\n'));
			resolve(value);
		};
		stop = listenKeys((key) => {
			const first = key.text?.[0]?.toLowerCase();
			if (key.name === 'enter' || first === 'y') answer('once');
			else if (first === 'a') answer('always');
			else if (key.name === 'escape' || key.name === 'ctrl+c' || first === 'n') answer('reject');
		}, () => answer('reject'));
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

export async function printMemoryFile(projectRoot: string): Promise<void> {
	const mem = await loadMemory(projectRoot);
	if (!mem.trim()) {
		printInfo('Project memory is empty (docs/MEMORY.md).');
		return;
	}
	out.write('\n' + c.bold('Project memory') + c.dim(' (docs/MEMORY.md)') + '\n' + rule() + '\n' + mem + '\n' + rule() + '\n\n');
}

export async function printTimelineFile(projectRoot: string): Promise<void> {
	const tl = await loadTimeline(projectRoot);
	if (!tl || tl.trim().length === 0) {
		printInfo('Project timeline is empty (docs/TIMELINE.md).');
		return;
	}
	const lines = tl.split('\n');
	const recentCount = Math.min(40, lines.length);
	out.write('\n' + c.bold('Project timeline') + c.dim(' (docs/TIMELINE.md, recent entries)') + '\n' + rule() + '\n');
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
		['Enter', 'send the message'],
		['Shift+Enter', 'insert a new line (multi-line input)'],
		['Ctrl+O / Ctrl+T', 'close or reopen the terminal output panel'],
		['↑ / ↓', 'move between lines, or input history'],
		['Tab', 'complete a /command or @mention'],
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
