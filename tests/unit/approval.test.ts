import { describe, expect, it } from 'vitest';
import { ApprovalBroker } from '../../src/runtime/approval.js';

describe('ApprovalBroker', () => {
  it('serializes concurrent prompts and releases input in order', async () => {
    const broker = new ApprovalBroker();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const first = broker.run(() => new Promise<string>((resolve) => { releaseFirst = () => resolve('first'); }),
      () => events.push('first:open'), () => events.push('first:close'));
    const second = broker.run(async () => { events.push('second:prompt'); return 'second'; },
      () => events.push('second:open'), () => events.push('second:close'));
    await Promise.resolve();
    expect(events).toEqual(['first:open']);
    releaseFirst();
    expect(await first).toBe('first');
    expect(await second).toBe('second');
    expect(events).toEqual(['first:open', 'first:close', 'second:open', 'second:prompt', 'second:close']);
  });

  it('releases the queue if a prompt throws', async () => {
    const broker = new ApprovalBroker();
    await expect(broker.run(async () => { throw new Error('prompt failed'); })).rejects.toThrow('prompt failed');
    await expect(broker.run(async () => 'next')).resolves.toBe('next');
  });
});
