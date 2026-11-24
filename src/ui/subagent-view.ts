// =============================================================================
// Sub-agent monitor — pure rendering + key handling (no terminal state).
// screen.ts owns the layout and calls these; /subagents reuses buildInspector.
// =============================================================================

import Chalk from 'chalk';
import type { SubAgentActivity, SubAgentStatus } from '../runtime/subagents.js';

const c: typeof Chalk = Chalk as unknown as typeof Chalk;

/** Rows the inspector panel spends on borders + the fixed task/status/now header. */
const PANEL_CHROME_ROWS = 5;

const clip = (text: string, max: number): string => {
	if (max <= 0) return '';
	return text.length <= max ? text : text.slice(0, Math.max(0, max - 1)) + '…';
};

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim();

export function formatDuration(ms: number): string {
	const total = Math.max(0, ms);
	if (total < 1000) return `${Math.round(total)}ms`;
	if (total < 10_000) return `${(total / 1000).toFixed(1)}s`;
	const seconds = Math.round(total / 1000);
	if (seconds < 60) return `${seconds}s`;
	return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
}

const STATUS_LABEL: Record<SubAgentStatus, string> = {
	running: 'Running',
	waiting: 'Waiting',
	completed: 'Completed',
	failed: 'Failed',
	cancelled: 'Cancelled',
};

export function statusLabel(status: SubAgentStatus): string {
	return STATUS_LABEL[status];
}

export function statusIcon(status: SubAgentStatus): string {
	switch (status) {
		case 'running':
			return c.yellow('◐');
		case 'waiting':
			return c.cyan('◔');
		case 'completed':
			return c.green('✓');
		case 'cancelled':
			return c.yellow('!');
		default:
			return c.red('✗');
	}
}

const isLive = (a: SubAgentActivity): boolean => a.status === 'running' || a.status === 'waiting';
const elapsed = (a: SubAgentActivity, now: number): number => (a.endedAt ?? now) - a.startedAt;

// -----------------------------------------------------------------------------
// Indicator strip
// -----------------------------------------------------------------------------

export interface StripOptions {
	width: number;
	/** Inspector panel is open. */
	open: boolean;
	/** False when the terminal is too small to show the panel. */
	canInspect: boolean;
	/** Index of the highlighted sub-agent. */
	selected: number;
}

/** One line: "● 3 subagents running · 1 done | ▸ name ◐ 2/3 | ↑↓ Navigate | Enter Inspect". */
export function renderStrip(list: readonly SubAgentActivity[], opts: StripOptions): string {
	const running = list.filter((a) => a.status === 'running').length;
	const waiting = list.filter((a) => a.status === 'waiting').length;
	const done = list.filter((a) => a.status === 'completed').length;
	const failed = list.filter((a) => a.status === 'failed' || a.status === 'cancelled').length;
	const live = running + waiting;
	const plural = (n: number): string => `${n} subagent${n === 1 ? '' : 's'}`;

	const dot = live > 0 ? c.yellow('●') : failed > 0 ? c.red('●') : c.green('●');
	const headline = live > 0 ? `${plural(live)} running` : `${plural(list.length)} finished`;
	const detail = [waiting > 0 ? `${waiting} waiting` : '', done > 0 && live > 0 ? `${done} done` : '', failed > 0 ? `${failed} failed` : '']
		.filter(Boolean)
		.join(' · ');

	const sel = Math.min(Math.max(0, opts.selected), Math.max(0, list.length - 1));
	const current = list[sel];
	const hint = !opts.canInspect
		? 'enlarge terminal to inspect · /subagents'
		: opts.open
			? '↑↓ Switch | PgUp/PgDn Scroll | Esc Close'
			: '↑↓ Navigate | Enter Inspect';

	// Lowest priority is dropped first when the terminal is narrow.
	const segments: Array<{ plain: string; paint: (s: string) => string; priority: number }> = [
		{ plain: ' ' + headline, paint: (s) => c.bold(s), priority: 0 },
		{ plain: detail ? ' · ' + detail : '', paint: (s) => c.dim(s), priority: 3 },
		{
			plain: current ? ` | ▸ ${current.agent} ${list.length > 1 ? `${sel + 1}/${list.length}` : ''}`.trimEnd() : '',
			paint: (s) => c.cyan(s),
			priority: 2,
		},
		{ plain: ' | ' + hint, paint: (s) => c.dim(s), priority: 1 },
	];

	let kept = segments.filter((s) => s.plain);
	const total = (): number => 1 + kept.reduce((sum, s) => sum + s.plain.length, 0);
	while (total() > opts.width && kept.length > 1) {
		const drop = kept.reduce((worst, s) => (s.priority > worst.priority ? s : worst), kept[0]!);
		kept = kept.filter((s) => s !== drop);
	}
	const budget = Math.max(0, opts.width - 1);
	let left = budget;
	let text = dot;
	for (const segment of kept) {
		const shown = clip(segment.plain, left);
		left -= shown.length;
		text += segment.paint(shown);
	}
	return text;
}

// -----------------------------------------------------------------------------
// Inspector
// -----------------------------------------------------------------------------

function wrap(text: string, width: number): string[] {
	if (width < 4) return [clip(text, width)];
	const lines: string[] = [];
	for (const raw of text.replace(/\r/g, '').split('\n')) {
		let line = raw.replace(/\t/g, '  ').trimEnd();
		if (!line) {
			lines.push('');
			continue;
		}
		while (line.length > width) {
			let cut = line.lastIndexOf(' ', width);
			if (cut < width / 2) cut = width;
			lines.push(line.slice(0, cut).trimEnd());
			line = line.slice(cut).trimStart();
		}
		lines.push(line);
	}
	return lines;
}

export interface Inspector {
	/** Fixed rows above the scrolling log: task, status, current activity. */
	head: string[];
	/** Scrolling log: progress, tool calls, then final output or error. */
	body: string[];
}

/** Everything known about one sub-agent as styled lines no wider than `width`. */
export function buildInspector(a: SubAgentActivity, width: number, now: number = Date.now()): Inspector {
	const room = Math.max(1, width);
	const stepText = a.budget > 0 && a.step > 0 ? ` · step ${Math.min(a.step, a.budget)}/${a.budget}` : '';
	const now_ = isLive(a) ? a.activity : a.status === 'completed' ? 'finished' : a.status;
	const statusText = `${statusLabel(a.status)} · ${formatDuration(elapsed(a, now))}${stepText}`;
	const head = [
		c.dim('Task    ') + clip(flat(a.task), room - 8),
		c.dim('Status  ') + statusIcon(a.status) + ' ' + clip(statusText, room - 10),
		c.dim('Now     ') + (isLive(a) ? c.cyan(clip(now_, room - 8)) : clip(now_, room - 8)),
	];

	const body: string[] = [];
	if (a.progress.length > 0) {
		body.push(c.bold('Progress'));
		for (const line of a.progress) {
			wrap(line, room - 4).forEach((part, index) => body.push((index === 0 ? c.dim('  • ') : '    ') + part));
		}
	}
	if (a.tools.length > 0) {
		body.push(c.bold('Tool calls'));
		for (const tool of a.tools) {
			const running = tool.endedAt === undefined;
			const icon = running ? c.yellow('◐') : tool.ok ? c.green('✓') : c.red('✗');
			const time = formatDuration((tool.endedAt ?? now) - tool.startedAt) + (running ? '…' : '');
			const label = `${tool.name} ${tool.args}`.trim();
			body.push('  ' + icon + ' ' + clip(label, Math.max(4, room - 4 - time.length - 1)) + ' ' + c.dim(time));
			if (tool.result) body.push(c.dim('    ↳ ' + clip(tool.result, room - 6)));
		}
	}
	if (a.output) {
		body.push(c.bold('Result'));
		for (const line of wrap(a.output, room - 2)) body.push('  ' + line);
	}
	if (a.error) {
		body.push(c.red.bold('Error'));
		for (const line of wrap(a.error, room - 2)) body.push('  ' + c.red(line));
	}
	if (body.length === 0) body.push(c.dim('  No activity yet.'));
	return { head, body };
}

/** Rows of scrolling log a panel of `height` rows shows. */
export function panelBodyRows(height: number): number {
	return Math.max(1, height - PANEL_CHROME_ROWS);
}

export interface PanelOptions {
	index: number;
	count: number;
	width: number;
	height: number;
	/** Lines scrolled up from the newest (0 follows the tail). */
	scroll: number;
	now?: number;
}

/** The bordered inspector as exactly `height` rows of exactly `width` visible columns. */
export function renderPanel(a: SubAgentActivity, opts: PanelOptions): { rows: string[]; maxScroll: number } {
	const { width, height } = opts;
	const now = opts.now ?? Date.now();
	const inner = Math.max(1, width - 4); // '│ ' + text + ' │'
	const { head, body } = buildInspector(a, inner, now);
	const bodyRows = panelBodyRows(height);
	const maxScroll = Math.max(0, body.length - bodyRows);
	const scroll = Math.min(Math.max(0, opts.scroll), maxScroll);
	const end = body.length - scroll;
	const visible = body.slice(Math.max(0, end - bodyRows), end);

	const border = c.magenta;
	const pad = (styled: string): string => {
		// styled is already clipped to `inner` visible columns
		// eslint-disable-next-line no-control-regex
		const plain = styled.replace(/\x1b\[[0-9;]*m/g, '');
		return border('│') + ' ' + styled + ' '.repeat(Math.max(0, inner - plain.length)) + ' ' + border('│');
	};

	const avail = Math.max(1, width - 3); // '╭─' … '╮'
	let title = ` ◆ ${a.agent} [${a.id}] `;
	let position = opts.count > 1 ? ` ${opts.index + 1}/${opts.count} ` : '';
	if (title.length + position.length > avail) position = '';
	title = clip(title, avail);
	const top = border('╭─' + title) + border('─'.repeat(avail - title.length - position.length)) + c.dim(position) + border('╮');
	const more = scroll > 0 ? ` ↓ ${scroll} newer ` : '';
	const hint = clip(` ↑↓ switch · pgup/pgdn scroll${more ? ' ·' + more : ''} · esc close `, Math.max(0, width - 4));
	const bottom = border('╰─') + c.dim(hint) + border('─'.repeat(Math.max(0, width - 3 - hint.length)) + '╯');

	const rows: string[] = [top, ...head.map(pad)];
	for (let i = 0; i < bodyRows; i++) rows.push(pad(visible[i] ?? ''));
	rows.push(bottom);
	return { rows, maxScroll };
}

// -----------------------------------------------------------------------------
// Keys
// -----------------------------------------------------------------------------

export interface MonitorState {
	/** Index into the current run's sub-agent list. */
	selected: number;
	open: boolean;
	scroll: number;
}

export const INITIAL_MONITOR: MonitorState = { selected: 0, open: false, scroll: 0 };

export interface MonitorKeyContext {
	count: number;
	/** The user has typed a /command that Enter must submit instead. */
	typing: boolean;
	canInspect: boolean;
	page: number;
	maxScroll: number;
}

/**
 * Decide what a key does to the monitor. `consumed` is false for keys the
 * monitor does not own — in particular Esc while the panel is closed, which
 * keeps its existing meaning (cancel the running request) — so only a key the
 * monitor itself uses is ever hidden from the rest of the app.
 */
export function reduceMonitorKey(state: MonitorState, key: string, ctx: MonitorKeyContext): { state: MonitorState; consumed: boolean } {
	const ignore = { state, consumed: false };
	if (ctx.count <= 0) return ignore;
	const selected = Math.min(Math.max(0, state.selected), ctx.count - 1);
	const move = (to: number): { state: MonitorState; consumed: boolean } => {
		const next = Math.min(Math.max(0, to), ctx.count - 1);
		return { state: { ...state, selected: next, scroll: next === selected ? state.scroll : 0 }, consumed: true };
	};
	const scrollTo = (to: number): { state: MonitorState; consumed: boolean } => ({
		state: { ...state, selected, scroll: Math.min(Math.max(0, to), ctx.maxScroll) },
		consumed: true,
	});

	switch (key) {
		case 'up':
			return move(selected - 1);
		case 'down':
			return move(selected + 1);
		case 'enter':
			if (ctx.typing || !ctx.canInspect) return ignore;
			return { state: state.open ? { ...state, selected } : { selected, open: true, scroll: 0 }, consumed: true };
		case 'escape':
			return state.open ? { state: { ...state, selected, open: false, scroll: 0 }, consumed: true } : ignore;
		case 'pageup':
			return state.open ? scrollTo(state.scroll + ctx.page) : ignore;
		case 'pagedown':
			return state.open ? scrollTo(state.scroll - ctx.page) : ignore;
		case 'home':
			return state.open ? scrollTo(ctx.maxScroll) : ignore;
		case 'end':
			return state.open ? scrollTo(0) : ignore;
		default:
			return ignore;
	}
}
