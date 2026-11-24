// =============================================================================
// Agent workspace — handles, main state, message dispatch, stop-all, reset.
//
// Routing is strictly by stable id. Unknown ids are rejected; nothing is ever
// redirected to a parent or to the selected agent. A message is decided
// synchronously by the pure `decideMessageDisposition`, so the UI can update
// immediately without waiting for a model turn.
//
// Queue ownership: main's queue lives here (the REPL drains it with
// takeQueuedMainMessage); a sub-agent's FIFO queue lives in its session record
// and its length is mirrored into the registry by the handle.
// =============================================================================

import type { MainAgentState, WorkspaceStatus } from './agent-tree.js';
import { agentTranscripts } from './agent-transcript.js';
import { resetAgentSelection } from './agent-selection.js';
import {
	MAIN_AGENT_ID,
	clearSubAgentActivity,
	getSubAgent,
	subscribeSubAgents,
} from './subagents.js';

export { MAIN_AGENT_ID } from './subagents.js';

export const MAX_QUEUED_MESSAGES_PER_AGENT = 10;

/** A dispatched-then-dispatched-again message is a duplicate inside this window. */
const DUPLICATE_DISPATCH_WINDOW_MS = 2_000;

export type AgentMessageResult =
	| { ok: true; disposition: 'dispatched' | 'queued'; queueLength: number }
	| { ok: false; reason: 'unknown_agent' | 'empty' | 'duplicate' | 'queue_full' | 'unavailable'; message: string };

export interface AgentHandle {
	readonly id: string;
	readonly kind: 'subagent';
	status(): WorkspaceStatus;
	/** Same semantics as sendAgentMessage. */
	send(text: string): AgentMessageResult;
	cancel(): void;
}

/** Main is built in: the workspace owns its state, queue and duplicate window; the REPL supplies only the I/O. */
export interface MainAgentBindings {
	/** Resolve a pending `input.question()` with this text; false when none is pending. */
	submitExternal(text: string): boolean;
	/** nimClient.cancelCurrentRequest() */
	cancel(): void;
}

export interface MessageTarget {
	id: string;
	/** Display name used in rejection messages. */
	name: string;
	kind: 'main' | 'subagent';
	status: WorkspaceStatus;
}

export interface MessageDispositionInput {
	/** Requested id; reported verbatim when the target is unknown. */
	agentId: string;
	/** Registered target, or null when nothing with this id exists. */
	target: MessageTarget | null;
	text: string;
	/** Current FIFO queue length for the target. */
	queueLength: number;
	/** Exact texts already waiting in the target's queue, when the caller knows them. */
	queuedTexts?: readonly string[];
	/** Epoch ms when this exact trimmed text was last dispatched to this agent. */
	lastDispatchAt?: number;
	now: number;
}

export type MessageDisposition =
	| { disposition: 'dispatch' | 'queue' }
	| { disposition: 'reject'; reason: 'unknown_agent' | 'empty' | 'duplicate' | 'queue_full'; message: string };

/** Pure routing policy. No I/O, no fallback: an unknown id is always a rejection. */
export function decideMessageDisposition(input: MessageDispositionInput): MessageDisposition {
	const text = typeof input.text === 'string' ? input.text.trim() : '';
	if (!text) return { disposition: 'reject', reason: 'empty', message: 'The message is empty.' };
	const target = input.target;
	if (!target) {
		return { disposition: 'reject', reason: 'unknown_agent', message: `No agent with id "${input.agentId}" exists in this session.` };
	}
	const duplicateQueued = input.queuedTexts?.some((queued) => queued.trim() === text) === true;
	const duplicateRecent = input.lastDispatchAt !== undefined && input.now - input.lastDispatchAt < DUPLICATE_DISPATCH_WINDOW_MS;
	if (duplicateQueued || duplicateRecent) {
		return { disposition: 'reject', reason: 'duplicate', message: `@${target.name} already received this message; wait for it to finish.` };
	}
	if (target.status === 'running' || target.status === 'waiting') {
		if (input.queueLength >= MAX_QUEUED_MESSAGES_PER_AGENT) {
			return {
				disposition: 'reject',
				reason: 'queue_full',
				message: `@${target.name} already has ${MAX_QUEUED_MESSAGES_PER_AGENT} queued messages; wait for the current turn to finish.`,
			};
		}
		return { disposition: 'queue' };
	}
	return { disposition: 'dispatch' };
}

export interface AgentWorkspace {
	registerMainAgent(bindings: MainAgentBindings): () => void;
	registerHandle(handle: AgentHandle): () => void;
	send(agentId: string, text: string): AgentMessageResult;
	getMainState(): MainAgentState;
	/** `queued`/`startedAt` are workspace-owned. */
	setMainState(patch: Partial<Pick<MainAgentState, 'status' | 'activity' | 'activeAgentName' | 'goal' | 'usage'>>): void;
	/** FIFO; decrements queued. */
	takeQueuedMainMessage(): string | undefined;
	/** Main state + registry events. */
	subscribe(listener: () => void): () => void;
	/** Cancellation requests issued. */
	stopAll(): number;
	/** Cancel + clear registry/transcripts/main queue. */
	reset(): void;
}

const freshMainState = (): MainAgentState => ({
	status: 'idle',
	activity: 'ready',
	queued: 0,
	startedAt: Date.now(),
});

export function createAgentWorkspace(): AgentWorkspace {
	const handles = new Map<string, AgentHandle>();
	const listeners = new Set<() => void>();
	const mainQueue: string[] = [];
	const lastDispatch = new Map<string, { text: string; at: number }>();
	let mainBindings: MainAgentBindings | null = null;
	let mainState = freshMainState();

	const notify = (): void => {
		for (const listener of [...listeners]) {
			try {
				listener();
			} catch {
				// A broken view must never break dispatch.
			}
		}
	};
	// Registry-only changes (activity, status, usage, queue) still need a UI bump.
	subscribeSubAgents(() => notify());

	const send = (agentId: string, text: string): AgentMessageResult => {
		const isMain = agentId === MAIN_AGENT_ID;
		const handle = isMain ? undefined : handles.get(agentId);
		if (!isMain && !handle) {
			return { ok: false, reason: 'unknown_agent', message: `No agent with id "${agentId}" exists in this session.` };
		}
		if (isMain && !mainBindings) {
			return { ok: false, reason: 'unavailable', message: 'The main agent is not accepting messages in this session.' };
		}
		const trimmed = typeof text === 'string' ? text.trim() : '';
		const activity = isMain ? undefined : getSubAgent(agentId);
		const name = isMain ? MAIN_AGENT_ID : activity?.agent ?? handle!.id;
		const previous = lastDispatch.get(agentId);
		const decision = decideMessageDisposition({
			agentId,
			target: { id: agentId, name, kind: isMain ? 'main' : 'subagent', status: isMain ? mainState.status : handle!.status() },
			text: trimmed,
			queueLength: isMain ? mainQueue.length : activity?.queued ?? 0,
			queuedTexts: isMain ? mainQueue : undefined,
			lastDispatchAt: previous && previous.text === trimmed ? previous.at : undefined,
			now: Date.now(),
		});
		if (decision.disposition === 'reject') {
			return { ok: false, reason: decision.reason, message: decision.message };
		}
		lastDispatch.set(agentId, { text: trimmed, at: Date.now() });
		if (isMain) {
			if (decision.disposition === 'dispatch' && mainBindings!.submitExternal(trimmed)) {
				return { ok: true, disposition: 'dispatched', queueLength: mainQueue.length };
			}
			// No pending question: the REPL drains this at its next loop top.
			mainQueue.push(trimmed);
			mainState = { ...mainState, queued: mainQueue.length };
			notify();
			return { ok: true, disposition: 'queued', queueLength: mainQueue.length };
		}
		// The session handle owns its FIFO queue and re-checks duplicate/queue-full against it.
		return handle!.send(trimmed);
	};

	const stopAll = (): number => {
		let requests = 0;
		const wasLive = mainState.status === 'running' || mainState.status === 'waiting';
		if (mainBindings) {
			try {
				mainBindings.cancel();
			} catch {
				// Cancellation is best-effort; queues are still cleared below.
			}
			if (wasLive) requests++;
		}
		for (const handle of [...handles.values()]) {
			const live = handle.status() === 'running' || handle.status() === 'waiting';
			try {
				handle.cancel();
			} catch {
				// A broken handle must not prevent the rest from stopping.
			}
			if (live) requests++;
		}
		mainQueue.length = 0;
		if (mainState.queued !== 0) mainState = { ...mainState, queued: 0 };
		notify();
		return requests;
	};

	return {
		registerMainAgent(bindings: MainAgentBindings): () => void {
			mainBindings = bindings;
			mainState = freshMainState();
			mainQueue.length = 0;
			lastDispatch.clear();
			notify();
			return () => {
				if (mainBindings !== bindings) return;
				mainBindings = null;
				notify();
			};
		},
		registerHandle(handle: AgentHandle): () => void {
			if (!handle || typeof handle.id !== 'string' || !handle.id || handle.id === MAIN_AGENT_ID) {
				return () => undefined;
			}
			handles.set(handle.id, handle);
			notify();
			return () => {
				if (handles.get(handle.id) !== handle) return;
				handles.delete(handle.id);
				notify();
			};
		},
		send,
		getMainState(): MainAgentState {
			return { ...mainState };
		},
		setMainState(
			patch: Partial<Pick<MainAgentState, 'status' | 'activity' | 'activeAgentName' | 'goal' | 'usage'>>,
		): void {
			if (!patch || typeof patch !== 'object') return;
			const next = { ...mainState };
			let changed = false;
			if (patch.status !== undefined && ['idle', 'running', 'waiting'].includes(patch.status) && patch.status !== next.status) {
				next.status = patch.status;
				changed = true;
			}
			if (patch.activity !== undefined && patch.activity !== next.activity) {
				next.activity = patch.activity;
				changed = true;
			}
			if (Object.prototype.hasOwnProperty.call(patch, 'activeAgentName') && patch.activeAgentName !== next.activeAgentName) {
				next.activeAgentName = patch.activeAgentName;
				changed = true;
			}
			if (Object.prototype.hasOwnProperty.call(patch, 'goal') && patch.goal !== next.goal) {
				next.goal = patch.goal;
				changed = true;
			}
			if (patch.usage !== undefined && patch.usage !== next.usage) {
				next.usage = patch.usage;
				changed = true;
			}
			if (!changed) return;
			mainState = next;
			notify();
		},
		takeQueuedMainMessage(): string | undefined {
			const text = mainQueue.shift();
			if (text === undefined) return undefined;
			mainState = { ...mainState, queued: mainQueue.length };
			notify();
			return text;
		},
		subscribe(listener: () => void): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		stopAll,
		reset(): void {
			stopAll();
			handles.clear();
			lastDispatch.clear();
			const startedAt = mainState.startedAt;
			mainState = { ...freshMainState(), startedAt };
			clearSubAgentActivity();
			agentTranscripts.clearAll();
			resetAgentSelection();
			notify();
		},
	};
}

/** Default instance used by the runtime and the UI. */
export const agentWorkspace: AgentWorkspace = createAgentWorkspace();

export function sendAgentMessage(agentId: string, text: string): AgentMessageResult {
	return agentWorkspace.send(agentId, text);
}

export function getMainAgentState(): MainAgentState {
	return agentWorkspace.getMainState();
}

export function setMainAgentState(
	patch: Partial<Pick<MainAgentState, 'status' | 'activity' | 'activeAgentName' | 'goal' | 'usage'>>,
): void {
	agentWorkspace.setMainState(patch);
}

export function takeQueuedMainMessage(): string | undefined {
	return agentWorkspace.takeQueuedMainMessage();
}

export function subscribeWorkspace(listener: () => void): () => void {
	return agentWorkspace.subscribe(listener);
}

export function stopAllAgents(): number {
	return agentWorkspace.stopAll();
}

/** Keeps the registered main handle. */
export function resetAgentWorkspace(): void {
	agentWorkspace.reset();
}
