// =============================================================================
// Per-agent transcripts — append-only, bounded event stores.
//
// The reducer is pure: same entries + same event produce the same result, and
// every entry belongs to exactly one agent id. The store keeps a snapshot per
// agent and notifies subscribers, so the UI can mount or switch late without
// losing history. No I/O and no UI imports.
// =============================================================================

import type { WorkspaceStatus } from './agent-tree.js';

export type AgentTranscriptEvent =
	| { type: 'user'; agentId: string; text: string; at: number }
	| { type: 'assistant.start'; agentId: string; messageId: string; at: number }
	| { type: 'assistant.delta'; agentId: string; messageId: string; text: string; at: number }
	| { type: 'assistant.end'; agentId: string; messageId: string; finalText?: string; at: number }
	| { type: 'tool.start'; agentId: string; callId: string; name: string; args: string; at: number }
	| { type: 'tool.end'; agentId: string; callId: string; ok: boolean; result?: string; at: number }
	| { type: 'status'; agentId: string; status: WorkspaceStatus; detail?: string; at: number }
	| { type: 'error'; agentId: string; message: string; at: number };

export type AgentTranscriptEntryKind = 'user' | 'assistant' | 'tool' | 'status' | 'error' | 'truncated';

export interface AgentTranscriptEntry {
	/** Unique within the store. */
	id: string;
	agentId: string;
	kind: AgentTranscriptEntryKind;
	/** Epoch ms. */
	at: number;
	/** user/assistant/status/error text; tool summary. */
	text: string;
	/** Assistant only. */
	streaming?: boolean;
	/** Assistant correlation. */
	messageId?: string;
	tool?: {
		callId: string;
		name: string;
		/** One-line meaningful args summary. */
		args: string;
		state: 'running' | 'ok' | 'failed';
		/** Capped output/error. */
		result?: string;
		startedAt: number;
		endedAt?: number;
	};
}

export const MAX_TRANSCRIPT_ENTRIES = 500;
/** Chars per entry. */
export const MAX_TRANSCRIPT_TEXT = 8_000;
export const MAX_TRANSCRIPT_BYTES_PER_AGENT = 256 * 1024;

const clip = (text: string, max = MAX_TRANSCRIPT_TEXT): string =>
	text.length <= max ? text : text.slice(0, Math.max(0, max - 1)) + '…';

const entryBytes = (entry: AgentTranscriptEntry): number =>
	Buffer.byteLength(entry.text, 'utf8') +
	(entry.tool ? Buffer.byteLength(entry.tool.args, 'utf8') + Buffer.byteLength(entry.tool.result ?? '', 'utf8') : 0);

const totalBytes = (entries: readonly AgentTranscriptEntry[]): number =>
	entries.reduce((sum, entry) => sum + entryBytes(entry), 0);

/** Per-agent monotonic entry id, derived from the current snapshot so the reducer stays pure. */
function nextEntryId(agentId: string, entries: readonly AgentTranscriptEntry[]): string {
	let max = 0;
	for (const entry of entries) {
		const match = /^(\d+):/.exec(entry.id);
		if (match) max = Math.max(max, Number(match[1]));
	}
	return `${max + 1}:${agentId}`;
}

function replaceEntry(entries: readonly AgentTranscriptEntry[], index: number, patch: Partial<AgentTranscriptEntry>): AgentTranscriptEntry[] {
	const next = [...entries];
	next[index] = { ...next[index]!, ...patch };
	return next;
}

function findAssistant(entries: readonly AgentTranscriptEntry[], agentId: string, messageId: string): number {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index]!;
		if (entry.kind === 'assistant' && entry.agentId === agentId && entry.messageId === messageId) return index;
	}
	return -1;
}

/** Enforce the entry-count and byte caps, keeping one `truncated` marker at the top. */
function clampTranscript(entries: AgentTranscriptEntry[], agentId: string, at: number): AgentTranscriptEntry[] {
	if (entries.length <= 1 && totalBytes(entries) <= MAX_TRANSCRIPT_BYTES_PER_AGENT) return entries;
	let result = entries;
	let dropped = false;
	const hasMarker = (): boolean => result[0]?.kind === 'truncated';
	const limit = (): number => MAX_TRANSCRIPT_ENTRIES - (hasMarker() ? 0 : 1);
	while (result.length > limit() || (result.length > 1 && totalBytes(result) > MAX_TRANSCRIPT_BYTES_PER_AGENT)) {
		const index = hasMarker() ? 1 : 0;
		result = result.filter((_, position) => position !== index);
		dropped = true;
		if (result.length <= 1) break;
	}
	if (dropped && !hasMarker()) {
		const marker: AgentTranscriptEntry = {
			id: nextEntryId(agentId, result),
			agentId,
			kind: 'truncated',
			at,
			text: `Older activity was dropped (transcript limit: ${MAX_TRANSCRIPT_ENTRIES} entries / ${Math.round(MAX_TRANSCRIPT_BYTES_PER_AGENT / 1024)} KiB).`,
		};
		result = [marker, ...result].slice(-MAX_TRANSCRIPT_ENTRIES);
	}
	return result;
}

const statusText = (status: WorkspaceStatus, detail?: string): string => (detail ? `${status} · ${detail}` : status);

export function applyTranscriptEvent(
	entries: readonly AgentTranscriptEntry[],
	event: AgentTranscriptEvent,
): AgentTranscriptEntry[] {
	let next: AgentTranscriptEntry[] = [...entries];
	switch (event.type) {
		case 'user':
			next = [...entries, {
				id: nextEntryId(event.agentId, entries),
				agentId: event.agentId,
				kind: 'user',
				at: event.at,
				text: clip(event.text),
			}];
			break;
		case 'assistant.start':
			next = [...entries, {
				id: nextEntryId(event.agentId, entries),
				agentId: event.agentId,
				kind: 'assistant',
				at: event.at,
				text: '',
				streaming: true,
				messageId: event.messageId,
			}];
			break;
		case 'assistant.delta': {
			const index = findAssistant(entries, event.agentId, event.messageId);
			if (index < 0) return [...entries];
			const current = entries[index]!;
			const raw = current.text.length >= MAX_TRANSCRIPT_TEXT ? current.text : current.text + event.text;
			next = replaceEntry(entries, index, { text: clip(raw) });
			break;
		}
		case 'assistant.end': {
			const index = findAssistant(entries, event.agentId, event.messageId);
			if (index < 0) return [...entries];
			const current = entries[index]!;
			const text = event.finalText !== undefined ? clip(event.finalText) : current.text;
			// A tool-call-only or empty response must not leave a blank assistant entry.
			next = text.trim()
				? replaceEntry(entries, index, { streaming: false, text })
				: entries.filter((_, position) => position !== index);
			break;
		}
		case 'tool.start':
			next = [...entries, {
				id: nextEntryId(event.agentId, entries),
				agentId: event.agentId,
				kind: 'tool',
				at: event.at,
				text: clip(event.name + (event.args ? `(${event.args})` : '')),
				tool: {
					callId: event.callId,
					name: event.name,
					args: clip(event.args),
					state: 'running',
					startedAt: event.at,
				},
			}];
			break;
		case 'tool.end': {
			const index = entries.findIndex((entry) =>
				entry.kind === 'tool' && entry.agentId === event.agentId && entry.tool?.callId === event.callId);
			if (index < 0) return [...entries];
			const tool = entries[index]!.tool!;
			next = replaceEntry(entries, index, {
				tool: {
					...tool,
					state: event.ok ? 'ok' : 'failed',
					...(event.result !== undefined ? { result: clip(event.result) } : {}),
					endedAt: event.at,
				},
			});
			break;
		}
		case 'status': {
			const text = statusText(event.status, event.detail);
			for (let index = entries.length - 1; index >= 0; index--) {
				const entry = entries[index]!;
				if (entry.kind !== 'status' || entry.agentId !== event.agentId) continue;
				if (entry.text === text) return [...entries];
				break;
			}
			next = [...entries, {
				id: nextEntryId(event.agentId, entries),
				agentId: event.agentId,
				kind: 'status',
				at: event.at,
				text: clip(text),
			}];
			break;
		}
		case 'error': {
			// An error finalizes any assistant message left streaming by the failure.
			let working = [...entries];
			for (let index = 0; index < working.length; index++) {
				const entry = working[index]!;
				if (entry.kind === 'assistant' && entry.agentId === event.agentId && entry.streaming) {
					working = replaceEntry(working, index, { streaming: false });
				}
			}
			next = [...working, {
				id: nextEntryId(event.agentId, working),
				agentId: event.agentId,
				kind: 'error',
				at: event.at,
				text: clip(event.message),
			}];
			break;
		}
	}
	return clampTranscript(next, event.agentId, event.at);
}

const oneLine = (text: string, max: number): string => {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length <= max ? flat : flat.slice(0, max - 1) + '…';
};

/** One-line meaningful args summary for a tool transcript entry. */
export function summarizeToolArgs(name: string, args: Record<string, unknown>): string {
	const value = (keys: string[]): string => {
		for (const key of keys) {
			const candidate = args[key];
			if (typeof candidate === 'string' && candidate.trim()) return candidate;
			if (typeof candidate === 'number' || typeof candidate === 'boolean') return String(candidate);
		}
		return '';
	};
	const pick = (keys: string[], max = 160): string => oneLine(value(keys), max);
	switch (name) {
		case 'bash:execute':
		case 'bash:start':
			return pick(['command']);
		case 'file:read':
		case 'file:write':
		case 'file:edit':
		case 'file:delete':
		case 'skill:read':
			return pick(['path', 'name']);
		case 'file:glob':
			return [pick(['pattern', 'glob']), pick(['path'])].filter(Boolean).join(' in ');
		case 'grep':
			return [pick(['pattern']), pick(['path', 'glob'], 120)].filter(Boolean).join(' in ');
		case 'agent:delegate':
			return [pick(['agent'], 40), pick(['task'], 120)].filter(Boolean).join(': ');
		default: {
			const summary = pick(['path', 'command', 'pattern', 'query', 'url', 'task', 'message', 'name', 'id']);
			if (summary) return summary;
			try {
				return oneLine(JSON.stringify(args ?? {}), 120);
			} catch {
				return '';
			}
		}
	}
}

export interface AgentTranscriptStore {
	append(event: AgentTranscriptEvent): void;
	get(agentId: string): readonly AgentTranscriptEntry[];
	subscribe(listener: (agentId: string) => void): () => void;
	clearAgent(agentId: string): void;
	clearAll(): void;
}

export function createAgentTranscriptStore(): AgentTranscriptStore {
	const byAgent = new Map<string, AgentTranscriptEntry[]>();
	const listeners = new Set<(agentId: string) => void>();

	const notify = (agentId: string): void => {
		for (const listener of [...listeners]) {
			try {
				listener(agentId);
			} catch {
				// A broken view must never break the runtime.
			}
		}
	};

	return {
		append(event: AgentTranscriptEvent): void {
			const current = byAgent.get(event.agentId) ?? [];
			byAgent.set(event.agentId, applyTranscriptEvent(current, event));
			notify(event.agentId);
		},
		get(agentId: string): readonly AgentTranscriptEntry[] {
			return [...(byAgent.get(agentId) ?? [])];
		},
		subscribe(listener: (agentId: string) => void): () => void {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		clearAgent(agentId: string): void {
			if (!byAgent.delete(agentId)) return;
			notify(agentId);
		},
		clearAll(): void {
			const ids = [...byAgent.keys()];
			byAgent.clear();
			for (const id of ids) notify(id);
		},
	};
}

/** Default instance used by the runtime and the UI. */
export const agentTranscripts: AgentTranscriptStore = createAgentTranscriptStore();
