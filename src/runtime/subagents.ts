// =============================================================================
// Sub-agent registry — the single source of truth for delegated agent runs.
//
// runDelegatedAgent() reports what it does here; the /subagents command and
// the live monitor only read from it and react to its events. Nothing in this
// module can start, stop or alter a run, so no view can interrupt one.
// =============================================================================

export type SubAgentStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';

export interface SubAgentToolCall {
	name: string;
	/** Short, single-line summary of the arguments (path, command, pattern…). */
	args: string;
	startedAt: number;
	endedAt?: number;
	ok?: boolean;
	/** Short single-line result or error. */
	result?: string;
}

export interface SubAgentActivity {
	id: string;
	/** User turn (run) this sub-agent was spawned in. */
	runId: number;
	agent: string;
	task: string;
	status: SubAgentStatus;
	/** What it is doing right now, e.g. "waiting for the model". */
	activity: string;
	step: number;
	budget: number;
	startedAt: number;
	endedAt?: number;
	/** Most recent tool calls, oldest first; an entry without endedAt is executing now. */
	tools: SubAgentToolCall[];
	/** Narration the sub-agent emitted between tool calls, oldest first. */
	progress: string[];
	output?: string;
	error?: string;
}

export type SubAgentEventType = 'run' | 'spawned' | 'activity' | 'tool-start' | 'tool-end' | 'progress' | 'waiting' | 'finished';

export interface SubAgentEvent {
	type: SubAgentEventType;
	/** Absent for 'run'. */
	id?: string;
}

const MAX_TOOLS = 40;
const MAX_PROGRESS = 40;
const MAX_OUTPUT = 20_000;

const activities = new Map<string, SubAgentActivity>();
const listeners = new Set<(event: SubAgentEvent) => void>();
let currentRun = 0;

const oneLine = (text: string, max: number): string => {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length <= max ? flat : flat.slice(0, max - 1) + '…';
};

function emit(event: SubAgentEvent): void {
	for (const listener of [...listeners]) {
		try {
			listener(event);
		} catch {
			// A broken view must never break (or even slow) a running agent.
		}
	}
}

/** Subscribe to every state change. Returns the unsubscribe function. */
export function subscribeSubAgents(listener: (event: SubAgentEvent) => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** A new user turn starts: the monitor shows only this turn's sub-agents. */
export function beginSubAgentRun(): number {
	currentRun += 1;
	emit({ type: 'run' });
	return currentRun;
}

export function listSubAgents(): SubAgentActivity[] {
	return [...activities.values()];
}

export function listRunSubAgents(): SubAgentActivity[] {
	return [...activities.values()].filter((activity) => activity.runId === currentRun);
}

/** Look up by activity id, or (latest first) by agent name. */
export function getSubAgent(idOrAgent: string): SubAgentActivity | undefined {
	const byId = activities.get(idOrAgent);
	if (byId) return byId;
	return [...activities.values()].reverse().find((activity) => activity.agent === idOrAgent);
}

/** Register a spawned sub-agent and its task. Returns the id to report further events under. */
export function spawnSubAgent(requestId: string, agent: string, task: string, budget = 0): string {
	const base = requestId.slice(0, 12) || 'agent';
	let id = base;
	for (let n = 2; activities.has(id); n++) id = `${base}-${n}`;
	activities.set(id, {
		id,
		runId: currentRun,
		agent,
		task,
		status: 'running',
		activity: 'starting',
		step: 0,
		budget,
		startedAt: Date.now(),
		tools: [],
		progress: [],
	});
	emit({ type: 'spawned', id });
	return id;
}

/** Live (unfinished) record, or undefined once it has ended or never existed. */
function live(id: string): SubAgentActivity | undefined {
	const activity = activities.get(id);
	return activity && (activity.status === 'running' || activity.status === 'waiting') ? activity : undefined;
}

export function setSubAgentActivity(id: string, text: string, step?: number): void {
	const activity = live(id);
	if (!activity) return;
	activity.activity = oneLine(text, 160);
	if (step !== undefined) activity.step = step;
	emit({ type: 'activity', id });
}

export function startSubAgentTool(id: string, name: string, args: string): void {
	const activity = live(id);
	if (!activity) return;
	activity.tools.push({ name, args: name === 'bash:execute' ? args : oneLine(args, 160), startedAt: Date.now() });
	if (activity.tools.length > MAX_TOOLS) activity.tools.splice(0, activity.tools.length - MAX_TOOLS);
	activity.activity = oneLine(`${name} ${args}`, 160);
	emit({ type: 'tool-start', id });
}

export function endSubAgentTool(id: string, ok: boolean, result: string): void {
	const activity = live(id);
	if (!activity) return;
	const call = [...activity.tools].reverse().find((tool) => tool.endedAt === undefined);
	if (!call) return;
	call.endedAt = Date.now();
	call.ok = ok;
	call.result = oneLine(result, 240);
	emit({ type: 'tool-end', id });
}

export function addSubAgentProgress(id: string, text: string): void {
	const activity = live(id);
	const line = oneLine(text, 400);
	if (!activity || !line) return;
	activity.progress.push(line);
	if (activity.progress.length > MAX_PROGRESS) activity.progress.splice(0, activity.progress.length - MAX_PROGRESS);
	emit({ type: 'progress', id });
}

/** The sub-agent is blocked on the user (approval prompt) rather than working. */
export function setSubAgentWaiting(id: string, waiting: boolean): void {
	const activity = live(id);
	if (!activity) return;
	activity.status = waiting ? 'waiting' : 'running';
	if (waiting) activity.activity = 'waiting for your approval';
	emit({ type: 'waiting', id });
}

export function finishSubAgent(id: string, status: 'completed' | 'failed' | 'cancelled', detail?: string): void {
	const activity = live(id);
	if (!activity) return;
	const now = Date.now();
	for (const tool of activity.tools) {
		if (tool.endedAt === undefined) {
			tool.endedAt = now;
			tool.ok = false;
			tool.result = 'interrupted';
		}
	}
	activity.status = status;
	activity.endedAt = now;
	activity.activity = status === 'completed' ? 'done' : status;
	if (status === 'completed') activity.output = detail?.slice(0, MAX_OUTPUT);
	else if (detail) activity.error = detail.slice(0, MAX_OUTPUT);
	emit({ type: 'finished', id });
}

/** Forget everything (tests only). */
export function resetSubAgents(): void {
	activities.clear();
	listeners.clear();
	currentRun = 0;
}
