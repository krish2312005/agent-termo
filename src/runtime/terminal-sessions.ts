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

function killProcessTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      return;
    } catch {
      // Fall through to the direct kill below.
    }
  }
  if (child.pid && process.platform !== 'win32') {
    try { process.kill(-child.pid, 'SIGTERM'); return; } catch { /* Fall back to the direct child. */ }
  }
  try { child.kill('SIGTERM'); } catch { /* best effort */ }
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

export function stopTerminalSession(id: string): TerminalSessionSnapshot | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  if (session.status === 'running') {
    session.stopping = true;
    killProcessTree(session.child);
  }
  return snapshot(session);
}

export function stopAllTerminalSessions(): void {
  for (const session of sessions.values()) {
    if (session.status === 'running') {
      session.stopping = true;
      killProcessTree(session.child);
    }
  }
}

process.once('exit', stopAllTerminalSessions);
