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
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { listRunSubAgents, subscribeSubAgents } from '../runtime/subagents.js';
import {
	buildInspector,
	INITIAL_MONITOR,
	panelBodyRows,
	reduceMonitorKey,
	renderPanel,
	renderStrip,
	type MonitorState,
} from './subagent-view.js';

const c: typeof Chalk = Chalk as unknown as typeof Chalk;
// The published 6.0.0 package has an invalid ESM module field and no exports map.
// Load its valid CommonJS main entry explicitly; retain the package's official API types.
const { Terminal } = createRequire(import.meta.url)('@xterm/headless') as typeof import('@xterm/headless');
type TerminalEmulator = InstanceType<typeof Terminal>;
const out = process.stdout;

const CSI = '\x1b[';
const SAVE = '\x1b7'; // DECSC — save cursor
const RESTORE = '\x1b8'; // DECRC — restore cursor

const MIN_ROWS = 12;
const MIN_COLS = 40;
const PLACEHOLDER = 'Ask anything… or type / for commands';
/** Maximum input rows rendered inside the box (extra lines scroll). */
const MAX_INPUT_LINES = 16;
/** Maximum rows in the command completion popup. */
const MAX_POPUP_ROWS = 8;
/** Minimum rows shown when the terminal panel is open. */
const TERM_PANEL_LINES = 6;
/** Keep the terminal workspace large while leaving room for the chat transcript and composer. */
const TERM_PANEL_HEIGHT_RATIO = 0.62;
/** Retain enough scrollback to cover long command output. */
const TERM_PANEL_SCROLLBACK = 2000;
/** Key(s) that toggle (close/open) the terminal panel. */
const TERM_TOGGLE_KEYS = new Set(['ctrl+o', 'ctrl+t']);
/** Inspector panel height limits (rows) and the output rows that must stay visible. */
const MON_PANEL_MAX = 16;
const MON_PANEL_MIN = 7;
const MIN_OUTPUT_ROWS = 5;

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
	/** Live terminal panel: the running (or last) bash command + its output. */
	term: null as null | {
		command: string;
		/** Sanitised output lines (ANSI stripped, \r progress lines folded). */
		lines: string[];
		/** Partial line still waiting for a newline. */
		pending: string;
		/** Current line being composed for the running command's stdin. */
		input: string;
		/** Number of rows scrolled back from the latest terminal output. */
		scrollOffset: number;
		/** True after Escape sends an interrupt to the active command. */
		interrupting: boolean;
		/** null = still running; number = exit code. */
		exitCode: null | number;
	},
	/** Whether the terminal panel is shown below the input box. */
	termOpen: false,
};

export function setCommands(commands: CommandInfo[]): void {
	S.commands = commands;
}

let terminalInputHandler: ((input: string) => boolean) | null = null;

/** Connect terminal keyboard input to the active PTY session. */
export function setTerminalInputHandler(handler: ((input: string) => boolean) | null): void {
	terminalInputHandler = handler;
}

let terminalInterruptHandler: (() => boolean) | null = null;

/** Connect Escape to the active terminal command's interrupt signal. */
export function setTerminalInterruptHandler(handler: (() => boolean) | null): void {
	terminalInterruptHandler = handler;
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

/** Active workspace root used by tool-call displays when cwd is omitted. */
export function currentProjectRoot(): string {
	return S.project || process.cwd();
}

export function clipText(text: string, max: number): string {
	if (max <= 0) return '';
	return text.length <= max ? text : text.slice(0, Math.max(0, max - 1)) + '…';
}

function shortPath(p: string): string {
	const home = process.env.HOME || process.env.USERPROFILE || '';
	return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

// =============================================================================
// Terminal panel (live bash output, Claude Code style)
//
// While the agent runs terminal commands the output is streamed into a panel
// pinned below the input box. Ctrl+O (or Ctrl+T) toggles it, so a running
// terminal can be closed and reopened at any time.
// =============================================================================

let termPaintTimer: ReturnType<typeof setTimeout> | null = null;
let terminalEmulator: TerminalEmulator | null = null;

function termOutputRows(): number {
	if (!S.term) return TERM_PANEL_LINES;
	const footerRows = S.term.exitCode === null ? 4 : 2;
	const monitorRows = monitorVisible() ? 1 : 0;
	const reservedRows = visibleLines() + 3 + MIN_OUTPUT_ROWS + monitorRows + footerRows;
	const availableRows = Math.max(1, dims().rows - reservedRows);
	const preferredRows = Math.max(TERM_PANEL_LINES, Math.floor(dims().rows * TERM_PANEL_HEIGHT_RATIO) - footerRows);
	return Math.min(availableRows, preferredRows);
}

function termPanelRows(): number {
	if (!S.term || !S.termOpen) return 0;
	return termOutputRows() + (S.term.exitCode === null ? 4 : 2); // header + output + input label + input + bottom
}

/** Copy the visible terminal screen after xterm has processed its ANSI control sequences. */
function snapshotTerminalScreen(): void {
	if (!S.term || !terminalEmulator) return;
	const buffer = terminalEmulator.buffer.active;
	const previousLineCount = S.term.lines.length;
	const wasScrolledBack = S.term.scrollOffset > 0;
	const lines = Array.from({ length: buffer.length }, (_, row) =>
		buffer.getLine(row)?.translateToString(true) ?? '',
	).filter((line) => line.trim().length > 0);
	if (wasScrolledBack && lines.length > previousLineCount) {
		S.term.scrollOffset += lines.length - previousLineCount;
	}
	S.term.lines = lines;
	S.term.scrollOffset = Math.min(S.term.scrollOffset, Math.max(0, lines.length - termOutputRows()));
	S.term.pending = '';
}

function termPaint(): void {
	if (!S.active) return;
	if (termPaintTimer) return;
	termPaintTimer = setTimeout(() => {
		termPaintTimer = null;
		paint();
	}, 60);
}

/** A terminal command started: track it but keep panel closed by default. */
export function startTerminalPanel(command: string): void {
	clearTerminalPanel();
	S.term = { command, lines: [], pending: '', input: '', scrollOffset: 0, interrupting: false, exitCode: null };
	terminalEmulator = new Terminal({
		cols: Math.max(1, out.columns || 80),
		rows: Math.max(1, out.rows || 24),
		scrollback: TERM_PANEL_SCROLLBACK,
		allowProposedApi: true,
		logLevel: 'off',
	});
	S.termOpen = true;
	syncTermKeyListener();
	termPaint();
}

/** Feed PTY output through a terminal emulator so cursor-based prompts remain visible. */
export function appendTerminalOutput(text: string): void {
	if (!S.term || !terminalEmulator) return;
	S.termOpen = true;
	terminalEmulator.write(text, () => {
		snapshotTerminalScreen();
		termPaint();
	});
}

/** The terminal command finished; flush queued output before disposing its emulator. */
export function finishTerminalPanel(exitCode: number | null): void {
	if (!S.term) return;
	const finish = (): void => {
		snapshotTerminalScreen();
		if (S.term) {
			S.term.exitCode = exitCode ?? -1;
			S.term.input = '';
			S.term.pending = '';
		}
		terminalEmulator?.dispose();
		terminalEmulator = null;
		syncTermKeyListener();
		termPaint();
	};
	if (terminalEmulator) terminalEmulator.write('', finish);
	else finish();
}

/** Toggle the terminal panel open/closed (Ctrl+O / Ctrl+T). */
export function toggleTerminalPanel(): void {
	if (!S.term) return;
	S.termOpen = !S.termOpen;
	syncTermKeyListener();
	paint();
}

/** Close the terminal panel but keep the last term so it can be reopened with Ctrl+O. */
export function clearTerminalPanel(): void {
	S.termOpen = false;
	terminalEmulator?.dispose();
	terminalEmulator = null;
	if (S.term) {
		S.term.lines = [];
		S.term.pending = '';
		S.term.input = '';
		S.term.scrollOffset = 0;
		S.term.exitCode = null;
	}
	syncTermKeyListener();
	paint();
}

export function terminalPanelVisible(): boolean {
	return Boolean(S.term && S.termOpen);
}

export function terminalPanelState(): { command: string; exitCode: number | null; lines: string[]; input: string; scrollOffset: number; viewportRows: number } | null {
	if (!S.term) return null;
	return {
		command: S.term.command,
		exitCode: S.term.exitCode,
		lines: [...S.term.lines],
		input: S.term.input,
		scrollOffset: S.term.scrollOffset,
		viewportRows: S.termOpen ? termOutputRows() : 0,
	};
}

/** Select an older or newer page of terminal output without sending keys to the child process. */
export function scrollTerminalPanel(direction: 'up' | 'down'): void {
	if (!S.term || !S.termOpen) return;
	const pageRows = termOutputRows();
	const maxOffset = Math.max(0, S.term.lines.length - pageRows);
	const nextOffset = direction === 'up'
		? Math.min(maxOffset, S.term.scrollOffset + pageRows)
		: Math.max(0, S.term.scrollOffset - pageRows);
	if (nextOffset === S.term.scrollOffset) return;
	S.term.scrollOffset = nextOffset;
	paint();
}

/** The rows currently shown in the fixed-height terminal panel viewport. */
export function terminalPanelWindow(lines: string[], scrollOffset: number, visibleRows = TERM_PANEL_LINES): string[] {
	const maxOffset = Math.max(0, lines.length - visibleRows);
	const offset = Math.max(0, Math.min(maxOffset, Math.trunc(scrollOffset)));
	const end = lines.length - offset;
	return lines.slice(Math.max(0, end - visibleRows), end);
}

// A background key listener while the user is NOT editing (during the agent
// tool loop), so Ctrl+O can close the running terminal at any time.
let termKeyStop: (() => void) | null = null;
let backgroundCommandStop: (() => void) | null = null;

function syncTermKeyListener(): void {
	const want = Boolean(S.term) && !S.editing && S.active;
	if (want && !termKeyStop) {
		termKeyStop = listenKeys((key) => {
			if (TERM_TOGGLE_KEYS.has(key.name)) toggleTerminalPanel();
		}, undefined, { background: true });
	} else if (!want && termKeyStop) {
		termKeyStop();
		termKeyStop = null;
	}
}

export function layoutSupported(): boolean {
	return Boolean(
		out.isTTY && process.stdin.isTTY && (out.rows ?? 0) >= MIN_ROWS && (out.columns ?? 0) >= MIN_COLS,
	);
}

/** Text typed while the agent runs; Enter sends it to the active PTY. */
let bgTyped = '';

function updateTerminalInputDraft(): void {
	if (!S.term || S.term.exitCode !== null) return;
	S.term.input = bgTyped;
	S.termOpen = true;
	termPaint();
}

/** Escape sequences sent to the child PTY for keys that control terminal UIs. */
const TERMINAL_KEY_SEQUENCES: Readonly<Record<string, string>> = {
	up: '\x1b[A',
	down: '\x1b[B',
	right: '\x1b[C',
	left: '\x1b[D',
	home: '\x1b[H',
	end: '\x1b[F',
	delete: '\x1b[3~',
	pageup: '\x1b[5~',
	pagedown: '\x1b[6~',
	tab: '\t',
	'shift+tab': '\x1b[Z',
	backspace: '\x7f',
	'ctrl+u': '\x15',
	'ctrl+w': '\x17',
	'ctrl+k': '\x0b',
};

/** Convert a parsed key into the byte sequence expected by a PTY application. */
export function terminalInputForKey(name: string): string | null {
	return TERMINAL_KEY_SEQUENCES[name] ?? null;
}

/** Full-screen terminal apps receive keystrokes immediately instead of line-buffered input. */
function terminalUsesAlternateScreen(): boolean {
	return terminalEmulator?.buffer.active.type === 'alternate';
}

/**
 * While a tool runs, reuse the raw-key listener for interactive input. Enter
 * sends one line to the active PTY; /subagents remains a UI command.
 */
export function startBackgroundCommandListener(onCommand: (command: string) => void): () => void {
	if (!process.stdin.isTTY || backgroundCommandStop) return () => undefined;
	bgTyped = '';
	const stopKeys = listenKeys(
		(key) => {
			const directInput = S.term?.exitCode === null && terminalUsesAlternateScreen();
			if (key.name === 'text' || key.name === 'paste') {
				const text = key.text ?? '';
				if (directInput && terminalInputHandler?.(text)) return;
				bgTyped += text;
				updateTerminalInputDraft();
			} else if (key.name === 'backspace') {
				if (directInput && terminalInputHandler?.('\x7f')) return;
				if (bgTyped.length > 0) {
					bgTyped = bgTyped.slice(0, -1);
					updateTerminalInputDraft();
				} else if (S.term?.exitCode === null) {
					terminalInputHandler?.('\x7f');
				}
			} else if (key.name === 'ctrl+u') {
				if (directInput && terminalInputHandler?.('\x15')) return;
				if (bgTyped.length > 0) {
					bgTyped = '';
					updateTerminalInputDraft();
				} else if (S.term?.exitCode === null) {
					terminalInputHandler?.('\x15');
				}
			} else if (key.name === 'enter') {
				const command = bgTyped.trim();
				if (/^\/subagents(?:\s|$)/i.test(command)) {
					bgTyped = '';
					if (S.term) S.term.input = '';
					onCommand(command);
					termPaint();
				} else if (S.term && S.term.exitCode === null && terminalInputHandler) {
					if (terminalInputHandler(bgTyped + '\r')) {
						bgTyped = '';
						S.term.input = '';
						termPaint();
					}
				} else {
					bgTyped = '';
					if (S.term) S.term.input = '';
				}
			} else if (key.name === 'shift+pageup') {
				scrollTerminalPanel('up');
			} else if (key.name === 'shift+pagedown') {
				scrollTerminalPanel('down');
			} else if (key.name === 'escape' || key.name === 'ctrl+c') {
				bgTyped = '';
				if (S.term) {
					S.term.input = '';
					if (S.term.exitCode === null && terminalInterruptHandler?.()) {
						S.term.interrupting = true;
					}
				}
				termPaint();
			} else {
				const sequence = terminalInputForKey(key.name);
				if (sequence && S.term?.exitCode === null && terminalInputHandler) {
					// Flush locally buffered text before a control key so PTY input order is preserved.
					if (terminalInputHandler(bgTyped + sequence)) {
						bgTyped = '';
						S.term.input = '';
						termPaint();
					}
				}
			}
		},
		undefined,
		{ background: true },
	);
	backgroundCommandStop = () => {
		stopKeys();
		backgroundCommandStop = null;
		bgTyped = '';
		if (S.term) S.term.input = '';
		monitorRefresh();
	};
	monitorRefresh();
	return backgroundCommandStop;
}

// =============================================================================
// Sub-agent monitor
//
// While a run is in flight and sub-agents exist, a one-line indicator sits
// below the input box (● 3 subagents running | ↑↓ Navigate | Enter Inspect).
// ↑/↓ pick a sub-agent, Enter opens a live inspector panel under it, Esc closes
// that panel. It is read-only: it only reads the sub-agent registry and the
// keys it uses are consumed here, so nothing it does reaches — let alone
// cancels — a running agent. Esc with the panel closed still cancels, as before.
// =============================================================================

let monitor: MonitorState = { ...INITIAL_MONITOR };
let monPaintTimer: ReturnType<typeof setTimeout> | null = null;
let monTicker: ReturnType<typeof setInterval> | null = null;

/** The monitor shows this run's sub-agents, and only while a run is in flight. */
function monitorVisible(): boolean {
	return S.active && !S.editing && backgroundCommandStop !== null && listRunSubAgents().length > 0;
}

/** Rows an open inspector could take without squeezing the output area. */
function monitorRoom(): number {
	return dims().rows - (visibleLines() + 3 + termPanelRows() + 1) - MIN_OUTPUT_ROWS;
}

function monitorPanelRows(): number {
	if (!monitor.open || !monitorVisible()) return 0;
	const room = monitorRoom();
	return room >= MON_PANEL_MIN ? Math.min(MON_PANEL_MAX, room) : 0;
}

/** Indicator row (+ inspector rows) pinned below the input box. */
function monitorRows(): number {
	return monitorVisible() ? 1 + monitorPanelRows() : 0;
}

function monitorString(firstRow: number, count: number): string {
	const { cols } = dims();
	const list = listRunSubAgents();
	const selected = Math.min(Math.max(0, monitor.selected), list.length - 1);
	const panelRows = count - 1;
	const at = (row: number, text: string): string => `${CSI}${row};1H${CSI}2K${text}`;
	let result = at(
		firstRow,
		' ' + renderStrip(list, { width: cols - 2, open: panelRows > 0, canInspect: monitorRoom() >= MON_PANEL_MIN, selected }),
	);
	const target = list[selected];
	if (panelRows > 0 && target) {
		const panel = renderPanel(target, { index: selected, count: list.length, width: cols, height: panelRows, scroll: monitor.scroll });
		panel.rows.forEach((row, i) => {
			result += at(firstRow + 1 + i, row);
		});
	}
	return result;
}

/** Offer a key to the monitor; true means it was used and must not reach anyone else. */
function monitorKeyIntercept(key: Key): boolean {
	// Navigation belongs to the foreground PTY while a terminal command is interactive.
	if (S.term && S.term.exitCode === null) return false;
	if (!monitorVisible()) return false;
	const list = listRunSubAgents();
	const panelRows = monitorPanelRows();
	const target = list[Math.min(Math.max(0, monitor.selected), list.length - 1)];
	const bodyRows = panelBodyRows(panelRows);
	const maxScroll = panelRows > 0 && target ? Math.max(0, buildInspector(target, dims().cols - 4).body.length - bodyRows) : 0;
	const result = reduceMonitorKey(monitor, key.name, {
		count: list.length,
		typing: bgTyped.length > 0,
		canInspect: monitorRoom() >= MON_PANEL_MIN,
		page: Math.max(1, bodyRows - 1),
		maxScroll,
	});
	if (!result.consumed) return false;
	monitor = result.state;
	paint();
	return true;
}

/** Sub-agent events and clock ticks repaint at most every 60 ms. */
function monitorRefresh(): void {
	if (!S.active) return;
	const wantTicker = monitorVisible() && listRunSubAgents().some((a) => a.status === 'running' || a.status === 'waiting');
	if (wantTicker && !monTicker) {
		// Durations are the only thing that changes without an event: tick once a second while something runs.
		monTicker = setInterval(() => {
			if (monitorVisible()) paint();
			else monitorRefresh();
		}, 1000);
		monTicker.unref?.();
	} else if (!wantTicker && monTicker) {
		clearInterval(monTicker);
		monTicker = null;
	}
	if (monPaintTimer) return;
	monPaintTimer = setTimeout(() => {
		monPaintTimer = null;
		paint();
	}, 60);
	monPaintTimer.unref?.();
}

subscribeSubAgents((event) => {
	if (event.type === 'run') monitor = { ...INITIAL_MONITOR };
	monitorRefresh();
});

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

/** Rows pinned to the bottom: borders + input lines + status line (+ panels). */
function chromeRows(): number {
	return visibleLines() + 3 + termPanelRows() + monitorRows();
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
	/** For mentions: buffer range the selected item replaces. */
	start?: number;
	end?: number;
}

/**
 * The mention token at the cursor: an @ anywhere in the line followed by a
 * partial name with no whitespace, so files/agents can be referenced in the
 * middle of a prompt (like Claude Code), not only at the start.
 */
function activeMention(): { start: number; typed: string } | null {
	const pos = cursorPos();
	const line = bufferLines()[pos.line] ?? '';
	const before = line.slice(0, pos.col);
	const match = /(^|\s)@([\w./@\\-]*)$/.exec(before);
	if (!match) return null;
	const at = before.lastIndexOf('@', pos.col - 1);
	if (at < 0) return null;
	return { start: lineStartIndex(pos.line) + at, typed: match[2] ?? '' };
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
	// @mentions: anywhere in any line, at the cursor.
	if (!buffer.startsWith('/')) {
		const mention = activeMention();
		if (mention) {
			const typed = mention.typed.toLowerCase();
			const agents = S.agentNames
				.filter((name) => name.toLowerCase().startsWith(typed))
				.map((name) => ({ label: '@' + name, description: 'agent' }));
			const files = S.contextFiles
				.filter((file) => file.toLowerCase().includes(typed))
				.map((file) => ({ label: '@' + file, description: 'file' }));
			const hits = [...agents, ...files].slice(0, MAX_POPUP_ROWS);
			if (hits.length === 0) return null;
			return { kind: 'mention', items: hits, start: mention.start, end: S.cursor };
		}
	}
	return null;
}

function popupString(topBorderRow: number): string {
	const popup = activePopup();
	if (!popup) return '';
	const { cols } = dims();
	const width = Math.min(cols - 4, 64);
	if (width < 30) return '';
	const inner = width - 2;
	// File paths need a wider column than command names.
	const nameWidth = popup.kind === 'mention' ? Math.min(30, inner - 10) : 16;
	const descWidth = inner - nameWidth - 3;

	const items = popup.items;
	// Fit the popup into the rows available above the input box; one blank
	// row of breathing space keeps it visually separate from the input border.
	const room = Math.max(0, topBorderRow - 2);
	const count = Math.min(items.length, MAX_POPUP_ROWS, room);
	if (count < 1) return '';
	const height = count + 2;
	const top = topBorderRow - height - 1; // one blank row below the popup

	// Window the list around the selection.
	let first = 0;
	if (S.popupSel >= count) first = S.popupSel - count + 1;
	first = Math.max(0, Math.min(first, items.length - count));

	const at = (row: number, text: string): string => `${CSI}${row};1H${CSI}2K  ${text}`;
	const border = (open: string, close: string): string => open + '─'.repeat(inner) + close;

	// The popup keeps the app's own theme (magenta border, cyan names) with a
	// magenta highlight on the selected row.
	const parts: string[] = [at(top, c.magenta(border('╭', '╮')))];
	for (let i = 0; i < count; i++) {
		const item = items[first + i];
		if (!item) break;
		const selected = first + i === S.popupSel;
		const name = clipText(item.label, nameWidth).padEnd(nameWidth);
		const desc = clipText(item.description, descWidth).padEnd(descWidth);
		const rowInner = (' ' + name + ' ' + desc).padEnd(inner).slice(0, inner);
		parts.push(
			selected
				? at(top + 1 + i, c.bgMagenta.white('│' + rowInner + '│'))
				: at(top + 1 + i, c.magenta('│') + ' ' + c.cyan(name) + ' ' + c.dim(desc) + ' ' + c.magenta('│')),
		);
	}

	parts.push(at(top + height - 1, c.magenta(border('╰', '╯'))));
	return parts.join('');
}

/**
 * Erase every row the popup may have touched since the last paint — including
 * rows a taller previous popup occupied — so no ghost fragments remain when it
 * shrinks, moves, or disappears. Rows the popup is about to redraw are skipped.
 */
/**
 * Erase every row the popup may have touched since the last paint — including
 * rows a taller previous popup occupied — so no ghost fragments remain when it
 * shrinks, moves, or disappears. The popup redraws its own rows right after.
 */
function popupClearString(): string {
	// The rows that may still hold popup art: the extent of the previous
	// popup plus the rows the popup is about to occupy. Without this, the
	// first popup was never tracked and its rows were left behind whenever
	// the list shrank (ghost panels).
	const popup = activePopup();
	const zoneTop = popup ? popupTopRow(popup) : -1;
	const prevTop = S.lastPopupTopRow;
	S.lastPopupTopRow = zoneTop > 0 ? zoneTop : 0;
	const from = Math.min(prevTop > 0 ? prevTop : Number.POSITIVE_INFINITY, zoneTop > 0 ? zoneTop : Number.POSITIVE_INFINITY);
	if (!Number.isFinite(from) || from <= 0) return '';
	const to = dims().rows - chromeRows(); // gap row above the input top border
	let clear = '';
	for (let r = from; r <= to; r++) {
		if (r >= 1) clear += `${CSI}${r};1H${CSI}2K`;
	}
	return clear;
}

/** Row the given popup starts on (mirrors the geometry in popupString). */
function popupTopRow(popup: NonNullable<ReturnType<typeof activePopup>>): number {
	const { cols, rows } = dims();
	const width = Math.min(cols - 4, 64);
	if (width < 30) return 1;
	const topBorderRow = rows - chromeRows() + 1; // input box top border row
	const room = Math.max(0, topBorderRow - 2);
	const count = Math.min(popup.items.length, MAX_POPUP_ROWS, room);
	if (count < 1) return 1;
	return topBorderRow - (count + 2) - 1;
}

// =============================================================================
// Bottom chrome (input box + status line)
// =============================================================================

function statusLine(max: number): string {
	const hint = S.term && S.term.exitCode === null
		? 'type input · Enter sends to command · ctrl+o terminal'
		: S.permissionMode === 'auto'
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

	// Sub-agent monitor and terminal panel sit between the input box and the status line.
	const panel = termPanelRows();
	const monitorCount = monitorRows();
	const bottomBorderRow = rows - 1 - panel - monitorCount;
	// Input rows sit directly above the bottom border; the top border is one
	// row above them (it was previously drawn under the first input line and
	// erased by it, which hid it completely).
	const topBorderRow = bottomBorderRow - vis - 1;
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

	// ── Sub-agent monitor: indicator row + optional live inspector ────────
	if (monitorCount > 0) parts.push(monitorString(bottomBorderRow + 1, monitorCount));

	// ── Terminal panel: live output of the agent's bash commands ──────────
	if (S.term && panel > 0) {
		const hasInputRow = S.term.exitCode === null;
		const shown = panel - (hasInputRow ? 4 : 2);
		const headerRow = rows - panel;
		const statusText = S.term.exitCode === null ? (S.term.interrupting ? 'STOPPING' : 'RUNNING') : `EXIT ${S.term.exitCode}`;
		const status = S.term.exitCode === null
			? c.yellow(statusText)
			: S.term.exitCode === 0
				? c.green(statusText)
				: c.red(statusText);
		const commandText = S.term.command.trim().replace(/\s+/g, ' ');
		const headerPrefix = '╭─ TERMINAL · ';
		const headerSuffix = ` ${statusText} · ctrl+o hide `;
		const commandWidth = Math.max(0, cols - headerPrefix.length - headerSuffix.length - 1);
		const visibleCommand = clipText(commandText, commandWidth);
		const headerFill = '─'.repeat(Math.max(0, cols - headerPrefix.length - visibleCommand.length - headerSuffix.length - 1));
		parts.push(
			line(
				headerRow,
				c.cyan('╭─ ') + c.bold('TERMINAL') + c.dim(' · ') + c.white(visibleCommand) + ' ' + status + c.dim(' · ctrl+o hide ') + c.cyan(headerFill + '╮'),
			),
		);
		const outputLines = S.term.lines;
		const content = terminalPanelWindow(outputLines, S.term.scrollOffset, shown);
		const panelWidth = Math.max(1, cols - 4);
		for (let i = 0; i < shown; i++) {
			const text = content[i] ?? (outputLines.length === 0 ? 'Waiting for terminal output…' : '');
			const body = clipText(text, panelWidth).padEnd(panelWidth);
			parts.push(line(headerRow + 1 + i, c.cyan('│') + ' ' + body + ' ' + c.cyan('│')));
		}
		if (hasInputRow) {
			const labelPrefix = '├─ INPUT ';
			const labelFill = '─'.repeat(Math.max(0, cols - labelPrefix.length - 1));
			parts.push(line(headerRow + 1 + shown, c.cyan('├─ ') + c.bold('INPUT') + c.cyan(' ' + labelFill + '┤')));

			const inputHint = 'Enter sends · Esc stops · ⇧PgUp/PgDn scroll';
			const inputText = S.term.input ? '› ' + S.term.input : '› Type a response…';
			const inputWidth = Math.max(0, panelWidth - inputHint.length - 2);
			const inputValue = clipText(inputText, inputWidth).padEnd(inputWidth);
			const inputBody = (S.term.input ? c.yellow(inputValue) : c.dim(inputValue)) + c.dim('  ' + inputHint);
			parts.push(line(headerRow + 2 + shown, c.cyan('│') + ' ' + inputBody + ' ' + c.cyan('│')));
		}
		parts.push(line(rows - 1, c.cyan('╰' + '─'.repeat(cols - 2) + '╯')));
	}

	parts.push(line(rows, statusLine(cols - 1)));
	return parts.join('');
}

function inputCursor(): string {
	const { rows, cols } = dims();
	const pos = cursorPos();
	const vis = visibleLines();
	const width = Math.max(1, cols - 6);
	const offset = lineOffset(pos.col, width);
	// The cursor must sit on the row being edited, which moves with the
	// number of input lines and the terminal panel below the box.
	const row = rows - 1 - termPanelRows() - monitorRows() - vis + (pos.line - S.topLine);
	return `${CSI}${Math.max(1, Math.min(rows, row))};${5 + pos.col - offset}H`;
}

function paint(): void {
	if (!S.active) return;
	if (S.editing) {
		syncRegion();
		// The saved slot holds the output position while editing: don't touch it.
		out.write(CSI + '?25l' + popupClearString() + chromeString() + inputCursor() + CSI + '?25h');
		return;
	}
	// Setting the scroll region homes the cursor, so save where output continues
	// first. The monitor and terminal panel open and close mid-run; when the
	// region shrank its content was scrolled up by the same number of rows.
	out.write(SAVE);
	const before = regionBottomRow;
	syncRegion();
	const shrunk = Math.max(0, before - regionBottomRow);
	out.write(popupClearString() + chromeString() + RESTORE + (shrunk > 0 ? `${CSI}${shrunk}A` : ''));
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
	if (termKeyStop) {
		termKeyStop();
		termKeyStop = null;
	}

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
	// macOS Terminal.app and several other terminals encode Shift+Enter as
	// ESC+CR; opencode, Claude Code and Codex all accept it as a newline.
	'\x1b\r': 'shift+enter',
	'\x1b\n': 'shift+enter',
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
	'\x1b[1;1A': 'up',
	'\x1b[1;1B': 'down',
	'\x1b[1;1C': 'right',
	'\x1b[1;1D': 'left',
	'\x1b[C': 'right',
	'\x1bOC': 'right',
	'\x1b[D': 'left',
	'\x1bOD': 'left',
	'\x1b[Z': 'shift+tab',
	'\x1b[H': 'home',
	'\x1bOH': 'home',
	'\x1b[1~': 'home',
	'\x1b[F': 'end',
	'\x1bOF': 'end',
	'\x1b[4~': 'end',
	'\x1b[3~': 'delete',
	'\x1b[5~': 'pageup',
	'\x1b[6~': 'pagedown',
	'\x1b[5;2~': 'shift+pageup',
	'\x1b[6;2~': 'shift+pagedown',
	'\x1b[1;5D': 'word-left',
	'\x1b[1;3D': 'word-left',
	'\x1bb': 'word-left',
	'\x1b[1;5C': 'word-right',
	'\x1b[1;3C': 'word-right',
	'\x1bf': 'word-right',
	'\x1b\x7f': 'ctrl+w',
	'\x0f': 'ctrl+o',
	'\x14': 'ctrl+t',
	// Kitty keyboard protocol encodings
	'\x1b[18;5u': 'ctrl+o',
	'\x1b[20;5u': 'ctrl+t',
	// Kitty keyboard protocol encodings (enabled below) — without them some
	// terminals cannot distinguish Shift+Enter from Enter at all.
	'\x1b[27u': 'escape',
	'\x1b[98;3u': 'word-left',
	'\x1b[102;3u': 'word-right',
	'\x1b[13;3u': 'shift+enter',
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

interface KeySub {
	handler: (key: Key) => void;
	onError?: () => void;
	/** Run-time listeners (cancel, terminal toggle, /subagents) as opposed to prompts that own the keyboard. */
	background: boolean;
}

const keySubs = new Set<KeySub>();
const pumpState = { paste: null as string | null };
let pumping = false;
/** Gets first refusal on each key, but only while every attached listener is a background one. */
let keyInterceptor: ((key: Key) => boolean) | null = monitorKeyIntercept;

/** Replace the key interceptor (null disables it). The sub-agent monitor is the default. */
export function setKeyInterceptor(interceptor: ((key: Key) => boolean) | null): void {
	keyInterceptor = interceptor;
}

function onStdinData(chunk: string | Buffer): void {
	for (const key of parseKeys(chunk.toString(), pumpState)) {
		const subs = [...keySubs];
		if (keyInterceptor && subs.length > 0 && subs.every((sub) => sub.background) && keyInterceptor(key)) continue;
		for (const sub of subs) {
			if (!keySubs.has(sub)) continue; // stopped by an earlier handler for this same key
			try {
				sub.handler(key);
			} catch {
				// Always release raw mode if a UI handler throws. The REPL can recover
				// on its next prompt instead of leaving the terminal permanently stuck.
				removeKeySub(sub);
				sub.onError?.();
			}
		}
	}
}

function removeKeySub(sub: KeySub): void {
	if (!keySubs.delete(sub) || keySubs.size > 0 || !pumping) return;
	pumping = false;
	const stdin = process.stdin;
	stdin.off('data', onStdinData);
	if (out.isTTY) out.write(`${CSI}?2004l${CSI}<u${CSI}>4;0m`);
	stdin.setRawMode?.(false);
	stdin.pause();
}

/**
 * Call `handler` for every key until the returned function is called. All
 * listeners share one stdin reader, and raw mode is released only when the
 * last one stops — so concurrent listeners (a prompt, the Esc-to-cancel of each
 * parallel sub-agent request, the /subagents listener) cannot switch each
 * other's keyboard off.
 */
export function listenKeys(
	handler: (key: Key) => void,
	onError?: () => void,
	opts: { background?: boolean } = {},
): () => void {
	const sub: KeySub = { handler, onError, background: opts.background === true };
	keySubs.add(sub);
	if (!pumping) {
		pumping = true;
		pumpState.paste = null;
		const stdin = process.stdin;
		stdin.setRawMode?.(true);
		stdin.resume();
		stdin.setEncoding('utf8');
		if (out.isTTY) {
			// Bracketed paste + kitty keyboard flags (the same negotiation opencode
			// uses). The kitty push makes supporting terminals report Shift+Enter
			// distinctly (CSI 13;2u) and the Esc key as CSI 27u. Terminals without
			// kitty support fall back to xterm modifyOtherKeys (mode 1), which also
			// encodes Shift+Enter as CSI 13;2u; terminals with neither simply ignore
			// both sequences and keep their legacy encoding.
			out.write(`${CSI}?2004h${CSI}>1u${CSI}>4;1m`);
		}
		stdin.on('data', onStdinData);
	}
	return () => removeKeySub(sub);
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
	// @mentions complete anywhere in the line (like Claude Code), replacing
	// the partial token at the cursor with the highlighted item.
	if (!S.buffer.startsWith('/')) {
		const popup = activePopup();
		if (popup?.kind === 'mention' && popup.start !== undefined && popup.end !== undefined) {
			const item = popup.items[S.popupSel] ?? popup.items[0];
			if (item) {
				const start = popup.start;
				S.buffer = S.buffer.slice(0, start) + item.label + ' ' + S.buffer.slice(popup.end);
				S.cursor = start + item.label.length + 1;
			}
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
				syncTermKeyListener(); // the editor owns the keys now
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
					syncTermKeyListener(); // let ctrl+o reach the terminal panel again
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
								} else if (popup.start !== undefined && popup.end !== undefined) {
									// Enter on an @mention completes the token at the
									// cursor instead of submitting the message.
									const item = popup.items[S.popupSel] ?? popup.items[0];
									if (item) {
										const start = popup.start;
										S.buffer = S.buffer.slice(0, start) + item.label + ' ' + S.buffer.slice(popup.end);
										S.cursor = start + item.label.length + 1;
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
						case 'ctrl+o':
						case 'ctrl+t':
							toggleTerminalPanel();
							return;
						case 'tab': {
							if (popup) {
								const item = popup.items[S.popupSel] ?? popup.items[0];
								if (item) {
									if (popup.kind === 'command') {
										set(item.label, item.label.length);
									} else if (popup.start !== undefined && popup.end !== undefined) {
										const start = popup.start;
										set(
											S.buffer.slice(0, start) + item.label + ' ' + S.buffer.slice(popup.end),
											start + item.label.length + 1,
										);
									}
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
			syncTermKeyListener();
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
