import { describe, expect, it, vi } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { ProcessManager } from '../../src/runtime/process-manager.js';

describe('ProcessManager', () => {
  it('tracks concurrent invocations independently and cancels all of them', () => {
    const manager = new ProcessManager();
    const first = { pid: undefined, kill: vi.fn() } as unknown as ChildProcess;
    const second = { pid: undefined, kill: vi.fn() } as unknown as ChildProcess;

    const firstId = manager.register(first);
    const secondId = manager.register(second);
    expect(manager.size).toBe(2);
    expect(manager.kill(firstId)).toBe(true);
    expect(first.kill).toHaveBeenCalledWith('SIGKILL');
    expect(manager.size).toBe(1);
    expect(manager.killAll()).toBe(true);
    expect(second.kill).toHaveBeenCalledWith('SIGKILL');
    expect(manager.size).toBe(0);
    expect(manager.killAll()).toBe(false);
  });

  it('ignores an invocation that has already been removed', () => {
    const manager = new ProcessManager();
    expect(manager.kill('missing')).toBe(false);
  });
});
