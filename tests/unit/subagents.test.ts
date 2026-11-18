import { beforeEach, describe, expect, it } from 'vitest';
import {
  addSubAgentProgress,
  beginSubAgentRun,
  endSubAgentTool,
  finishSubAgent,
  getSubAgent,
  listRunSubAgents,
  listSubAgents,
  resetSubAgents,
  setSubAgentWaiting,
  spawnSubAgent,
  startSubAgentTool,
  subscribeSubAgents,
  type SubAgentEvent,
} from '../../src/runtime/subagents.js';

beforeEach(() => resetSubAgents());

describe('sub-agent registry', () => {
  it('tracks the full lifecycle and emits an event per change', () => {
    const events: SubAgentEvent[] = [];
    subscribeSubAgents((e) => events.push(e));
    beginSubAgentRun();
    const id = spawnSubAgent('call-1', 'backend-dev', 'build the API', 8);
    startSubAgentTool(id, 'file:read', 'src/a.ts');
    endSubAgentTool(id, true, 'ok');
    addSubAgentProgress(id, 'reading files');
    setSubAgentWaiting(id, true);
    expect(getSubAgent(id)?.status).toBe('waiting');
    setSubAgentWaiting(id, false);
    finishSubAgent(id, 'completed', 'done!');
    const a = getSubAgent(id)!;
    expect(a).toMatchObject({ status: 'completed', output: 'done!', task: 'build the API' });
    expect(a.tools[0]).toMatchObject({ name: 'file:read', ok: true, result: 'ok' });
    expect(events.map((e) => e.type)).toEqual(['run', 'spawned', 'tool-start', 'tool-end', 'progress', 'waiting', 'waiting', 'finished']);
  });

  it('keeps finished agents inspectable and ignores late events', () => {
    const id = spawnSubAgent('x', 'qa', 'test');
    finishSubAgent(id, 'failed', 'boom');
    startSubAgentTool(id, 'bash:run', 'ls');
    finishSubAgent(id, 'completed', 'late');
    expect(getSubAgent(id)).toMatchObject({ status: 'failed', error: 'boom' });
    expect(getSubAgent(id)!.tools).toHaveLength(0);
  });

  it('marks a still-running tool as interrupted when the agent ends', () => {
    const id = spawnSubAgent('x', 'qa', 'test');
    startSubAgentTool(id, 'bash:run', 'sleep 9');
    finishSubAgent(id, 'cancelled', 'Cancelled by the user.');
    expect(getSubAgent(id)!.tools[0]).toMatchObject({ ok: false, result: 'interrupted' });
  });

  it('gives parallel spawns with the same prefix distinct ids and scopes the monitor to the current run', () => {
    beginSubAgentRun();
    const a = spawnSubAgent('same-prefix-abc', 'a', 't');
    const b = spawnSubAgent('same-prefix-abc', 'b', 't');
    expect(a).not.toBe(b);
    beginSubAgentRun();
    spawnSubAgent('other', 'c', 't');
    expect(listRunSubAgents().map((x) => x.agent)).toEqual(['c']);
    expect(listSubAgents()).toHaveLength(3); // /subagents still lists everything
  });

  it('survives a throwing subscriber and caps stored history', () => {
    subscribeSubAgents(() => {
      throw new Error('bad view');
    });
    const id = spawnSubAgent('x', 'a', 't');
    for (let i = 0; i < 60; i++) {
      startSubAgentTool(id, 'file:read', `f${i}`);
      endSubAgentTool(id, true, 'ok');
    }
    expect(getSubAgent(id)!.tools).toHaveLength(40);
    expect(getSubAgent(id)!.tools.at(-1)!.args).toBe('f59');
  });
});
