import { describe, expect, it } from 'vitest';
import { createApprovalQueue } from '../../src/runtime/approval-queue.js';

describe('approval prompt queue', () => {
	it('serializes concurrent prompts in FIFO order', async () => {
		const run = createApprovalQueue();
		const order: string[] = [];
		let releaseFirst!: () => void;
		const first = run(async () => {
			order.push('first-start');
			await new Promise<void>((resolve) => { releaseFirst = resolve; });
			order.push('first-end');
			return 'approved';
		});
		const second = run(async () => { order.push('second-start'); return 'rejected'; });
		await Promise.resolve();
		expect(order).toEqual(['first-start']);
		releaseFirst();
		expect(await first).toBe('approved');
		expect(await second).toBe('rejected');
		expect(order).toEqual(['first-start', 'first-end', 'second-start']);
	});

	it('releases the queue after a prompt throws', async () => {
		const run = createApprovalQueue();
		await expect(run(async () => { throw new Error('prompt failed'); })).rejects.toThrow('prompt failed');
		await expect(run(async () => 'next prompt')).resolves.toBe('next prompt');
	});
});
