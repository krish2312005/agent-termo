import { randomUUID } from 'node:crypto';
import { spawnSync, type ChildProcess } from 'node:child_process';
import type { IPty } from 'node-pty';

type ManagedProcess = ChildProcess | IPty;

/** Owns each shell invocation independently and cancels complete process trees. */
export class ProcessManager {
  private readonly children = new Map<string, ManagedProcess>();

  register(child: ManagedProcess): string {
    const id = randomUUID();
    this.children.set(id, child);
    return id;
  }

  unregister(id: string): void {
    this.children.delete(id);
  }

  /** Write input to the newest active PTY or piped child process. */
  writeLatest(input: string): boolean {
    for (const child of [...this.children.values()].reverse()) {
      if ('write' in child && typeof child.write === 'function') {
        try {
          child.write(input);
          return true;
        } catch {
          continue;
        }
      }
      const stdin = child.stdin;
      if (!stdin || stdin.destroyed || stdin.writableEnded || !stdin.writable) continue;
      try {
        stdin.write(input);
        return true;
      } catch {
        // The child may close stdin between the writable check and write.
      }
    }
    return false;
  }

  /** Interrupt only the newest active command, preserving its process tree for graceful cleanup. */
  interruptLatest(): boolean {
    for (const child of [...this.children.values()].reverse()) {
      if ('write' in child && typeof child.write === 'function') {
        try {
          child.write('\\x03');
          return true;
        } catch {
          continue;
        }
      }
      try {
        if (child.kill('SIGINT')) return true;
      } catch {
        // The child may have exited between lookup and interrupt.
      }
    }
    return false;
  }

  kill(id: string): boolean {
    const child = this.children.get(id);
    if (!child) return false;
    this.children.delete(id);
    this.killTree(child);
    return true;
  }

  killAll(): boolean {
    const active = [...this.children.values()];
    this.children.clear();
    for (const child of active) this.killTree(child);
    return active.length > 0;
  }

  get size(): number {
    return this.children.size;
  }

  private killTree(child: ManagedProcess): void {
    if (child.pid && process.platform === 'win32') {
      const result = spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      if (result.status === 0) return;
    } else if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL');
        return;
      } catch {
        // The process group may already have exited.
      }
    }

    try {
      child.kill('SIGKILL');
    } catch {
      // The process may have exited between the ownership check and signal.
    }
  }
}
