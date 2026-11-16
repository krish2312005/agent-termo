import { describe, it, expect } from 'vitest';
import { finishTaskState, isTransientError } from '../../src/main.js';

describe('task resumability', () => {
	it('keeps an interrupted task resumable instead of marking it idle', () => {
		const state = { goal: 'build the site', status: 'interrupted' as const, reason: 'Connection error.', lastActions: ['bash:execute mkdir ok'] };
		finishTaskState(state);
		expect(state.status).toBe('interrupted');
		expect(state.reason).toBe('Connection error.');
	});

	it('marks a completed running task idle', () => {
		const state = { goal: 'build the site', status: 'running' as const, reason: '', lastActions: [] };
		finishTaskState(state);
		expect(state.status).toBe('idle');
		expect(state.reason).toBe('');
	});

	it('treats a bare "Connection error." as transient', () => {
		expect(isTransientError(new Error('Connection error.'))).toBe(true);
		expect(isTransientError(new Error('401 invalid api key'))).toBe(false);
	});
});
