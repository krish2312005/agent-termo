// =============================================================================
// Workspace presentation helpers — pure, no terminal or global state.
//
// The navigator rows, the composer routing decision, the sub-agent transcript
// mapping and the workspace key reducer live here so they can be exercised
// without a renderer. All values come from the runtime tree/transcript; nothing
// is fabricated, and no color is chosen here (the TUI maps roles to its live
// tokens).
// =============================================================================

import type { AgentTreeNode, WorkspaceStatus } from '../runtime/agent-tree.js';
import { moveAgentSelection, parentAgentId, reconcileSelection } from '../runtime/agent-tree.js';
import type { AgentTranscriptEntry } from '../runtime/agent-transcript.js';
import { MAIN_AGENT_ID } from '../runtime/subagents.js';
import { formatDuration } from './subagent-view.js';
import type { UiEntry } from './tui.js';

export type AgentColorRole = WorkspaceStatus;
export type AgentMetaRole = 'status' | 'detail' | 'error' | 'muted';

export interface AgentRowSegment {
	text: string;
	role: AgentMetaRole;
}

export interface AgentRow {
	/** Selection marker (`▸ `) plus the tree connector; empty connector at depth 0. */
	prefix: string;
	marker: string;
	connector: string;
	glyph: string;
	/** Display name, plus `#<id6>` only when the runtime flags a duplicate sibling. */
	label: string;
	/** Joined metadata: `<status> · <detail> · <time> · <tokens> · <queued>`. */
	meta: string;
	/** The same metadata as separately colorable segments, in display order. */
	segments: AgentRowSegment[];
	role: AgentColorRole;
	selected: boolean;
}

export interface AgentRowOptions {
	/** Available cells for the whole row (the TUI passes terminal columns minus page padding). */
	width: number;
	now: number;
	selected: boolean;
	/** False when a later sibling exists in DFS order (the connector becomes `├ `). */
	lastSibling?: boolean;
	/** `/agent` prompt active on main; not part of AgentTreeNode. */
	activeAgentName?: string;
}

const STATUS_GLYPH: Record<WorkspaceStatus, string> = {
	idle: '○',
	running: '◐',
	waiting: '◔',
	completed: '✓',
	failed: '✗',
	stopped: '!',
};

const STATUS_LABEL: Record<WorkspaceStatus, string> = {
	idle: 'Idle',
	running: 'Running',
	waiting: 'Waiting',
	completed: 'Completed',
	failed: 'Failed',
	stopped: 'Stopped',
};

export function agentStatusGlyph(status: WorkspaceStatus): string {
	return STATUS_GLYPH[status];
}

export function agentStatusLabel(status: WorkspaceStatus): string {
	return STATUS_LABEL[status];
}

/** `943`, `1.2k`, `12k`, `1.5M` — formatting only, never a fabricated metric. */
export function formatAgentTokens(totalTokens: number): string {
	const value = Number.isFinite(totalTokens) ? Math.max(0, Math.round(totalTokens)) : 0;
	if (value < 1_000) return String(value);
	if (value < 10_000) return (value / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
	if (value < 1_000_000) return Math.round(value / 1_000) + 'k';
	return (value / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}

/** Code-point cell count, matching `clipText` (the module has no width library). */
function cellLength(value: string): number {
	return [...value].length;
}

function clipText(value: string, max: number): string {
	if (max <= 0) return '';
	const chars = [...value];
	return chars.length <= max ? value : chars.slice(0, Math.max(0, max - 1)).join('') + '…';
}

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim();
const oneLine = (text: string, max: number): string => clipText(flat(text), max);
const firstLine = (text: string): string => text.split(/\r?\n/, 1)[0] ?? '';
const isLive = (status: WorkspaceStatus): boolean => status === 'running' || status === 'waiting';

/** Local wall-clock `HH:MM` (hour and minute only, 24-hour). */
function formatClock(at: number): string {
	return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

const waitingText = (count: number): string => `waiting on ${count} subagent${count === 1 ? '' : 's'}`;

type MetaKind = 'status' | 'agent' | 'task' | 'waiting' | 'activity' | 'error' | 'time' | 'tokens' | 'queued';

interface MetaSegment extends AgentRowSegment {
	/** 1 = tokens, 2 = time, 3 = completed task/goal, 4 = active agent name. */
	priority?: 1 | 2 | 3 | 4;
	kind: MetaKind;
}

function metaSegments(node: AgentTreeNode, opts: AgentRowOptions): MetaSegment[] {
	const segments: MetaSegment[] = [{ text: agentStatusLabel(node.status), role: 'status', kind: 'status' }];
	const live = isLive(node.status);

	if (node.kind === 'main') {
		const activeAgent = oneLine(opts.activeAgentName ?? '', 40);
		if (activeAgent) segments.push({ text: activeAgent, role: 'muted', kind: 'agent', priority: 4 });
		if (node.task) segments.push({ text: oneLine(node.task, 80), role: 'muted', kind: 'task', priority: 3 });
		if (node.activeChildCount > 0) segments.push({ text: waitingText(node.activeChildCount), role: 'detail', kind: 'waiting' });
		if (live) segments.push({ text: 'since ' + formatClock(node.startedAt), role: 'muted', kind: 'time', priority: 2 });
		if (node.usage) segments.push({ text: formatAgentTokens(node.usage.totalTokens) + ' tok', role: 'muted', kind: 'tokens', priority: 1 });
		if (node.queued > 0) segments.push({ text: node.queued + ' queued', role: 'muted', kind: 'queued' });
		return segments;
	}

	if (live) {
		const activity = oneLine(node.activity, 80);
		if (activity) segments.push({ text: activity, role: 'detail', kind: 'activity' });
	} else if (node.status === 'completed') {
		if (node.task) segments.push({ text: oneLine(node.task, 80), role: 'muted', kind: 'task', priority: 3 });
	} else if (node.status === 'failed') {
		const error = node.error ? oneLine(node.error, 120) : '';
		if (error) segments.push({ text: error, role: 'error', kind: 'error' });
	}
	// stopped has no detail segment; the `!` glyph and `Stopped` label carry it.
	if (live) segments.push({ text: 'since ' + formatClock(node.startedAt), role: 'muted', kind: 'time', priority: 2 });
	else if (node.endedAt !== undefined) segments.push({ text: formatDuration(node.endedAt - node.startedAt), role: 'muted', kind: 'time', priority: 2 });
	if (node.usage) segments.push({ text: formatAgentTokens(node.usage.totalTokens) + ' tok', role: 'muted', kind: 'tokens', priority: 1 });
	if (node.queued > 0) segments.push({ text: node.queued + ' queued', role: 'muted', kind: 'queued' });
	return segments;
}

function rowLength(prefix: string, glyphPart: string, label: string, segments: readonly MetaSegment[]): number {
	const meta = segments.reduce((sum, segment) => sum + cellLength(segment.text), 0) + Math.max(0, segments.length - 1) * 3;
	return cellLength(prefix) + cellLength(glyphPart) + cellLength(label) + (segments.length > 0 ? 3 + meta : 0);
}

/**
 * One navigator row. `width` is the row's available cells and is a hard
 * invariant: the rendered row never exceeds it. Optional metadata is dropped
 * in the design's order (tokens, time, task/goal, active agent), then queued
 * counts, then the detail and name are clipped with `…`.
 */
export function formatAgentRow(node: AgentTreeNode, opts: AgentRowOptions): AgentRow {
	const width = Math.max(1, Math.floor(opts.width) || 1);
	const marker = opts.selected ? '▸ ' : '  ';
	const connector = node.depth > 0
		? '  '.repeat(Math.max(0, node.depth - 1)) + (opts.lastSibling === false ? '├ ' : '└ ')
		: '';
	const prefix = marker + connector;
	const glyph = agentStatusGlyph(node.status);
	const glyphPart = glyph + ' ';
	const baseName = node.kind === 'main' ? 'main' : node.name;
	const suffix = node.kind === 'subagent' && node.duplicateName ? '#' + node.id.slice(0, 6) : '';
	const segments = metaSegments(node, opts);
	const nameCap = width >= 78 ? 32 : width >= 58 ? 22 : 14;

	// The duplicate `#id6` suffix is part of the retained identity while the
	// label field is at least its 8-cell minimum; below that it goes before the
	// name itself is clipped.
	const formatLabel = (max: number, withSuffix: boolean): string => {
		if (!withSuffix || !suffix) return clipText(baseName, max);
		const suffixCells = cellLength(suffix);
		if (max <= suffixCells) return clipText(baseName + suffix, max);
		return clipText(baseName, max - suffixCells) + suffix;
	};

	const minMeta = segments.length > 0 ? 3 + cellLength(segments[0]!.text) : 0;
	const nameRoom = Math.max(8, Math.min(nameCap, width - cellLength(prefix) - cellLength(glyphPart) - minMeta));
	let label = formatLabel(nameRoom, suffix.length > 0);
	const total = (): number => rowLength(prefix, glyphPart, label, segments);

	for (const priority of [1, 2, 3, 4] as const) {
		if (total() <= width) break;
		for (let index = segments.length - 1; index >= 0; index--) {
			if (segments[index]?.priority === priority) segments.splice(index, 1);
		}
	}

	// The design's 9-cell detail and 8-cell name minimums can still overflow at
	// narrow widths. Queued counts are the first hard-invariant casualty, ahead
	// of clipping the detail or name below those minimums.
	const designMinimum = (): number => rowLength(
		prefix,
		glyphPart,
		formatLabel(8, suffix.length > 0),
		segments.map((segment) => segment.role === 'detail' || segment.role === 'error'
			? { ...segment, text: clipText(segment.text, 9) }
			: segment),
	);
	if (total() > width && designMinimum() > width) {
		for (let index = segments.length - 1; index >= 0; index--) {
			if (segments[index]?.kind === 'queued') segments.splice(index, 1);
		}
	}

	// Clip live activity / failed error to its readable minimum, then the name.
	while (total() > width) {
		const detail = segments.find((segment) => segment.role === 'detail' || segment.role === 'error');
		if (!detail || cellLength(detail.text) <= 9) break;
		detail.text = clipText(detail.text, Math.max(9, cellLength(detail.text) - (total() - width)));
	}
	while (total() > width && cellLength(label) > 8) {
		label = formatLabel(Math.max(8, cellLength(label) - (total() - width)), suffix.length > 0);
	}

	// Hard invariant below the design minimums: shed queued metadata, clip the
	// detail to its last cell, drop it, then clip the name. The fixed parts
	// (marker, connector, glyph, status label) are never truncated.
	if (total() > width) {
		for (let index = segments.length - 1; index >= 0; index--) {
			if (segments[index]?.kind === 'queued') segments.splice(index, 1);
		}
	}
	while (total() > width) {
		const detail = segments.find((segment) =>
			(segment.role === 'detail' || segment.role === 'error') && cellLength(segment.text) > 1);
		if (!detail) break;
		detail.text = clipText(detail.text, Math.max(1, cellLength(detail.text) - (total() - width)));
	}
	if (total() > width) {
		for (let index = segments.length - 1; index >= 0; index--) {
			const role = segments[index]?.role;
			if (role === 'detail' || role === 'error') segments.splice(index, 1);
		}
	}
	while (total() > width && cellLength(label) > 0) {
		label = formatLabel(Math.max(0, cellLength(label) - (total() - width)), suffix.length > 0);
	}

	return {
		prefix,
		marker,
		connector,
		glyph,
		label,
		meta: segments.map((segment) => segment.text).join(' · '),
		segments: segments.map((segment) => ({ text: segment.text, role: segment.role })),
		role: node.status,
		selected: opts.selected,
	};
}

/** True when the node at this DFS index is its parent's last child. */
export function lastSiblingFlags(nodes: readonly AgentTreeNode[]): boolean[] {
	return nodes.map((node, index) => {
		for (let next = index + 1; next < nodes.length; next++) {
			const candidate = nodes[next]!;
			if (candidate.depth < node.depth) return true;
			if (candidate.depth === node.depth) return false;
		}
		return true;
	});
}

export type ContentStatusRole = 'accent' | 'separator' | 'status' | 'detail' | 'error' | 'muted';

export interface ContentStatusSegment {
	text: string;
	role: ContentStatusRole;
}

interface ContentPart {
	text: string;
	role: Exclude<ContentStatusRole, 'separator'>;
	priority?: 1 | 2 | 3;
}

/**
 * The one-line content status row for the selected agent:
 * `@name · Status · detail · elapsed · tokens`, keeping only real values and
 * dropping optional segments (tokens, elapsed, completed task) when narrow.
 */
export function formatContentStatus(
	node: AgentTreeNode,
	opts: { now: number; width: number },
): ContentStatusSegment[] {
	const width = Math.max(1, Math.floor(opts.width) || 1);
	const live = isLive(node.status);
	const parts: ContentPart[] = [{ text: '@' + node.name, role: 'accent' }, { text: agentStatusLabel(node.status), role: 'status' }];

	if (node.kind === 'main') {
		if (node.activity) parts.push({ text: oneLine(node.activity, 100), role: 'detail' });
		if (live) parts.push({ text: formatDuration(Math.max(0, opts.now - node.startedAt)), role: 'muted', priority: 2 });
	} else {
		if (live) {
			if (node.activity) parts.push({ text: oneLine(node.activity, 100), role: 'detail' });
		} else if (node.status === 'completed') {
			if (node.task) parts.push({ text: oneLine(node.task, 100), role: 'detail', priority: 3 });
		} else if (node.status === 'failed') {
			const error = node.error ? oneLine(node.error, 160) : '';
			if (error) parts.push({ text: error, role: 'error' });
		}
		if (live) parts.push({ text: 'since ' + formatClock(node.startedAt), role: 'muted', priority: 2 });
		else if (node.endedAt !== undefined) parts.push({ text: formatDuration(node.endedAt - node.startedAt), role: 'muted', priority: 2 });
	}
	if (node.usage) parts.push({ text: formatAgentTokens(node.usage.totalTokens) + ' tok', role: 'muted', priority: 1 });

	const plainLength = (): number => parts.reduce((sum, part) => sum + cellLength(part.text), 0) + Math.max(0, parts.length - 1) * 3;
	for (const priority of [1, 2, 3] as const) {
		if (plainLength() <= width) break;
		for (let index = parts.length - 1; index >= 0; index--) {
			if (parts[index]?.priority === priority) parts.splice(index, 1);
		}
	}
	while (plainLength() > width) {
		const detail = parts.find((part) => (part.role === 'detail' || part.role === 'error') && cellLength(part.text) > 9);
		if (!detail) break;
		detail.text = clipText(detail.text, Math.max(9, cellLength(detail.text) - (plainLength() - width)));
	}
	while (plainLength() > width) {
		const name = parts[0];
		if (!name || cellLength(name.text) <= 2) break;
		name.text = clipText(name.text, Math.max(2, cellLength(name.text) - (plainLength() - width)));
	}
	// Hard invariant below the design minimums: shrink the detail to one cell,
	// then the name, then drop the detail so the @name + status core fits.
	while (plainLength() > width) {
		const detail = parts.find((part) => (part.role === 'detail' || part.role === 'error') && cellLength(part.text) > 1);
		if (!detail) break;
		detail.text = clipText(detail.text, Math.max(1, cellLength(detail.text) - (plainLength() - width)));
	}
	while (plainLength() > width) {
		const name = parts[0];
		if (!name || cellLength(name.text) <= 1) break;
		name.text = clipText(name.text, Math.max(1, cellLength(name.text) - (plainLength() - width)));
	}
	while (plainLength() > width) {
		const detail = parts.find((part) => part.role === 'detail' || part.role === 'error');
		if (!detail) break;
		parts.splice(parts.indexOf(detail), 1);
	}

	const segments: ContentStatusSegment[] = [];
	for (const [index, part] of parts.entries()) {
		if (index > 0) segments.push({ text: ' · ', role: 'separator' });
		segments.push({ text: part.text, role: part.role });
	}
	return segments;
}

// -----------------------------------------------------------------------------
// Composer
// -----------------------------------------------------------------------------

export interface ComposerRouteInput {
	text: string;
	selectedAgentId: string;
	knownAgentIds: readonly string[];
	mainAwaitingInput: boolean;
}

export type ComposerRoute =
	| { kind: 'repl' }
	| { kind: 'agent'; agentId: string }
	| { kind: 'reject'; reason: 'empty' | 'command_while_busy' | 'unknown_agent'; message: string };

const isCommand = (text: string): boolean => text.startsWith('/') || text === 'exit' || text === 'quit';

/**
 * Decide where a composer submission goes. Commands belong to the main REPL
 * and are only accepted while it is awaiting input; non-command text always
 * goes to the selected agent by stable id, never by name and never to a parent.
 */
export function routeComposerInput(input: ComposerRouteInput): ComposerRoute {
	const text = typeof input.text === 'string' ? input.text.trim() : '';
	if (!text) return { kind: 'reject', reason: 'empty', message: 'The message is empty.' };
	if (isCommand(text)) {
		return input.mainAwaitingInput
			? { kind: 'repl' }
			: { kind: 'reject', reason: 'command_while_busy', message: 'Commands run in the main session; wait for the current turn to finish.' };
	}
	if (!input.knownAgentIds.includes(input.selectedAgentId)) {
		return { kind: 'reject', reason: 'unknown_agent', message: `No agent with id "${input.selectedAgentId}" exists in this session.` };
	}
	if (input.selectedAgentId === MAIN_AGENT_ID) {
		return input.mainAwaitingInput ? { kind: 'repl' } : { kind: 'agent', agentId: MAIN_AGENT_ID };
	}
	return { kind: 'agent', agentId: input.selectedAgentId };
}

/** `@<name> ❯`, clipped only in the name (24/20/14 cells by terminal width). */
export function formatComposerPrefix(name: string, columns: number): string {
	const safeName = name || MAIN_AGENT_ID;
	const cap = columns >= 80 ? 24 : columns >= 60 ? 20 : 14;
	return '@' + clipText(safeName, Math.max(1, cap - 3)) + ' ❯';
}

/** `Message @<name>…`, clipped to the space left after the composer prefix. */
export function formatComposerPlaceholder(name: string, columns: number, prefixCells: number): string {
	const safeName = name || MAIN_AGENT_ID;
	const full = 'Message @' + safeName + '…';
	const available = Math.max(8, columns - 6 - prefixCells - 1);
	if ([...full].length <= available) return full;
	const room = available - 'Message @'.length;
	if (room < 2) return clipText(full, available);
	return 'Message @' + clipText(safeName, room);
}

// -----------------------------------------------------------------------------
// Keyboard reducer
// -----------------------------------------------------------------------------

export type WorkspaceKey = 'up' | 'down' | 'enter' | 'escape' | 'ctrl+x' | 'ctrl+k' | 'other';

export interface WorkspaceKeyState {
	focus: 'composer' | 'navigator';
	selectedAgentId: string;
	/** Epoch ms; set by Ctrl+X. */
	leaderArmedAt?: number;
}

export interface WorkspaceKeyResult {
	state: WorkspaceKeyState;
	action: 'none' | 'stop_all';
	consumed: boolean;
}

/**
 * Pure focus/navigation/leader decision. Navigation keys are only consumed
 * while the navigator owns focus, so they can never reach the cancellation
 * listeners; Ctrl+X Ctrl+K reports stop-all only inside the leader window.
 */
export function reduceWorkspaceKey(
	state: WorkspaceKeyState,
	key: WorkspaceKey,
	ctx: { nodes: readonly AgentTreeNode[]; now: number; leaderWindowMs?: number },
): WorkspaceKeyResult {
	const current = reconcileSelection(ctx.nodes, state.selectedAgentId);
	const base: WorkspaceKeyState = { ...state, selectedAgentId: current };
	const leaderWindowMs = ctx.leaderWindowMs ?? 1_500;

	if (key === 'ctrl+x') {
		return { state: { ...base, focus: 'navigator', leaderArmedAt: ctx.now }, action: 'none', consumed: true };
	}
	if (base.focus !== 'navigator') {
		// Composer focus never consumes navigation keys; any non-chord key
		// still disarms a stale leader state.
		return { state: { ...base, leaderArmedAt: undefined }, action: 'none', consumed: false };
	}

	switch (key) {
		case 'up':
			return {
				state: { ...base, selectedAgentId: moveAgentSelection(ctx.nodes, current, -1), leaderArmedAt: undefined },
				action: 'none',
				consumed: true,
			};
		case 'down':
			return {
				state: { ...base, selectedAgentId: moveAgentSelection(ctx.nodes, current, 1), leaderArmedAt: undefined },
				action: 'none',
				consumed: true,
			};
		case 'enter':
			return { state: { ...base, focus: 'composer', leaderArmedAt: undefined }, action: 'none', consumed: true };
		case 'escape': {
			const parent = parentAgentId(ctx.nodes, current);
			if (parent) return { state: { ...base, selectedAgentId: parent, leaderArmedAt: undefined }, action: 'none', consumed: true };
			return { state: { ...base, focus: 'composer', leaderArmedAt: undefined }, action: 'none', consumed: true };
		}
		case 'ctrl+k': {
			const armed = base.leaderArmedAt !== undefined && ctx.now - base.leaderArmedAt >= 0 && ctx.now - base.leaderArmedAt <= leaderWindowMs;
			return {
				state: { ...base, leaderArmedAt: undefined },
				action: armed ? 'stop_all' : 'none',
				consumed: armed,
			};
		}
		default:
			return { state: { ...base, leaderArmedAt: undefined }, action: 'none', consumed: false };
	}
}

// -----------------------------------------------------------------------------
// Sub-agent transcript -> UiEntry
// -----------------------------------------------------------------------------

function displayStatusText(text: string): string {
	const [word = '', ...rest] = text.split(' ');
	const label = STATUS_LABEL[word as WorkspaceStatus];
	return [label ?? word, ...rest].join(' ');
}

/**
 * Map one agent's stored transcript to the TUI's generic entries. Labels are
 * agent-specific (`❯ You → @name`, `⏺ name`); tool results become success /
 * error lines with dim continuation output. Never mixes in another agent.
 */
export function transcriptToUiEntries(entries: readonly AgentTranscriptEntry[], agentName: string): UiEntry[] {
	const mapped: UiEntry[] = [];
	let nextId = 1;
	const push = (kind: UiEntry['kind'], content: string, extra: Partial<UiEntry> = {}): void => {
		mapped.push({ id: nextId++, kind, content, ...extra });
	};

	for (const entry of entries) {
		switch (entry.kind) {
			case 'user':
				push('user', entry.text, { agentLabel: agentName });
				break;
			case 'assistant':
				push('markdown', entry.text, { streaming: entry.streaming, agentLabel: agentName });
				break;
			case 'tool': {
				const tool = entry.tool;
				if (!tool) {
					push('tool', '● ' + entry.text);
					break;
				}
				push('tool', '● ' + tool.name + (tool.args ? '(' + tool.args + ')' : ''));
				if (tool.state === 'running' || tool.result === undefined) break;
				const lines = tool.result.split(/\r?\n/);
				let start = 0;
				while (start < lines.length && !lines[start]!.trim()) start++;
				if (start >= lines.length) break;
				const ok = tool.state === 'ok';
				push(ok ? 'success' : 'error', '⎿ ' + (ok ? '✓' : '✗') + ' ' + lines[start]!.trim());
				for (let index = start + 1; index < lines.length; index++) push('dim', '     ' + lines[index]);
				break;
			}
			case 'status':
				push('dim', '— ' + displayStatusText(entry.text));
				break;
			case 'error':
				push('error', '✗ ' + firstLine(entry.text).trim());
				break;
			case 'truncated':
				push('dim', '— ' + entry.text);
				break;
		}
	}
	return mapped;
}
