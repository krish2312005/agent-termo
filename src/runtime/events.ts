// =============================================================================
// Runtime event stream — typed, additive observability for the agent loop
// =============================================================================

export type AgentEvent =
	| { type: 'turn.started'; sessionId: string; turnId: string; goal: string; at: number }
	| { type: 'tool.started'; sessionId: string; turnId: string; toolCallId: string; name: string; args: Record<string, unknown>; at: number }
	| { type: 'tool.completed'; sessionId: string; turnId: string; toolCallId: string; name: string; success: boolean; at: number }
	| { type: 'usage.updated'; sessionId: string; turnId: string; usage: string; at: number }
	| { type: 'context.updated'; sessionId: string; turnId: string; usedTokens: number; budgetTokens: number; at: number }
	| { type: 'turn.completed'; sessionId: string; turnId: string; status: 'completed' | 'failed' | 'cancelled' | 'paused'; at: number };

export class AgentEventHub {
	private readonly listeners = new Set<(event: AgentEvent) => void>();

	subscribe(listener: (event: AgentEvent) => void): () => void {
		let active = true;
		this.listeners.add(listener);
		return () => {
			if (!active) return;
			active = false;
			this.listeners.delete(listener);
		};
	}

	publish(event: AgentEvent): void {
		// Iterate a snapshot so listeners adding or removing subscriptions during
		// dispatch do not affect the in-flight publish.
		for (const listener of [...this.listeners]) {
			try {
				listener(event);
			} catch {
				// A broken listener must never break the agent loop, and the TUI
				// owns the terminal, so the error is swallowed silently.
			}
		}
	}
}
