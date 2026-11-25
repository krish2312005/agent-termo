import { describe, it, expect } from 'vitest';
import { finishTaskState, getToolLoopStopReason, isTransientError, shouldClearFailedToolCalls, shouldPauseForRepeatedFailedToolCall, shouldRunDelegationsInParallel, shouldRequireInitialToolCall, shouldUseTools, withTransientRetries } from '../../src/main.js';

describe('task resumability', () => {
	it('recognizes a follow-up phrased as go ahead and fix as a tool task', () => {
		expect(shouldUseTools('go ahead and fix the issue')).toBe(true);
		expect(shouldRequireInitialToolCall('go ahead and fix the issue')).toBe(true);
	});

	it('forces tool execution for expanded custom-command prompts', () => {
		const expandedPrompt = 'Use the project-manager agent to run the fix flow for the broken buttons.';
		expect(shouldUseTools(expandedPrompt)).toBe(false);
		expect(shouldRequireInitialToolCall(expandedPrompt)).toBe(false);
		expect(shouldUseTools(expandedPrompt, '', false, false, false, true)).toBe(true);
		expect(shouldRequireInitialToolCall(expandedPrompt, true)).toBe(true);
	});
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

	it('does not impose a model-turn limit', () => {
		expect(getToolLoopStopReason(60_000)).toBeUndefined();
	});

	it('pauses a task at the wall-clock safety limit', () => {
		expect(getToolLoopStopReason(20 * 60 * 1000 + 1)).toContain('20-minute');
	});

	it('treats a bare "Connection error." as transient', () => {
		expect(isTransientError(new Error('Connection error.'))).toBe(true);
		expect(isTransientError(new Error('401 invalid api key'))).toBe(false);
	});

	it('does not retry after a stream has already emitted visible text', async () => {
		let attempts = 0;
		const partial = Object.assign(new Error('Streaming response interrupted after partial output: 503'), { retryable: false });
		await expect(withTransientRetries(async () => {
			attempts++;
			throw partial;
		}, [0, 0])).rejects.toBe(partial);
		expect(attempts).toBe(1);
	});

	it('pauses only after the retry budget for an unchanged failed call is exhausted', () => {
		const failures = new Map([['browser:verify:{}', 1]]);
		const exhausted = new Map([['browser:verify:{}', 2]]);
		expect(shouldPauseForRepeatedFailedToolCall('browser:verify:{}', new Map())).toBe(false);
		expect(shouldPauseForRepeatedFailedToolCall('browser:verify:{}', failures)).toBe(false);
		expect(shouldPauseForRepeatedFailedToolCall('browser:verify:{}', exhausted)).toBe(true);
	});

	it('clears failed-call suppression after a successful corrective operation, but not a read', () => {
		expect(shouldClearFailedToolCalls('bash:execute', true)).toBe(true);
		expect(shouldClearFailedToolCalls('file:write', true)).toBe(true);
		expect(shouldClearFailedToolCalls('file:read', true)).toBe(false);
		expect(shouldClearFailedToolCalls('git:status', true)).toBe(false);
		expect(shouldClearFailedToolCalls('bash:execute', false)).toBe(false);
	});

	it('detects independent delegation calls as a parallel fan-out', () => {
		expect(shouldRunDelegationsInParallel([
			{ id: 'a', name: 'agent:delegate', arguments: {} },
			{ id: 'b', name: 'agent:delegate', arguments: {} },
		])).toBe(true);
		expect(shouldRunDelegationsInParallel([{ id: 'a', name: 'agent:delegate', arguments: {} }])).toBe(false);
		expect(shouldRunDelegationsInParallel([
			{ id: 'a', name: 'agent:delegate', arguments: {} },
			{ id: 'b', name: 'file:read', arguments: {} },
		])).toBe(false);
	});

	it('retries transient provider failures with bounded backoff', async () => {
		let attempts = 0;
		const result = await withTransientRetries(async () => {
			attempts++;
			if (attempts < 3) throw new Error('429 rate limited');
			return 'ok';
		}, [0, 0]);
		expect(result).toBe('ok');
		expect(attempts).toBe(3);
	});
});
