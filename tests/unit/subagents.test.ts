import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAIN_AGENT_ID,
  addSubAgentProgress,
  approvalRequesterLabel,
  beginSubAgentRun,
  clearSubAgentActivity,
  endSubAgentTool,
  finishSubAgent,
  getSubAgent,
  listRunSubAgents,
  listSubAgents,
  resetSubAgents,
  resumeSubAgent,
  sanitizeAgentLabel,
  setSubAgentQueued,
  setSubAgentUsage,
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

describe('sub-agent workspace identity', () => {
  it('exposes the reserved main id and defaults every spawn to main as parent', () => {
    expect(MAIN_AGENT_ID).toBe('main');

    const id = spawnSubAgent('call-1', 'frontend-expert', 'build it');
    expect(getSubAgent(id)).toMatchObject({
      id,
      parentId: MAIN_AGENT_ID,
      queued: 0,
    });
    expect(getSubAgent(id)!.usage).toBeUndefined();
  });

  it('keeps a custom parent id and never derives a child id equal to its parent', () => {
    const nested = spawnSubAgent('custom-1', 'test-agent', 'run tests', 0, 'parent-agent');
    expect(getSubAgent(nested)).toMatchObject({ id: 'custom-1', parentId: 'parent-agent' });
    expect(nested).not.toBe('parent-agent');

    const selfNamed = spawnSubAgent('parent-agent', 'test-agent', 'run tests', 0, 'parent-agent');
    expect(selfNamed).not.toBe('parent-agent');
    expect(selfNamed).toBe('parent-agent-2');
    expect(getSubAgent(selfNamed)!.parentId).toBe('parent-agent');

    const mainNamed = spawnSubAgent(MAIN_AGENT_ID, 'test-agent', 'run tests', 0, MAIN_AGENT_ID);
    expect(mainNamed).not.toBe(MAIN_AGENT_ID);
    expect(mainNamed).toBe('main-2');
    expect(getSubAgent(mainNamed)!.parentId).toBe(MAIN_AGENT_ID);
  });

  it('never returns the reserved main id when a non-main parent requests it', () => {
    // SEC-09: the reserved id must not depend on the parent being main.
    const id = spawnSubAgent(MAIN_AGENT_ID, 'test-agent', 'run tests', 0, 'parent-agent');
    expect(id).not.toBe(MAIN_AGENT_ID);
    expect(id).toBe('main-2');
    expect(getSubAgent(id)).toMatchObject({ id, parentId: 'parent-agent', status: 'running' });

    const next = spawnSubAgent(MAIN_AGENT_ID, 'test-agent', 'run tests again', 0, 'parent-agent');
    expect(next).not.toBe(MAIN_AGENT_ID);
    expect(next).toBe('main-3');
    expect(getSubAgent(next)!.parentId).toBe('parent-agent');
  });
});

describe('sub-agent resume', () => {
  it('resumes a completed agent, clears terminal fields and emits resumed', () => {
    const id = spawnSubAgent('call-1', 'qa', 'test');
    const startedAt = getSubAgent(id)!.startedAt;
    finishSubAgent(id, 'completed', 'all green');
    const events: SubAgentEvent[] = [];
    subscribeSubAgents((event) => events.push(event));

    expect(resumeSubAgent(id)).toBe(true);
    expect(getSubAgent(id)).toMatchObject({
      status: 'running',
      activity: 'resuming',
      startedAt,
      output: undefined,
      error: undefined,
      endedAt: undefined,
    });
    expect(events).toEqual([{ type: 'resumed', id }]);
  });

  it('resumes failed and cancelled agents and clears their error', () => {
    const failed = spawnSubAgent('call-f', 'qa', 'test');
    finishSubAgent(failed, 'failed', 'boom');
    expect(resumeSubAgent(failed)).toBe(true);
    expect(getSubAgent(failed)).toMatchObject({ status: 'running', error: undefined });

    const cancelled = spawnSubAgent('call-c', 'qa', 'test');
    finishSubAgent(cancelled, 'cancelled', 'Cancelled by the user.');
    expect(resumeSubAgent(cancelled)).toBe(true);
    expect(getSubAgent(cancelled)!.status).toBe('running');
  });

  it('refuses to resume a live or unknown agent and emits nothing', () => {
    const running = spawnSubAgent('call-r', 'qa', 'test');
    const waiting = spawnSubAgent('call-w', 'qa', 'test');
    setSubAgentWaiting(waiting, true);
    const events: SubAgentEvent[] = [];
    subscribeSubAgents((event) => events.push(event));

    expect(resumeSubAgent(running)).toBe(false);
    expect(resumeSubAgent(waiting)).toBe(false);
    expect(resumeSubAgent('missing')).toBe(false);
    expect(events).toEqual([]);
    expect(getSubAgent(running)!.status).toBe('running');
    expect(getSubAgent(waiting)!.status).toBe('waiting');
  });
});

describe('sub-agent usage and queue counters', () => {
  const usage = { promptTokens: 900, completionTokens: 300, totalTokens: 1_200 };

  it('stores cumulative usage and emits a usage event', () => {
    const id = spawnSubAgent('call-1', 'qa', 'test');
    const events: SubAgentEvent[] = [];
    subscribeSubAgents((event) => events.push(event));

    setSubAgentUsage(id, usage);
    expect(getSubAgent(id)!.usage).toEqual(usage);
    expect(events).toEqual([{ type: 'usage', id }]);

    const next = { promptTokens: 1_900, completionTokens: 700, totalTokens: 2_600 };
    setSubAgentUsage(id, next);
    expect(getSubAgent(id)!.usage).toEqual(next);
  });

  it('stores the queued count, clamps invalid counts and emits queued', () => {
    const id = spawnSubAgent('call-1', 'qa', 'test');
    const events: SubAgentEvent[] = [];
    subscribeSubAgents((event) => events.push(event));

    setSubAgentQueued(id, 3);
    expect(getSubAgent(id)!.queued).toBe(3);
    expect(events).toEqual([{ type: 'queued', id }]);

    setSubAgentQueued(id, 3.7);
    expect(getSubAgent(id)!.queued).toBe(3);
    setSubAgentQueued(id, -4);
    expect(getSubAgent(id)!.queued).toBe(0);
    setSubAgentQueued(id, Number.NaN);
    expect(getSubAgent(id)!.queued).toBe(0);
    expect(events).toHaveLength(4);
  });

  it('ignores usage/queue updates for an unknown id without emitting', () => {
    const events: SubAgentEvent[] = [];
    subscribeSubAgents((event) => events.push(event));

    expect(() => setSubAgentUsage('missing', usage)).not.toThrow();
    expect(() => setSubAgentQueued('missing', 2)).not.toThrow();
    expect(events).toEqual([]);
  });
});

describe('clearSubAgentActivity', () => {
  it('clears every row, emits run and keeps listeners subscribed', () => {
    const first = spawnSubAgent('call-1', 'qa', 'first');
    finishSubAgent(first, 'completed', 'done');
    spawnSubAgent('call-2', 'qa', 'second');
    const events: SubAgentEvent[] = [];
    subscribeSubAgents((event) => events.push(event));

    clearSubAgentActivity();
    expect(listSubAgents()).toEqual([]);
    expect(events).toEqual([{ type: 'run' }]);

    const third = spawnSubAgent('call-3', 'qa', 'third');
    expect(events).toEqual([{ type: 'run' }, { type: 'spawned', id: third }]);
    expect(listSubAgents().map((activity) => activity.id)).toEqual([third]);
  });
});

describe('agent display labels', () => {
  it('strips OSC, CSI, DCS and control characters from display names', () => {
    expect(sanitizeAgentLabel('\x1b]0;pwned\x07qa')).toBe('qa');
    expect(sanitizeAgentLabel('\x1b]8;;http://evil.example\x1b\\qa')).toBe('qa');
    expect(sanitizeAgentLabel('\x1b[31mqa\x1b[0m')).toBe('qa');
    expect(sanitizeAgentLabel('\x1bP1;2|payload\x1b\\qa')).toBe('qa');
    expect(sanitizeAgentLabel('q\x07a\r\n')).toBe('qa');
    expect(sanitizeAgentLabel('q\x85a\x9fa')).toBe('qaa');
  });

  it('trims whitespace and clips with an ellipsis at the requested length', () => {
    expect(sanitizeAgentLabel('  qa  ')).toBe('qa');
    expect(sanitizeAgentLabel('')).toBe('');
    expect(sanitizeAgentLabel('   ')).toBe('');

    const clipped = sanitizeAgentLabel('x'.repeat(60));
    expect(clipped).toHaveLength(40);
    expect(clipped.endsWith('…')).toBe(true);
    expect(sanitizeAgentLabel('x'.repeat(60), 10)).toBe('xxxxxxxxx…');

    expect(sanitizeAgentLabel('前端🚀')).toBe('前端🚀');
    expect(sanitizeAgentLabel('a'.repeat(40))).toBe('a'.repeat(40));
  });

  it('returns an empty label for control-only names so callers can fall back', () => {
    expect(sanitizeAgentLabel('\x1b[2J\x07\r\n')).toBe('');
    expect(sanitizeAgentLabel('\x1b]0;title\x07')).toBe('');
    expect(sanitizeAgentLabel('\x9b\x9f\x85')).toBe('');
  });
});

describe('approvalRequesterLabel', () => {
  it('appends the first six id characters to every case variant of main', () => {
    expect(approvalRequesterLabel('abc123def', 'main')).toBe('main#abc123');
    expect(approvalRequesterLabel('abc123def', 'MAIN')).toBe('MAIN#abc123');
    expect(approvalRequesterLabel('abc123def', 'Main')).toBe('Main#abc123');
    expect(approvalRequesterLabel('abc', 'main')).toBe('main#abc');
  });

  it('leaves normal agent names unchanged', () => {
    expect(approvalRequesterLabel('abc123def', 'frontend-expert')).toBe('frontend-expert');
    expect(approvalRequesterLabel('abc123def', 'security-expert')).toBe('security-expert');
    expect(approvalRequesterLabel('abc123def', '前端专家')).toBe('前端专家');
  });

  it('sanitizes before deciding whether the name spoofs main', () => {
    expect(approvalRequesterLabel('abc123def', '\x1b[31mmain\x1b[0m')).toBe('main#abc123');
    expect(approvalRequesterLabel('abc123def', '\x1b]0;x\x07MAIN')).toBe('MAIN#abc123');
  });

  it('falls back to agent for empty or control-only names', () => {
    expect(approvalRequesterLabel('abc123def', '')).toBe('agent');
    expect(approvalRequesterLabel('abc123def', '\x1b[2J\x07\r\n')).toBe('agent');
  });
});
