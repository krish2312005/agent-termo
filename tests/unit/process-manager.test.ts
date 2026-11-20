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

  it('writes to the newest active child and falls back after it is unregistered', () => {
    const manager = new ProcessManager();
    const firstStdin = { destroyed: false, writableEnded: false, writable: true, write: vi.fn(() => true) };
    const secondStdin = { destroyed: false, writableEnded: false, writable: true, write: vi.fn(() => true) };
    const first = { pid: undefined, stdin: firstStdin, kill: vi.fn() } as unknown as ChildProcess;
    const second = { pid: undefined, stdin: secondStdin, kill: vi.fn() } as unknown as ChildProcess;

    const firstId = manager.register(first);
    const secondId = manager.register(second);
    expect(manager.writeLatest('y\n')).toBe(true);
    expect(secondStdin.write).toHaveBeenCalledWith('y\n');
    expect(firstStdin.write).not.toHaveBeenCalled();

    manager.unregister(secondId);
    expect(manager.writeLatest('n\n')).toBe(true);
    expect(firstStdin.write).toHaveBeenCalledWith('n\n');
    manager.unregister(firstId);
    expect(manager.writeLatest('ignored')).toBe(false);
  });

  it('skips children whose stdin is no longer writable', () => {
    const manager = new ProcessManager();
    const writable = { destroyed: false, writableEnded: false, writable: true, write: vi.fn(() => true) };
    const closed = { destroyed: true, writableEnded: true, writable: false, write: vi.fn() };
    manager.register({ pid: undefined, stdin: writable, kill: vi.fn() } as unknown as ChildProcess);
    manager.register({ pid: undefined, stdin: closed, kill: vi.fn() } as unknown as ChildProcess);

    expect(manager.writeLatest('continue\n')).toBe(true);
    expect(writable.write).toHaveBeenCalledWith('continue\n');
    expect(closed.write).not.toHaveBeenCalled();
  });


  it('writes to a PTY session', () => {
    const manager = new ProcessManager();
    const write = vi.fn();
    const terminal = { pid: undefined, write, kill: vi.fn() };

    manager.register(terminal as unknown as import('node-pty').IPty);
    expect(manager.writeLatest('y\r')).toBe(true);
    expect(write).toHaveBeenCalledWith('y\r');
  });

  it('interrupts only the newest PTY command with Ctrl+C', () => {
    const manager = new ProcessManager();
    const firstWrite = vi.fn();
    const secondWrite = vi.fn();
    manager.register({ pid: undefined, write: firstWrite, kill: vi.fn() } as unknown as import('node-pty').IPty);
    manager.register({ pid: undefined, write: secondWrite, kill: vi.fn() } as unknown as import('node-pty').IPty);

    expect(manager.interruptLatest()).toBe(true);
    expect(secondWrite).toHaveBeenCalledWith('\x03');
    expect(firstWrite).not.toHaveBeenCalled();
  });

  it('sends SIGINT to a piped child process', () => {
    const manager = new ProcessManager();
    const kill = vi.fn(() => true);
    manager.register({ pid: undefined, kill } as unknown as ChildProcess);

    expect(manager.interruptLatest()).toBe(true);
    expect(kill).toHaveBeenCalledWith('SIGINT');
  });

  it('ignores an invocation that has already been removed', () => {
    const manager = new ProcessManager();
    expect(manager.kill('missing')).toBe(false);
  });
});
