// =============================================================================
// Agent selection — navigation state only.
//
// The UI is the only writer; the runtime reads the selected id to scope
// cancellation. Changing it never touches execution or the registry.
// =============================================================================

import { MAIN_AGENT_ID } from './subagents.js';

let selectedAgentId = MAIN_AGENT_ID;
const listeners = new Set<(id: string) => void>();

export function getSelectedAgentId(): string {
	return selectedAgentId;
}

export function setSelectedAgentId(id: string): void {
	if (typeof id !== 'string' || !id || id === selectedAgentId) return;
	selectedAgentId = id;
	for (const listener of [...listeners]) {
		try {
			listener(selectedAgentId);
		} catch {
			// A broken view must never break navigation.
		}
	}
}

export function subscribeAgentSelection(listener: (id: string) => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function resetAgentSelection(): void {
	setSelectedAgentId(MAIN_AGENT_ID);
}
