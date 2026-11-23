import { afterAll, describe, expect, it } from 'vitest';
import { readTerminalSession, startTerminalSession, stopTerminalSession, stopAllTerminalSessions } from '../../src/runtime/terminal-sessions.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('background terminal sessions', () => {
  afterAll(async () => { await stopAllTerminalSessions(); });

  it('captures stdout and stderr after the start call has returned', async () => {
    const session = await startTerminalSession(
      `node -e "console.log('SERVER_READY'); setTimeout(() => console.error('LATE_STARTUP_ERROR'), 100)"`,
      process.cwd(),
    );
    expect(session.id).toBeTruthy();
    expect(session.command).toContain('node -e');
    await delay(250);
    const read = readTerminalSession(session.id, 0);
    expect(read?.output).toContain('SERVER_READY');
    expect(read?.output).toContain('LATE_STARTUP_ERROR');
    expect(read?.status).toBe('exited');
    expect(read?.exitCode).toBe(0);
  });

  it('waits for a running process to exit before reporting it stopped', async () => {
    const session = await startTerminalSession(`node -e "setInterval(() => console.log('TICK'), 100)"`, process.cwd());
    expect(session.status).toBe('running');
    const stopped = await stopTerminalSession(session.id);
    expect(stopped?.status).toBe('stopped');
    expect(readTerminalSession(session.id)?.status).toBe('stopped');
  });

  it('kills descendant processes instead of leaving background children alive', async () => {
    const session = await startTerminalSession(
      `node -e "const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); console.log('GRANDCHILD_PID=' + child.pid); setInterval(() => {}, 1000);"`,
      process.cwd(),
    );
    const output = readTerminalSession(session.id, 0)?.output ?? '';
    const match = output.match(/GRANDCHILD_PID=(\d+)/);
    expect(match).not.toBeNull();
    const childPid = Number(match?.[1]);
    const stopped = await stopTerminalSession(session.id);
    expect(stopped?.status).toBe('stopped');

    const deadline = Date.now() + 2_000;
    let childAlive = true;
    while (childAlive && Date.now() < deadline) {
      try {
        process.kill(childPid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') childAlive = false;
        else throw error;
      }
      if (childAlive) await delay(50);
    }
    expect(childAlive).toBe(false);
  });

  it('escalates to SIGKILL when a POSIX process ignores SIGTERM', async () => {
    if (process.platform === 'win32') return;
    const session = await startTerminalSession(
      `node -e "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"`,
      process.cwd(),
    );
    const stopped = await stopTerminalSession(session.id);
    expect(stopped?.status).toBe('stopped');
  });

  it('stops every running background session and reports the final status', async () => {
    const sessions = await Promise.all([
      startTerminalSession(`node -e "setInterval(() => {}, 1000)"`, process.cwd()),
      startTerminalSession(`node -e "setInterval(() => {}, 1000)"`, process.cwd()),
    ]);
    const result = await stopAllTerminalSessions();
    expect(result).toEqual({ stopped: 2, failed: [] });
    for (const session of sessions) {
      expect(readTerminalSession(session.id)?.status).toBe('stopped');
    }
  });

  it('returns only output after the supplied cursor', async () => {
    const session = await startTerminalSession(
      `node -e "console.log('FIRST'); setTimeout(() => console.log('SECOND'), 100)"`,
      process.cwd(),
    );
    const first = readTerminalSession(session.id, 0);
    await delay(200);
    const next = readTerminalSession(session.id, first?.nextCursor ?? 0);
    expect(first?.output).toContain('FIRST');
    expect(next?.output).toContain('SECOND');
  });
});
