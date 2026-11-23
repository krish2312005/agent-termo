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

  it('escalates to SIGKILL when a POSIX process ignores SIGTERM', async () => {
    if (process.platform === 'win32') return;
    const session = await startTerminalSession(
      `node -e "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"`,
      process.cwd(),
    );
    const stopped = await stopTerminalSession(session.id);
    expect(stopped?.status).toBe('stopped');
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
