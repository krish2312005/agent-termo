// =============================================================================
// Screen layout + raw keyboard input
//
// Claude Code-style layout: output scrolls in a region at the top of the
// terminal while a bordered input box and a status line stay pinned to the
// bottom. Implemented with a DECSTBM scroll region, so every console.log /
// process.stdout.write elsewhere in the app lands in the scrolling region.
// =============================================================================

import Chalk from 'chalk';
import { createInterface } from 'node:readline';

const c: typeof Chalk = Chalk as unknown as typeof Chalk;
const out = process.stdout;

const CSI = '\x1b[';
const SAVE = '\x1b7'; // DECSC — save cursor
const RESTORE = '\x1b8'; // DECRC — restore cursor

/** Rows pinned to the bottom: top border, input row, bottom border, status row. */
const CHROME_ROWS = 4;
const MIN_ROWS = 12;
const MIN_COLS = 40;
const PLACEHOLDER = 'Ask anything… or type / for commands';

export interface CommandInfo {
	name: string;
	description: string;
}

const S = {
	active: false,
	editing: false,
	/** False when the output position saved at the start of editing is stale (resize). */
	savedValid: true,
	rows: 0,
	model: '',
	thinking: 'auto',
	project: '',
	commands: [] as CommandInfo[],
	agentNames: [] as string[],
	contextFiles: [] as string[],
	nextInput: '',
	buffer: '',
	cursor: 0,
	offset: 0,
};

export function setCommands(commands: CommandInfo[]): void {
	S.commands = commands;
}

export function setAgentNames(names: string[]): void {
	S.agentNames = [...names].sort();
}

export function setContextFiles(files: string[]): void {
	S.contextFiles = [...files].sort();
}

export function setNextInput(text: string): void {
	S.nextInput = text;
}

function dims(): { rows: number; cols: number } {
	return { rows: out.rows || 24, cols: out.columns || 80 };
}

export function terminalWidth(): number {
	return out.columns || 80;
}

export function clipText(text: string, max: number): string {
	if (max <= 0) return '';
	return text.length <= max ? text : text.slice(0, Math.max(0, max - 1)) + '…';
}

function shortPath(p: string): string {
	const home = process.env.HOME || process.env.USERPROFILE || '';
	return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

export function layoutSupported(): boolean {
	return Boolean(
		out.isTTY && process.stdin.isTTY && (out.rows ?? 0) >= MIN_ROWS && (out.columns ?? 0) >= MIN_COLS,
	);
}

// =============================================================================
// Bottom chrome (input box + status line)
// =============================================================================

function statusLine(max: number): string {
	// While typing a slash command, the status line shows matching commands.
	if (S.editing && S.buffer.startsWith('/') && !S.buffer.includes(' ')) {
		const typed = S.buffer.toLowerCase();
		const hits = S.commands.filter((cmd) => cmd.name.startsWith(typed));
		const only = hits[0];
		if (hits.length === 1 && only) {
			return ' ' + c.cyan(only.name) + c.dim(clipText(' — ' + only.description, max - only.name.length - 1));
		}
		if (hits.length > 1) {
			return c.cyan(clipText(' ' + hits.map((h) => h.name).join('  '), max));
		}
	}
	if (S.editing && /^@[^\s]*$/.test(S.buffer)) {
		const typed = S.buffer.slice(1).toLowerCase();
		const agents = S.agentNames.filter((name) => name.toLowerCase().startsWith(typed)).map((name) => '@' + name);
		const files = S.contextFiles.filter((file) => file.toLowerCase().startsWith(typed)).map((file) => '@' + file);
		const hits = [...agents, ...files].slice(0, 8);
		if (hits.length > 0) return c.cyan(clipText(' ' + hits.join('  '), max));
	}

	const hint = '/help · @agent · ctrl+c to interrupt';
	const modelPart = clipText(' ' + S.model, max);
	const thinkingPart = clipText(' · think:' + S.thinking, max);
	const roomWithHint = max - modelPart.length - thinkingPart.length - hint.length - 2;
	const showHint = roomWithHint >= 15;
	const projPart = clipText(
		' · ' + shortPath(S.project),
		showHint ? roomWithHint : Math.max(0, max - modelPart.length - thinkingPart.length),
	);
	const gap = Math.max(1, max - modelPart.length - thinkingPart.length - projPart.length - hint.length);
	return c.cyan(modelPart) + c.yellow(thinkingPart) + c.dim(projPart + (showHint ? ' '.repeat(gap) + hint : ''));
}

function chromeString(): string {
	const { rows, cols } = dims();
	const width = Math.max(1, cols - 6); // '│ ❯ ' + text + ' │'

	// Keep the cursor inside the visible window of the input line.
	S.offset = Math.min(S.offset, Math.max(0, S.buffer.length - width + 1));
	if (S.cursor < S.offset) S.offset = S.cursor;
	if (S.cursor > S.offset + width - 1) S.offset = S.cursor - width + 1;

	const edge = S.editing ? c.magenta : c.dim;
	const body = S.buffer
		? S.buffer.slice(S.offset, S.offset + width).padEnd(width)
		: c.dim(clipText(PLACEHOLDER, width).padEnd(width));

	const top = rows - 3;
	const line = (row: number, text: string): string => `${CSI}${row};1H${CSI}2K${text}`;
	return [
		line(top, edge('╭' + '─'.repeat(cols - 2) + '╮')),
		line(top + 1, edge('│') + ' ' + c.magenta.bold('❯') + ' ' + body + ' ' + edge('│')),
		line(top + 2, edge('╰' + '─'.repeat(cols - 2) + '╯')),
		line(rows, statusLine(cols - 1)),
	].join('');
}

function inputCursor(): string {
	const { rows } = dims();
	return `${CSI}${rows - 2};${5 + S.cursor - S.offset}H`;
}

function paint(): void {
	if (!S.active) return;
	if (S.editing) {
		// The saved slot holds the output position while editing: don't touch it.
		out.write(CSI + '?25l' + chromeString() + inputCursor() + CSI + '?25h');
	} else {
		out.write(SAVE + chromeString() + RESTORE);
	}
}

function regionBottom(): number {
	return Math.max(1, dims().rows - CHROME_ROWS);
}

function applyRegion(): void {
	out.write(`${CSI}1;${regionBottom()}r`); // also homes the cursor
}

function onResize(): void {
	const { rows } = dims();
	if (rows === S.rows) {
		paint();
		return;
	}
	// Height changed: old chrome rows are stale, so start from a clean screen.
	S.rows = rows;
	S.savedValid = false;
	out.write(`${CSI}2J${CSI}H`);
	applyRegion();
	out.write(chromeString() + `${CSI}${regionBottom()};1H`);
	if (S.editing) paint();
}

// =============================================================================
// Screen lifecycle
// =============================================================================

export function initScreen(info: { model: string; project: string; thinking?: string }): void {
	S.model = info.model;
	S.project = info.project;
	S.thinking = info.thinking ?? S.thinking;
	if (S.active || !layoutSupported()) return;

	S.active = true;
	S.rows = dims().rows;
	out.write(`${CSI}2J${CSI}H`);
	applyRegion();
	out.write(chromeString() + `${CSI}1;1H`);
	out.on('resize', onResize);
	process.on('exit', teardownScreen);
}

export function setScreenStatus(info: { model?: string; project?: string; thinking?: string }): void {
	if (info.model !== undefined) S.model = info.model;
	if (info.project !== undefined) S.project = info.project;
	if (info.thinking !== undefined) S.thinking = info.thinking;
	paint();
}

/** Clear everything and start output again from the top (used by /clear). */
export function resetScreen(): void {
	out.write(`${CSI}2J${CSI}H`);
	if (!S.active) return;
	applyRegion();
	out.write(chromeString() + `${CSI}1;1H`);
}

export function teardownScreen(): void {
	if (!S.active) return;
	S.active = false;

	const { rows } = dims();
	const first = Math.max(1, rows - CHROME_ROWS + 1);
	let wipe = '';
	for (let r = first; r <= rows; r++) wipe += `${CSI}${r};1H${CSI}2K`;

	// Leave the shell prompt right after the last output line.
	const head = S.editing ? '' : SAVE;
	const back = S.editing && !S.savedValid ? `${CSI}${first};1H` : RESTORE;
	out.write(head + CSI + 'r' + wipe + back + CSI + '?25h' + CSI + '?2004l');
}

// =============================================================================
// Key parsing
// =============================================================================

export interface Key {
	name: string;
	text?: string;
}

// eslint-disable-next-line no-control-regex
const TOKEN_RE = /\x1b\[200~|\x1b\[201~|\x1b\[[0-9;?]*[ -/]*[@-~]|\x1bO[A-Za-z]|\x1b[\s\S]|[\s\S]/gu;

const NAMED: Record<string, string> = {
	'\r': 'enter',
	'\n': 'enter',
	'\x03': 'ctrl+c',
	'\x04': 'ctrl+d',
	'\x7f': 'backspace',
	'\b': 'backspace',
	'\t': 'tab',
	'\x1b': 'escape',
	'\x01': 'home',
	'\x05': 'end',
	'\x15': 'ctrl+u',
	'\x0b': 'ctrl+k',
	'\x17': 'ctrl+w',
	'\x0c': 'ctrl+l',
	'\x1b[A': 'up',
	'\x1bOA': 'up',
	'\x1b[B': 'down',
	'\x1bOB': 'down',
	'\x1b[C': 'right',
	'\x1bOC': 'right',
	'\x1b[D': 'left',
	'\x1bOD': 'left',
	'\x1b[H': 'home',
	'\x1bOH': 'home',
	'\x1b[1~': 'home',
	'\x1b[F': 'end',
	'\x1bOF': 'end',
	'\x1b[4~': 'end',
	'\x1b[3~': 'delete',
	'\x1b[5~': 'pageup',
	'\x1b[6~': 'pagedown',
	'\x1b[1;5D': 'word-left',
	'\x1b[1;3D': 'word-left',
	'\x1bb': 'word-left',
	'\x1b[1;5C': 'word-right',
	'\x1b[1;3C': 'word-right',
	'\x1bf': 'word-right',
	'\x1b\x7f': 'ctrl+w',
};

/**
 * Split a stdin chunk into keys. Consecutive printable characters are merged
 * into one `text` key, and bracketed pastes arrive as a single `paste` key.
 * `state.paste` carries an unfinished paste across chunks.
 */
export function parseKeys(chunk: string, state: { paste: string | null }): Key[] {
	const keys: Key[] = [];
	let run = '';
	const flush = (): void => {
		if (run) keys.push({ name: 'text', text: run });
		run = '';
	};

	for (const tok of chunk.match(TOKEN_RE) ?? []) {
		if (tok === '\x1b[200~') {
			flush();
			state.paste = '';
			continue;
		}
		if (tok === '\x1b[201~') {
			flush();
			if (state.paste !== null) keys.push({ name: 'paste', text: state.paste });
			state.paste = null;
			continue;
		}
		if (state.paste !== null) {
			state.paste += tok;
			continue;
		}

		const named = NAMED[tok];
		if (named) {
			flush();
			keys.push({ name: named });
		} else if ((tok.codePointAt(0) ?? 0) >= 0x20 && !tok.startsWith('\x1b') && tok !== '\x7f') {
			run += tok;
		} else {
			flush();
			keys.push({ name: 'unknown' });
		}
	}
	flush();
	return keys;
}

/**
 * Put stdin in raw mode and call `handler` for every key until the returned
 * function is called, which restores the terminal.
 */
export function listenKeys(handler: (key: Key) => void, onError?: () => void): () => void {
	const stdin = process.stdin;
	const state = { paste: null as string | null };
	let stopped = false;
	const stop = (): void => {
		if (stopped) return;
		stopped = true;
		stdin.off('data', onData);
		if (out.isTTY) out.write(`${CSI}?2004l`);
		stdin.setRawMode?.(false);
		stdin.pause();
	};
	const onData = (chunk: string | Buffer): void => {
		try {
			for (const key of parseKeys(chunk.toString(), state)) handler(key);
		} catch {
			// Always release raw mode if a UI handler throws. The REPL can recover
			// on its next prompt instead of leaving the terminal permanently stuck.
			stop();
			onError?.();
		}
	};

	stdin.setRawMode?.(true);
	stdin.resume();
	stdin.setEncoding('utf8');
	if (out.isTTY) out.write(`${CSI}?2004h`); // bracketed paste
	stdin.on('data', onData);

	return stop;
}

// =============================================================================
// Line editor
// =============================================================================

function wordLeft(s: string, from: number): number {
	let i = from;
	while (i > 0 && s[i - 1] === ' ') i--;
	while (i > 0 && s[i - 1] !== ' ') i--;
	return i;
}

function wordRight(s: string, from: number): number {
	let i = from;
	while (i < s.length && s[i] === ' ') i++;
	while (i < s.length && s[i] !== ' ') i++;
	return i;
}

/** Pasted text is kept on one line: newlines become spaces, controls are dropped. */
function sanitizePaste(text: string): string {
	return [...text.replace(/\r\n|\r|\n/g, ' ').replace(/\t/g, '  ')]
		.filter((ch) => (ch.codePointAt(0) ?? 0) >= 0x20 && ch !== '\x7f')
		.join('');
}

function completeCommand(): void {
	if (S.buffer.startsWith('@') && !S.buffer.includes(' ')) {
		const prefix = S.buffer.slice(1).toLowerCase();
		const agents = S.agentNames.filter((name) => name.toLowerCase().startsWith(prefix)).map((name) => '@' + name);
		const files = S.contextFiles.filter((file) => file.toLowerCase().startsWith(prefix)).map((file) => '@' + file);
		const first = [...agents, ...files][0];
		if (first) {
			S.buffer = first + ' ';
			S.cursor = S.buffer.length;
		}
		return;
	}
	if (S.buffer.toLowerCase().startsWith('/agent ')) {
		const prefix = S.buffer.slice('/agent '.length);
		const names = S.agentNames.filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()));
		if (names.length === 0) return;
		S.buffer = '/agent ' + names[0];
		S.cursor = S.buffer.length;
		return;
	}
	if (!S.buffer.startsWith('/') || S.buffer.includes(' ')) return;
	const typed = S.buffer.toLowerCase();
	const names = S.commands.map((cmd) => cmd.name).filter((n) => n.startsWith(typed));
	const first = names[0];
	if (!first) return;

	let prefix = first;
	for (const n of names) while (!n.startsWith(prefix)) prefix = prefix.slice(0, -1);
	S.buffer = prefix;
	S.cursor = prefix.length;
}

/** Cooked-mode fallback for non-TTY stdin and terminals too small for the layout. */
function plainQuestion(): Promise<string> {
	return new Promise((resolve) => {
		const rl = createInterface({ input: process.stdin, output: process.stdout });
		rl.once('close', () => resolve('/exit'));
		rl.question('> ', (answer) => {
			rl.removeAllListeners('close');
			rl.close();
			resolve(answer.trim());
		});
	});
}

export interface InputController {
	question: (prompt?: string) => Promise<string>;
	close: () => void;
	showPrompt: () => void;
}

export function createInput(): InputController {
	const history: string[] = [];
	let stop: (() => void) | null = null;

	return {
		question(): Promise<string> {
			if (!S.active) return plainQuestion();

			return new Promise<string>((resolve) => {
					let histIdx = -1;
					let draft = S.nextInput;
					S.nextInput = '';
					let done = false;

					S.editing = true;
					S.savedValid = true;
					S.buffer = draft;
					S.cursor = draft.length;
				S.offset = 0;
				out.write(SAVE); // remember where output continues
				paint();

				// Return the cursor to the scrolling region and go idle.
					const leave = (): void => {
						done = true;
						stop?.();
						stop = null;
						S.editing = false;
						S.buffer = '';
						S.cursor = 0;
					S.offset = 0;
					out.write(S.savedValid ? RESTORE : `${CSI}${regionBottom()};1H`);
					paint();
				};

				const quit = (): void => {
					leave();
					process.emit('SIGINT'); // lets the REPL print its session summary
					process.exit(0);
				};

				const set = (text: string, cursor: number): void => {
					S.buffer = text;
					S.cursor = cursor;
					paint();
				};

				stop = listenKeys((key) => {
					if (done) return;
					const { buffer, cursor } = S;

					switch (key.name) {
						case 'enter': {
							const line = buffer.trim();
							if (line && history[0] !== line) history.unshift(line);
							if (history.length > 100) history.pop();
							leave();
							resolve(line);
							return;
						}
						case 'ctrl+c':
							if (buffer) {
								histIdx = -1;
								set('', 0);
							} else {
								quit();
							}
							return;
						case 'ctrl+d':
							if (!buffer) quit();
							else set(buffer.slice(0, cursor) + buffer.slice(cursor + 1), cursor);
							return;
						case 'backspace':
							if (cursor > 0) set(buffer.slice(0, cursor - 1) + buffer.slice(cursor), cursor - 1);
							return;
						case 'delete':
							set(buffer.slice(0, cursor) + buffer.slice(cursor + 1), cursor);
							return;
						case 'left':
							set(buffer, Math.max(0, cursor - 1));
							return;
						case 'right':
							set(buffer, Math.min(buffer.length, cursor + 1));
							return;
						case 'home':
							set(buffer, 0);
							return;
						case 'end':
							set(buffer, buffer.length);
							return;
						case 'word-left':
							set(buffer, wordLeft(buffer, cursor));
							return;
						case 'word-right':
							set(buffer, wordRight(buffer, cursor));
							return;
						case 'ctrl+u':
							set(buffer.slice(cursor), 0);
							return;
						case 'ctrl+k':
							set(buffer.slice(0, cursor), cursor);
							return;
						case 'ctrl+w': {
							const j = wordLeft(buffer, cursor);
							set(buffer.slice(0, j) + buffer.slice(cursor), j);
							return;
						}
						case 'ctrl+l':
							paint();
							return;
						case 'tab':
							completeCommand();
							paint();
							return;
						case 'up':
							if (histIdx < history.length - 1) {
								if (histIdx === -1) draft = buffer;
								histIdx++;
								const entry = history[histIdx] ?? '';
								set(entry, entry.length);
							}
							return;
						case 'down':
							if (histIdx >= 0) {
								histIdx--;
								const entry = histIdx === -1 ? draft : (history[histIdx] ?? '');
								set(entry, entry.length);
							}
							return;
						case 'text':
						case 'paste': {
							const text = key.name === 'paste' ? sanitizePaste(key.text ?? '') : (key.text ?? '');
							if (text) set(buffer.slice(0, cursor) + text + buffer.slice(cursor), cursor + text.length);
							return;
						}
						default:
							return;
					}
					}, () => {
						leave();
						resolve('');
					});
			});
		},

			close(): void {
				stop?.();
				stop = null;
				S.editing = false;
				S.buffer = '';
				S.cursor = 0;
				S.offset = 0;
			},

		showPrompt(): void {
			paint();
		},
	};
}

// =============================================================================
// Picker (arrow keys + type-to-filter), rendered in the scrolling region
// =============================================================================

export interface PickItem {
	value: string;
	label: string;
	hint?: string;
}

/**
 * Let the user choose one item. Resolves with its value, or null when cancelled
 * (or when there is no interactive terminal). With `allowCustom`, a typed value
 * that matches nothing can be chosen as-is.
 */
export function pick(opts: {
	title: string;
	items: PickItem[];
	current?: string;
	allowCustom?: boolean;
}): Promise<string | null> {
	if (!process.stdin.isTTY || !out.isTTY) return Promise.resolve(null);

	const { rows, cols } = dims();
	const visible = Math.max(3, Math.min(10, rows - (S.active ? CHROME_ROWS : 0) - 5));
	const height = visible + 3; // title, search, items, footer
	const max = cols - 1;

	let filter = '';
	let top = 0;
	let sel = Math.max(0, opts.items.findIndex((it) => it.value === opts.current));

	const matches = (): PickItem[] => {
		const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
		const list = opts.items.filter((it) => {
			const hay = (it.label + ' ' + (it.hint ?? '')).toLowerCase();
			return words.every((w) => hay.includes(w));
		});
		// Custom IDs look like "org/name". The entry goes last, so Enter picks the
		// best filtered match and the custom ID is first only when nothing matches.
		const typed = filter.trim();
		if (opts.allowCustom && typed.includes('/') && !opts.items.some((it) => it.value === typed)) {
			list.push({ value: typed, label: typed, hint: 'use as typed' });
		}
		return list;
	};

	const frame = (): string[] => {
		const list = matches();
		sel = Math.min(sel, Math.max(0, list.length - 1));
		if (sel < top) top = sel;
		if (sel >= top + visible) top = sel - visible + 1;

		const lines: string[] = [
			c.bold(clipText(opts.title, max - 16)) + c.dim(`  ${list.length} of ${opts.items.length}`),
			c.dim('  search › ') + clipText(filter, max - 14) + c.dim('▏'),
		];
		for (let i = 0; i < visible; i++) {
			const it = list[top + i];
			if (!it) {
				lines.push(i === 0 && list.length === 0 ? c.dim('  no matches') : '');
				continue;
			}
			const isSel = top + i === sel;
			const isCur = it.value === opts.current;
			const label = clipText(it.label, max - 6);
			const room = max - 3 - label.length - (isCur ? 2 : 0) - 2;
			const hint = it.hint && room > 8 ? '  ' + clipText(it.hint, room) : '';
			lines.push(
				(isSel ? c.magenta(' › ') : '   ') +
					(isSel ? c.magenta.bold(label) : label) +
					(isCur ? c.green(' ✓') : '') +
					c.dim(hint),
			);
		}
		lines.push(c.dim(clipText('  ↑↓ move · enter select · esc cancel · type to filter', max)));
		return lines;
	};

	const draw = (first: boolean): void => {
		const body = frame()
			.map((l) => `${CSI}2K${l}\n`)
			.join('');
		out.write((first ? '' : `${CSI}${height}A\r`) + body);
	};

	return new Promise<string | null>((resolve) => {
		let done = false;
		let stop: () => void = () => undefined;

		const end = (value: string | null): void => {
			done = true;
			stop();
			// Remove the picker lines from the scrolling region.
			out.write(`${CSI}${height}A\r${CSI}${height}M${CSI}?25h`);
			resolve(value);
		};

		out.write(CSI + '?25l');
		draw(true);

		stop = listenKeys((key) => {
			if (done) return;
			const list = matches();
			const resetFilter = (): void => {
				sel = 0;
				top = 0;
			};

			switch (key.name) {
				case 'up':
					sel = Math.max(0, sel - 1);
					break;
				case 'down':
					sel = Math.min(Math.max(0, list.length - 1), sel + 1);
					break;
				case 'pageup':
					sel = Math.max(0, sel - visible);
					break;
				case 'pagedown':
					sel = Math.min(Math.max(0, list.length - 1), sel + visible);
					break;
				case 'home':
					sel = 0;
					break;
				case 'end':
					sel = Math.max(0, list.length - 1);
					break;
				case 'backspace':
					filter = filter.slice(0, -1);
					resetFilter();
					break;
				case 'ctrl+u':
					filter = '';
					resetFilter();
					break;
				case 'text':
				case 'paste':
					filter += sanitizePaste(key.text ?? '');
					resetFilter();
					break;
				case 'enter':
					end(list[sel]?.value ?? null);
					return;
				case 'escape':
				case 'ctrl+c':
					end(null);
					return;
				default:
					return;
			}
			draw(false);
		}, () => end(null));
	});
}
