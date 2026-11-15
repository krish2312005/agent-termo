// =============================================================================
// Screen layout + raw keyboard input
//
// Claude Code-style layout: output scrolls in a region at the top of the
// terminal while a bordered input box and a status line stay pinned to the
// bottom. Implemented with a DECSTBM scroll region, so every console.log /
// process.stdout.write elsewhere in the app lands in the scrolling region.
//
// The input box supports multi-line editing (Shift+Enter / pasted text keeps
// its newlines) and grows upward, scrolling the output region with it. While
// typing a slash command or @mention, an opencode-style completion popup is
// rendered directly above the input box.
// =============================================================================

import Chalk from 'chalk';
import { createInterface } from 'node:readline';

const c: typeof Chalk = Chalk as unknown as typeof Chalk;
const out = process.stdout;

const CSI = '\x1b[';
const SAVE = '\x1b7'; // DECSC — save cursor
const RESTORE = '\x1b8'; // DECRC — restore cursor

const MIN_ROWS = 12;
const MIN_COLS = 40;
const PLACEHOLDER = 'Ask anything… or type / for commands';
/** Maximum input rows rendered inside the box (extra lines scroll). */
const MAX_INPUT_LINES = 8;
/** Maximum rows in the command completion popup. */
const MAX_POPUP_ROWS = 8;

export interface CommandInfo {
	name: string;
	description: string;
}

const S = {
	active: false,
	editing: false,
	/** False when the output position saved at the start of editing is stale (resize / scrolled region). */
	savedValid: true,
	rows: 0,
	model: '',
	thinking: 'auto',
	usage: '0 tokens',
	permissionMode: 'ask' as 'ask' | 'files' | 'auto',
	project: '',
	commands: [] as CommandInfo[],
	agentNames: [] as string[],
	contextFiles: [] as string[],
	nextInput: '',
	buffer: '',
	cursor: 0,
	/** First buffer line rendered in the input box (vertical scroll). */
	topLine: 0,
	/** Selected row in the completion popup. */
	popupSel: 0,
	/** Buffer value for which the popup was dismissed with Escape. */
	popupHiddenFor: '',
	/** Rows the last rendered popup occupied (cleared when it disappears). */
	lastPopupRows: 0,
	lastPopupTopRow: 0,
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
// Buffer geometry (multi-line aware)
// =============================================================================

function bufferLines(): string[] {
	return S.buffer.split('\n');
}

function cursorPos(): { line: number; col: number } {
	const before = S.buffer.slice(0, S.cursor);
	const line = before.split('\n').length - 1;
	const col = S.cursor - (before.lastIndexOf('\n') + 1);
	return { line, col };
}

function lineStartIndex(line: number): number {
	const lines = bufferLines();
	let index = 0;
	for (let i = 0; i < line && i < lines.length; i++) index += (lines[i] ?? '').length + 1;
	return index;
}

function maxVisibleLines(): number {
	return Math.max(1, Math.min(MAX_INPUT_LINES, dims().rows - 12));
}

function visibleLines(): number {
	return Math.min(bufferLines().length, maxVisibleLines());
}

/** Rows pinned to the bottom: borders + input lines + status line. */
function chromeRows(): number {
	return visibleLines() + 3;
}

/** Horizontal window for one input line so the cursor stays visible. */
function lineOffset(col: number, width: number): number {
	if (col < width) return 0;
	return col - width + 1;
}

// =============================================================================
// Scroll region management
//
// The chrome height changes with the number of input lines, so the DECSTBM
// scroll region is adjusted dynamically: when the chrome grows, the region
// content is scrolled up so the latest output stays visible; when it shrinks,
// the rows the box art occupied are cleared.
// =============================================================================

let regionBottomRow = 0;

function syncRegion(): void {
	if (!S.active) return;
	const want = Math.max(1, dims().rows - chromeRows());
	if (regionBottomRow === want) return;
	if (regionBottomRow > want) {
		const delta = regionBottomRow - want;
		if (delta > 0) {
			// Chrome grew — push the scrolling region content up so the most
			// recent output remains visible above the taller input box.
			out.write(`${CSI}${delta}S`);
			S.savedValid = false;
		}
	} else if (regionBottomRow > 0) {
		// Chrome shrank — clear the rows the box art used to occupy.
		let clear = '';
		for (let r = regionBottomRow + 1; r <= want; r++) clear += `${CSI}${r};1H${CSI}2K`;
		out.write(clear);
	}
	regionBottomRow = want;
	out.write(`${CSI}1;${want}r`);
}

function regionBottom(): number {
	return Math.max(1, dims().rows - chromeRows());
}

// =============================================================================
// Completion popup (opencode style, rendered above the input box)
// =============================================================================

interface PopupState {
	kind: 'command' | 'mention';
	items: Array<{ label: string; description: string }>;
}

function activePopup(): PopupState | null {
	if (!S.editing) return null;
	if (S.buffer === S.popupHiddenFor) return null;
	const buffer = S.buffer;
	if (buffer.startsWith('/') && !buffer.includes(' ') && !buffer.includes('\n') && buffer.length > 0) {
		const typed = buffer.toLowerCase();
		const hits = S.commands.filter((cmd) => cmd.name.toLowerCase().startsWith(typed));
		if (hits.length === 0) return null;
		return { kind: 'command', items: hits.map((h) => ({ label: h.name, description: h.description })) };
	}
	if (/^@[^\s]*$/.test(buffer) && buffer.length > 1) {
		const typed = buffer.slice(1).toLowerCase();
		const agents = S.agentNames
			.filter((name) => name.toLowerCase().startsWith(typed))
			.map((name) => ({ label: '@' + name, description: 'agent' }));
		const files = S.contextFiles
			.filter((file) => file.toLowerCase().startsWith(typed))
			.map((file) => ({ label: '@' + file, description: 'file' }));
		const hits = [...agents, ...files].slice(0, MAX_POPUP_ROWS);
		if (hits.length === 0) return null;
		return { kind: 'mention', items: hits };
	}
	return null;
}

function popupString(topBorderRow: number): string {
	const popup = activePopup();
	if (!popup) return '';
	const { cols } = dims();
	const width = Math.min(cols - 4, 62);
	if (width < 30) return '';
	const inner = width - 2;
	const nameWidth = 14;
	const descWidth = inner - nameWidth - 2;

	const items = popup.items;
	const count = Math.min(items.length, MAX_POPUP_ROWS);
	const height = count + 2;
	const top = topBorderRow - height;
	if (top < 1) return '';

	// Window the list around the selection.
	let first = 0;
	if (S.popupSel >= count) first = S.popupSel - count + 1;
	first = Math.max(0, Math.min(first, items.length - count));

	S.lastPopupRows = height;
	S.lastPopupTopRow = top;

	const at = (row: number, text: string): string => `${CSI}${row};1H${CSI}2K  ${text}`;
	const border = (open: string, close: string): string => open + '─'.repeat(inner) + close;

	const parts: string[] = [at(top, c.dim(border('╭', '╮')))];
	for (let i = 0; i < count; i++) {
		const item = items[first + i];
		if (!item) break;
		const selected = first + i === S.popupSel;
		const name = clipText(item.label, nameWidth).padEnd(nameWidth);
		const desc = clipText(item.description, descWidth);
		const rowInner = (' ' + name + ' ' + desc).padEnd(inner).slice(0, inner);
		parts.push(
			selected
				? at(top + 1 + i, c.bgRgb(245, 169, 127).black('│' + rowInner + '│'))
				: at(top + 1 + i, c.dim('│') + ' ' + c.white(name) + ' ' + c.dim(desc) + c.dim('│')),
		);
	}
	parts.push(at(top + height - 1, c.dim(border('╰', '╯'))));
	return parts.join('');
}

/** Erase the rows the popup used to occupy once it is no longer shown. */
function popupClearString(): string {
	if (S.lastPopupRows <= 0) return '';
	if (activePopup()) return '';
	let clear = '';
	for (let r = S.lastPopupTopRow; r < S.lastPopupTopRow + S.lastPopupRows; r++) {
		if (r >= 1) clear += `${CSI}${r};1H${CSI}2K`;
	}
	S.lastPopupRows = 0;
	S.lastPopupTopRow = 0;
	return clear;
}

// =============================================================================
// Bottom chrome (input box + status line)
// =============================================================================

function statusLine(max: number): string {
	const hint =
		S.permissionMode === 'auto'
			? 'AUTO-ACCEPT · /permissions ask to disable'
			: S.permissionMode === 'files'
				? 'FILES-AUTO · terminal commands still ask'
				: 'shift+enter newline · /help · ctrl+c interrupt';

	// The model name is the most important part of the status line: it is
	// always shown in full (never truncated) and lower-priority segments are
	// dropped instead when the terminal is narrow.
	const modelPart = S.model ? ' ' + S.model : '';
	const modelShown = modelPart.length <= max ? modelPart : clipText(modelPart, max);

	const segments: Array<{ text: string; paint: (s: string) => string }> = [
		{ text: ' · think:' + S.thinking, paint: (s) => c.yellow(s) },
		{ text: ' · ' + S.usage, paint: (s) => c.blue(s) },
		{ text: ' · ' + shortPath(S.project), paint: (s) => c.dim(s) },
		{ text: '  ' + hint, paint: (s) => c.dim(s) },
	];

	let used = modelShown.length;
	let result = c.cyan(modelShown);
	if (S.permissionMode === 'auto') result += c.red.bold(' AUTO');
	else if (S.permissionMode === 'files') result += c.yellow.bold(' FILES');
	for (const segment of segments) {
		if (used + segment.text.length <= max) {
			result += segment.paint(segment.text);
			used += segment.text.length;
		}
	}
	return result;
}

function chromeString(): string {
	const { rows, cols } = dims();
	const width = Math.max(1, cols - 6); // '│ ❯ ' + text + ' │'
	const lines = bufferLines();
	const vis = visibleLines();
	const pos = cursorPos();

	// Keep the cursor line inside the visible window.
	if (pos.line < S.topLine) S.topLine = pos.line;
	if (pos.line >= S.topLine + vis) S.topLine = pos.line - vis + 1;
	S.topLine = Math.max(0, Math.min(S.topLine, Math.max(0, lines.length - vis)));

	const edge =
		S.permissionMode === 'auto' ? c.red : S.permissionMode === 'files' ? c.yellow : S.editing ? c.magenta : c.dim;
	const prompt =
		S.permissionMode === 'auto' ? c.red.bold('❯') : S.permissionMode === 'files' ? c.yellow.bold('❯') : c.magenta.bold('❯');

	const bottomBorderRow = rows - 1;
	const topBorderRow = bottomBorderRow - vis; // one border row + vis input rows above it
	const line = (row: number, text: string): string => `${CSI}${row};1H${CSI}2K${text}`;

	const parts: string[] = [];
	// Completion popup floats above the input box.
	parts.push(popupString(topBorderRow));
	parts.push(line(topBorderRow, edge('╭' + '─'.repeat(cols - 2) + '╮')));

	for (let i = 0; i < vis; i++) {
		const idx = S.topLine + i;
		const text = lines[idx] ?? '';
		const isCursorLine = idx === pos.line;
		const offset = isCursorLine ? lineOffset(pos.col, width) : 0;
		let body: string;
		if (isCursorLine) {
			body = text.slice(offset, offset + width).padEnd(width);
		} else if (text) {
			body = clipText(text, width).padEnd(width);
		} else if (lines.length === 1 && !S.buffer && idx === 0) {
			body = c.dim(clipText(PLACEHOLDER, width).padEnd(width));
		} else {
			body = ' '.repeat(width);
		}
		const prefix = idx === 0 ? edge('│') + ' ' + prompt + ' ' : edge('│') + '   ';
		parts.push(line(bottomBorderRow - vis + i, prefix + body + ' ' + edge('│')));
	}

	parts.push(line(bottomBorderRow, edge('╰' + '─'.repeat(cols - 2) + '╯')));
	parts.push(line(rows, statusLine(cols - 1)));
	return parts.join('');
}

function inputCursor(): string {
	const { rows, cols } = dims();
	const pos = cursorPos();
	const width = Math.max(1, cols - 6);
	const offset = lineOffset(pos.col, width);
	const row = rows - 2 - (pos.line - S.topLine);
	return `${CSI}${Math.max(1, row)};${5 + pos.col - offset}H`;
}

function paint(): void {
	if (!S.active) return;
	syncRegion();
	if (S.editing) {
		// The saved slot holds the output position while editing: don't touch it.
		out.write(CSI + '?25l' + popupClearString() + chromeString() + inputCursor() + CSI + '?25h');
	} else {
		out.write(SAVE + popupClearString() + chromeString() + RESTORE);
	}
}

function onResize(): void {
	const { rows } = dims();
	S.lastPopupRows = 0;
	S.lastPopupTopRow = 0;
	if (rows === S.rows && regionBottomRow === Math.max(1, rows - chromeRows())) {
		paint();
		return;
	}
	// Height changed: old chrome rows are stale, so start from a clean screen.
	S.rows = rows;
	S.savedValid = false;
	out.write(`${CSI}2J${CSI}H`);
	regionBottomRow = 0;
	syncRegion();
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
	S.buffer = '';
	S.cursor = 0;
	S.topLine = 0;
	out.write(`${CSI}2J${CSI}H`);
	regionBottomRow = 0;
	syncRegion();
	out.write(chromeString() + `${CSI}1;1H`);
	out.on('resize', onResize);
	process.on('exit', teardownScreen);
}

export function setScreenStatus(info: { model?: string; project?: string; thinking?: string; usage?: string }): void {
	if (info.model !== undefined) S.model = info.model;
	if (info.project !== undefined) S.project = info.project;
	if (info.thinking !== undefined) S.thinking = info.thinking;
	if (info.usage !== undefined) S.usage = info.usage;
	paint();
}

export function setPermissionMode(permissionMode: 'ask' | 'files' | 'auto'): void {
	S.permissionMode = permissionMode;
	paint();
}

/** Clear everything and start output again from the top (used by /clear). */
export function resetScreen(): void {
	out.write(`${CSI}2J${CSI}H`);
	S.lastPopupRows = 0;
	S.lastPopupTopRow = 0;
	if (!S.active) return;
	regionBottomRow = 0;
	syncRegion();
	out.write(chromeString() + `${CSI}1;1H`);
}

export function teardownScreen(): void {
	if (!S.active) return;
	S.active = false;

	const { rows } = dims();
	const first = Math.max(1, rows - chromeRows() + 1);
	let wipe = '';
	for (let r = first; r <= rows; r++) wipe += `${CSI}${r};1H${CSI}2K`;

	// Leave the shell prompt right after the last output line.
	const head = S.editing ? '' : SAVE;
	const back = S.editing && !S.savedValid ? `${CSI}${first};1H` : RESTORE;
	out.write(head + CSI + 'r' + wipe + back + CSI + '?25h' + CSI + '?2004l');
	regionBottomRow = 0;
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
	// A bare LF is Shift+Enter on terminals that send a distinct newline
	// (most terminal emulators send CR for Enter). Inserting a line instead
	// of submitting matches the Shift+Enter behavior users expect.
	'\n': 'shift+enter',
	// Kitty-keyboard-protocol encodings of Shift+Enter / Ctrl+Enter.
	'\x1b[13;2u': 'shift+enter',
	'\x1b[13;5u': 'shift+enter',
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

/**
 * Pasted text keeps its original line structure (newlines preserved) so
 * multi-line content is displayed exactly as it was copied. Tabs become two
 * spaces and other control characters are dropped.
 */
function sanitizePaste(text: string): string {
	return [...text.replace(/\r\n?/g, '\n').replace(/\t/g, '  ')]
		.filter((ch) => ch === '\n' || ((ch.codePointAt(0) ?? 0) >= 0x20 && ch !== '\x7f'))
		.join('');
}

function completeCommand(): void {
	if (S.buffer.startsWith('@') && !S.buffer.includes(' ') && !S.buffer.includes('\n')) {
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
	if (!S.buffer.startsWith('/') || S.buffer.includes(' ') || S.buffer.includes('\n')) return;
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
				S.topLine = 0;
				S.popupSel = 0;
				S.popupHiddenFor = '';
				S.lastPopupRows = 0;
				S.lastPopupTopRow = 0;
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
					S.topLine = 0;
					S.popupHiddenFor = '';
					out.write(S.savedValid ? RESTORE : `${CSI}${regionBottom()};1H`);
					paint();
				};

				const quit = (): void => {
					leave();
					process.emit('SIGINT'); // lets the REPL print its session summary
					process.exit(0);
				};

				const set = (text: string, cursor: number): void => {
					if (text !== S.buffer) {
						S.popupSel = 0;
						if (text !== S.popupHiddenFor) S.popupHiddenFor = '';
					}
					S.buffer = text;
					S.cursor = cursor;
					paint();
				};

				stop = listenKeys((key) => {
					if (done) return;
					const { buffer, cursor } = S;
					const popup = activePopup();

					switch (key.name) {
						case 'enter': {
							if (popup) {
								if (popup.kind === 'command') {
									// Enter runs the highlighted slash command.
									const item = popup.items[S.popupSel] ?? popup.items[0];
									if (item) {
										S.buffer = item.label;
										S.cursor = S.buffer.length;
									}
								} else {
									// Enter on an @mention completes it instead of submitting.
									const item = popup.items[S.popupSel] ?? popup.items[0];
									if (item) {
										S.buffer = item.label + ' ';
										S.cursor = S.buffer.length;
										S.popupHiddenFor = '';
										paint();
										return;
									}
								}
							}
							const value = S.buffer;
							const line = value.trim();
							if (line && history[0] !== line) history.unshift(line);
							if (history.length > 100) history.pop();
							leave();
							resolve(line);
							return;
						}
						case 'shift+enter':
							set(buffer.slice(0, cursor) + '\n' + buffer.slice(cursor), cursor + 1);
							return;
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
						case 'home': {
							const pos = cursorPos();
							set(buffer, lineStartIndex(pos.line));
							return;
						}
						case 'end': {
							const pos = cursorPos();
							const lines = bufferLines();
							set(buffer, lineStartIndex(pos.line) + (lines[pos.line] ?? '').length);
							return;
						}
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
						case 'tab': {
							if (popup) {
								const item = popup.items[S.popupSel] ?? popup.items[0];
								if (item) {
									const completed = popup.kind === 'command' ? item.label : item.label + ' ';
									set(completed, completed.length);
								}
								return;
							}
							completeCommand();
							paint();
							return;
						}
						case 'escape': {
							if (popup) {
								S.popupHiddenFor = S.buffer;
								paint();
								return;
							}
							return;
						}
						case 'up': {
							if (popup) {
								S.popupSel = Math.max(0, S.popupSel - 1);
								paint();
								return;
							}
							const lines = bufferLines();
							const pos = cursorPos();
							if (pos.line > 0) {
								// Move up within the multi-line buffer.
								const prevLen = (lines[pos.line - 1] ?? '').length;
								const col = Math.min(pos.col, prevLen);
								set(buffer, lineStartIndex(pos.line - 1) + col);
								return;
							}
							if (histIdx < history.length - 1) {
								if (histIdx === -1) draft = buffer;
								histIdx++;
								const entry = history[histIdx] ?? '';
								set(entry, entry.length);
							}
							return;
						}
						case 'down': {
							if (popup) {
								const items = popup.items;
								S.popupSel = Math.min(items.length - 1, S.popupSel + 1);
								paint();
								return;
							}
							const lines = bufferLines();
							const pos = cursorPos();
							if (pos.line < lines.length - 1) {
								// Move down within the multi-line buffer.
								const nextLen = (lines[pos.line + 1] ?? '').length;
								const col = Math.min(pos.col, nextLen);
								set(buffer, lineStartIndex(pos.line + 1) + col);
								return;
							}
							if (histIdx >= 0) {
								histIdx--;
								const entry = histIdx === -1 ? draft : (history[histIdx] ?? '');
								set(entry, entry.length);
							}
							return;
						}
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
			S.topLine = 0;
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
	const visible = Math.max(3, Math.min(10, rows - (S.active ? chromeRows() : 0) - 5));
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
