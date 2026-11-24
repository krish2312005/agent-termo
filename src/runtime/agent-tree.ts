// =============================================================================
// Agent tree — pure derivation of the workspace hierarchy from the registry.
//
// The tree is never stored: it is rebuilt from MainAgentState + the sub-agent
// registry on every read. No I/O and no UI imports, so the navigator and tests
// share exactly one source of truth.
// =============================================================================

import type { SubAgentActivity } from './subagents.js';
import { MAIN_AGENT_ID } from './subagents.js';
import type { TokenUsage } from '../types/index.js';

export type WorkspaceStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'failed' | 'stopped';

export interface MainAgentState {
	status: 'idle' | 'running' | 'waiting';
	/** Single line, e.g. "waiting for your approval". */
	activity: string;
	/** The /agent prompt currently active, if any. */
	activeAgentName?: string;
	/** taskState.goal */
	goal?: string;
	/** nimClient.getUsage() */
	usage?: TokenUsage;
	/** Queued main messages (0..10). */
	queued: number;
	/** Session start, epoch ms. */
	startedAt: number;
}

export interface AgentTreeNode {
	id: string;
	/** 'main' or the sub-agent display name. */
	name: string;
	kind: 'main' | 'subagent';
	parentId: string | null;
	/** main = 0. */
	depth: number;
	status: WorkspaceStatus;
	activity: string;
	task: string;
	/** Sub-agent error, first line only. */
	error?: string;
	startedAt: number;
	endedAt?: number;
	usage?: TokenUsage;
	childCount: number;
	/** Direct children with status running|waiting. */
	activeChildCount: number;
	queued: number;
	/** A sibling has the same display name. */
	duplicateName: boolean;
}

/** Map the registry's legacy `cancelled` onto the workspace vocabulary. */
export function workspaceStatusOf(status: SubAgentActivity['status']): WorkspaceStatus {
	return status === 'cancelled' ? 'stopped' : status;
}

const firstLine = (text: string): string => text.split(/\r?\n/, 1)[0] ?? '';

/**
 * Resolve the direct parent used by the tree. Missing parents and self-links
 * attach to main; a parent chain that never reaches main is treated as a cycle
 * and also attaches to main, so the builder can never loop.
 */
function resolveParentId(sub: SubAgentActivity, byId: ReadonlyMap<string, SubAgentActivity>): string {
	const parent = sub.parentId;
	if (!parent || parent === sub.id || parent === MAIN_AGENT_ID) return MAIN_AGENT_ID;
	if (!byId.has(parent)) return MAIN_AGENT_ID;
	const seen = new Set<string>([sub.id]);
	let current: SubAgentActivity | undefined = byId.get(parent);
	for (let steps = 0; current && steps <= byId.size; steps++) {
		if (seen.has(current.id)) return MAIN_AGENT_ID;
		seen.add(current.id);
		if (!current.parentId || current.parentId === MAIN_AGENT_ID) return parent;
		current = byId.get(current.parentId);
	}
	return MAIN_AGENT_ID;
}

function depthOf(id: string, parentOf: ReadonlyMap<string, string>): number {
	let depth = 0;
	const seen = new Set<string>([id]);
	let current = parentOf.get(id);
	while (current && current !== MAIN_AGENT_ID && !seen.has(current)) {
		seen.add(current);
		depth++;
		current = parentOf.get(current);
	}
	return depth + 1;
}

/** DFS pre-order: main, then each child subtree sorted by (startedAt, id). Orphans attach to main. */
export function buildAgentTree(main: MainAgentState, subagents: readonly SubAgentActivity[]): AgentTreeNode[] {
	const byId = new Map(subagents.map((sub) => [sub.id, sub]));
	const parentOf = new Map<string, string>();
	for (const sub of subagents) parentOf.set(sub.id, resolveParentId(sub, byId));

	const childrenOf = new Map<string, SubAgentActivity[]>();
	for (const sub of subagents) {
		const parent = parentOf.get(sub.id) ?? MAIN_AGENT_ID;
		const siblings = childrenOf.get(parent) ?? [];
		siblings.push(sub);
		childrenOf.set(parent, siblings);
	}
	for (const siblings of childrenOf.values()) {
		siblings.sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	}

	// Duplicate display names only matter between siblings.
	const duplicate = new Set<string>();
	for (const siblings of childrenOf.values()) {
		const counts = new Map<string, number>();
		for (const sibling of siblings) counts.set(sibling.agent, (counts.get(sibling.agent) ?? 0) + 1);
		for (const sibling of siblings) if ((counts.get(sibling.agent) ?? 0) > 1) duplicate.add(sibling.id);
	}

	const nodes: AgentTreeNode[] = [];
	const seen = new Set<string>();
	const visit = (id: string): void => {
		if (seen.has(id)) return;
		seen.add(id);
		const sub = byId.get(id);
		const kids = childrenOf.get(id) ?? [];
		const activeKids = kids.filter((kid) => kid.status === 'running' || kid.status === 'waiting').length;
		if (sub) {
			nodes.push({
				id: sub.id,
				name: sub.agent,
				kind: 'subagent',
				parentId: parentOf.get(sub.id) ?? MAIN_AGENT_ID,
				depth: depthOf(sub.id, parentOf),
				status: workspaceStatusOf(sub.status),
				activity: sub.activity,
				task: sub.task,
				error: sub.error ? firstLine(sub.error) : undefined,
				startedAt: sub.startedAt,
				endedAt: sub.endedAt,
				usage: sub.usage,
				childCount: kids.length,
				activeChildCount: activeKids,
				queued: sub.queued,
				duplicateName: duplicate.has(sub.id),
			});
		} else {
			nodes.push({
				id: MAIN_AGENT_ID,
				name: MAIN_AGENT_ID,
				kind: 'main',
				parentId: null,
				depth: 0,
				status: main.status,
				activity: main.activity,
				task: main.goal ?? '',
				startedAt: main.startedAt,
				usage: main.usage,
				childCount: kids.length,
				activeChildCount: activeKids,
				queued: main.queued,
				duplicateName: false,
			});
		}
		for (const kid of kids) visit(kid.id);
	};
	visit(MAIN_AGENT_ID);
	return nodes;
}

/** Clamped, no wrap. Unknown current id -> main. */
export function moveAgentSelection(nodes: readonly AgentTreeNode[], selectedId: string, delta: -1 | 1): string {
	if (nodes.length === 0) return MAIN_AGENT_ID;
	const index = nodes.findIndex((node) => node.id === selectedId);
	if (index < 0) return MAIN_AGENT_ID;
	const next = Math.max(0, Math.min(nodes.length - 1, index + delta));
	return nodes[next]!.id;
}

export function parentAgentId(nodes: readonly AgentTreeNode[], id: string): string | null {
	return nodes.find((node) => node.id === id)?.parentId ?? null;
}

export function reconcileSelection(nodes: readonly AgentTreeNode[], selectedId: string): string {
	return nodes.some((node) => node.id === selectedId) ? selectedId : MAIN_AGENT_ID;
}

/** Window of at most `maxRows` rows that always contains the selected row. */
export function visibleAgentRows(
	nodes: readonly AgentTreeNode[],
	selectedId: string,
	maxRows: number,
): { rows: AgentTreeNode[]; hiddenAbove: number; hiddenBelow: number } {
	if (nodes.length === 0) return { rows: [], hiddenAbove: 0, hiddenBelow: 0 };
	const limit = Math.max(1, Math.min(nodes.length, Math.floor(maxRows) || 1));
	if (nodes.length <= limit) return { rows: [...nodes], hiddenAbove: 0, hiddenBelow: 0 };
	const index = Math.max(0, nodes.findIndex((node) => node.id === selectedId));
	const start = Math.max(0, Math.min(nodes.length - limit, index - Math.floor((limit - 1) / 2)));
	return {
		rows: nodes.slice(start, start + limit),
		hiddenAbove: start,
		hiddenBelow: nodes.length - start - limit,
	};
}
