import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolveShell } from '../utils/shell.js';

const MAX_RETAINED_OUTPUT = 60_000;
const MAX_SESSIONS = 12;

export interface TerminalSessionHooks {
  onStart?: (command: string) => void;
  onOutput?: (text: string) => void;
  onEnd?: (exitCode: number | null) => void;
}

export interface TerminalSessionSnapshot {
  id: string;
  command: string;
  cwd: string;
  status: 'running' | 'exited' | 'failed' | 'stopped';
  exitCode: number | null;
  output: string;
  nextCursor: number;
  truncated: boolean;
  elapsedMs: number;
}

interface TerminalSession extends TerminalSessionSnapshot {
  child: ChildProcess;
  outputBase: number;
  startedAt: number;
  stopping: boolean;
}

const sessions = new Map<string, TerminalSession>();

const TERMINATION_GRACE_MS = 900;
const TERMINATION_TIMEOUT_MS = 3_000;

export interface TerminalStopSummary { stopped: number; failed: string[]; }

function childHasClosed(child: ChildProcess): boolean {
  const exited = child.exitCode !== null || child.signalCode !== null;
  return exited && (!child.stdout || child.stdout.destroyed) && (!child.stderr || child.stderr.destroyed);
}

function waitForChildClose(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (childHasClosed(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (closed: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('close', onClose);
      child.removeListener('error', onError);
      resolve(closed);
    };
    const onClose = (): void => finish(true);
    const onError = (): void => finish(true);
    child.once('close', onClose);
    child.once('error', onError);
    timer = setTimeout(() => finish(childHasClosed(child)), timeoutMs);
    if (childHasClosed(child)) finish(true);
  });
}

function runTaskkill(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    let killer: ChildProcess;
    const finish = (success: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(success);
    };
    try {
      killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    } catch {
      resolve(false);
      return;
    }
    killer.once('error', () => finish(false));
    killer.once('close', (code) => finish(code === 0));
    timer = setTimeout(() => {
      try { killer.kill('SIGKILL'); } catch { /* best effort */ }
      finish(false);
    }, TERMINATION_TIMEOUT_MS);
  });
}

/** Stop a shell and its process tree, waiting until the child and stdio close. */
export async function terminateProcessTree(child: ChildProcess): Promise<boolean> {
  const pid = child.pid;
  if (process.platform === 'win32') {
    if (pid) await runTaskkill(pid);
    if (await waitForChildClose(child, TERMINATION_GRACE_MS)) return true;
    try { child.kill('SIGKILL'); } catch { /* best effort */ }
    if (pid) await runTaskkill(pid);
    return waitForChildClose(child, TERMINATION_TIMEOUT_MS);
  }

  let signalledGroup = false;
  if (pid) {
    try { process.kill(-pid, 'SIGTERM'); signalledGroup = true; } catch { /* group may have exited */ }
  }
  if (!signalledGroup) {
    try { child.kill('SIGTERM'); } catch { /* best effort */ }
  }
  if (await waitForChildClose(child, TERMINATION_GRACE_MS)) return true;
  if (pid) {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* best effort */ }
  }
  try { child.kill('SIGKILL'); } catch { /* best effort */ }
  return waitForChildClose(child, TERMINATION_TIMEOUT_MS);
}

function snapshot(session: TerminalSession, cursor = 0): TerminalSessionSnapshot {
  const requested = Number.isFinite(cursor) && cursor >= 0 ? Math.floor(cursor) : 0;
  const effective = Math.max(requested, session.outputBase);
  const offset = Math.min(session.output.length, effective - session.outputBase);
  return {
    id: session.id,
    command: session.command,
    cwd: session.cwd,
    status: session.status,
    exitCode: session.exitCode,
    output: session.output.slice(offset),
    nextCursor: session.outputBase + session.output.length,
    truncated: requested < session.outputBase,
    elapsedMs: Date.now() - session.startedAt,
  };
}

function appendOutput(session: TerminalSession, stream: 'stdout' | 'stderr', chunk: Buffer | string, hooks: TerminalSessionHooks): void {
  const value = chunk.toString();
  const tagged = stream === 'stderr' ? '[stderr] ' + value : value;
  session.output += tagged;
  if (session.output.length > MAX_RETAINED_OUTPUT) {
    const removed = session.output.length - MAX_RETAINED_OUTPUT;
    session.output = session.output.slice(removed);
    session.outputBase += removed;
  }
  hooks.onOutput?.(value);
}

export async function startTerminalSession(
  command: string,
  cwd: string,
  hooks: TerminalSessionHooks = {},
): Promise<TerminalSessionSnapshot> {
  for (const [id, existing] of sessions) {
    if (existing.status !== 'running' && sessions.size >= MAX_SESSIONS) sessions.delete(id);
  }
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error('Too many terminal sessions are retained. Stop or finish an existing session first.');
  }

  const id = randomUUID();
  const startedAt = Date.now();
  const child = spawn(command, {
    cwd,
    shell: resolveShell(),
    detached: process.platform !== 'win32',
    windowsHide: true,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  const session: TerminalSession = {
    id, command, cwd, child, startedAt, outputBase: 0, output: '',
    status: 'running', exitCode: null, nextCursor: 0, truncated: false, elapsedMs: 0, stopping: false,
  };
  sessions.set(id, session);
  hooks.onStart?.(command);

  let signalFirstEvent: (() => void) | undefined;
  const firstEvent = new Promise<void>((resolve) => { signalFirstEvent = resolve; });
  const finish = (status: 'exited' | 'failed' | 'stopped', exitCode: number | null): void => {
    if (session.status !== 'running') return;
    session.status = status;
    session.exitCode = exitCode;
    hooks.onEnd?.(exitCode);
    signalFirstEvent?.();
  };

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk) => { appendOutput(session, 'stdout', chunk, hooks); signalFirstEvent?.(); });
  child.stderr?.on('data', (chunk) => { appendOutput(session, 'stderr', chunk, hooks); signalFirstEvent?.(); });
  child.once('error', (error) => {
    appendOutput(session, 'stderr', error.message, hooks);
    finish('failed', null);
  });
  child.once('close', (code) => finish(session.stopping ? 'stopped' : code === 0 ? 'exited' : 'failed', code));

  await Promise.race([firstEvent, new Promise<void>((resolve) => setTimeout(resolve, 500))]);
  return snapshot(session);
}

export function readTerminalSession(id: string, cursor = 0): TerminalSessionSnapshot | undefined {
  const session = sessions.get(id);
  return session ? snapshot(session, cursor) : undefined;
}

export async function stopTerminalSession(id: string): Promise<TerminalSessionSnapshot | undefined> {
  const session = sessions.get(id);
  if (!session) return undefined;
  if (session.status === 'running') {
    session.stopping = true;
    const stopped = await terminateProcessTree(session.child);
    if (!stopped) return snapshot(session);
    // The child can reach its closed state just before the close listener runs.
    if (session.status === 'running') await new Promise<void>((resolve) => session.child.once('close', () => resolve()));
  }
  return snapshot(session);
}

export async function stopAllTerminalSessions(): Promise<TerminalStopSummary> {
  const running = [...sessions.values()].filter((session) => session.status === 'running');
  const results = await Promise.all(running.map(async (session) => {
    const stopped = await stopTerminalSession(session.id);
    return { session, stopped: stopped?.status !== 'running' };
  }));
  return {
    stopped: results.filter((result) => result.stopped).length,
    failed: results.filter((result) => !result.stopped).map((result) => result.session.id),
  };
}

process.once('exit', () => {
  for (const session of sessions.values()) {
    if (session.status !== 'running' || !session.child.pid) continue;
    if (process.platform !== 'win32') {
      try { process.kill(-session.child.pid, 'SIGKILL'); } catch { /* best effort */ }
    }
    try { session.child.kill('SIGKILL'); } catch { /* best effort */ }
  }
});
