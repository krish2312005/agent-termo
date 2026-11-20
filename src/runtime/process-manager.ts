import { randomUUID } from 'node:crypto';
import { spawnSync, type ChildProcess } from 'node:child_process';

/** Owns each shell invocation independently and cancels complete process trees. */
export class ProcessManager {
  private readonly children = new Map<string, ChildProcess>();

  register(child: ChildProcess): string {
    const id = randomUUID();
    this.children.set(id, child);
    return id;
  }

  unregister(id: string): void {
    this.children.delete(id);
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

  private killTree(child: ChildProcess): void {
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
