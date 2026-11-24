import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_QUEUED_MESSAGES_PER_AGENT,
  agentWorkspace,
  createAgentWorkspace,
  decideMessageDisposition,
  getMainAgentState,
  resetAgentWorkspace,
  sendAgentMessage,
  setMainAgentState,
  stopAllAgents,
  subscribeWorkspace,
  takeQueuedMainMessage,
  type AgentHandle,
  type AgentMessageResult,
  type AgentWorkspace,
  type MainAgentBindings,
  type MessageDispositionInput,
  type MessageTarget,
} from '../../src/runtime/agent-workspace.js';
import { agentTranscripts } from '../../src/runtime/agent-transcript.js';
import { getSelectedAgentId, resetAgentSelection, setSelectedAgentId } from '../../src/runtime/agent-selection.js';
import {
  MAIN_AGENT_ID,
  getSubAgent,
  listSubAgents,
  resetSubAgents,
  setSubAgentQueued,
  spawnSubAgent,
} from '../../src/runtime/subagents.js';
import type { WorkspaceStatus } from '../../src/runtime/agent-tree.js';

interface FakeHandle {
  handle: AgentHandle;
  sent: string[];
  queue: string[];
  cancelCount: () => number;
  status: () => WorkspaceStatus;
  setStatus: (status: WorkspaceStatus) => void;
}

function fakeHandle(id: string, initial: WorkspaceStatus = 'idle'): FakeHandle {
  let current = initial;
  let cancellations = 0;
  const sent: string[] = [];
  const queue: string[] = [];
  const handle: AgentHandle = {
    id,
    kind: 'subagent',
    status: () => current,
    send(text: string): AgentMessageResult {
      sent.push(text);
      if (current === 'running' || current === 'waiting') {
        queue.push(text);
        return { ok: true, disposition: 'queued', queueLength: queue.length };
      }
      return { ok: true, disposition: 'dispatched', queueLength: 0 };
    },
    cancel: () => {
      cancellations += 1;
      current = 'stopped';
    },
  };
  return {
    handle,
    sent,
    queue,
    cancelCount: () => cancellations,
    status: () => current,
    setStatus: (status) => {
      current = status;
    },
  };
}

interface FakeBindings {
  bindings: MainAgentBindings;
  submitted: string[];
  cancelCount: () => number;
  accepts: (value: boolean) => void;
}

function fakeBindings(initialAccepts = true): FakeBindings {
  let accepts = initialAccepts;
  let cancellations = 0;
  const submitted: string[] = [];
  return {
    bindings: {
      submitExternal: (text) => {
        submitted.push(text);
        return accepts;
      },
      cancel: () => {
        cancellations += 1;
      },
    },
    submitted,
    cancelCount: () => cancellations,
    accepts: (value) => {
      accepts = value;
    },
  };
}

const target = (status: WorkspaceStatus, name = 'reviewer'): MessageTarget => ({
  id: 'a1',
  name,
  kind: 'subagent',
  status,
});

const decide = (over: Partial<MessageDispositionInput> = {}) =>
  decideMessageDisposition({
    agentId: 'a1',
    target: target('idle'),
    text: 'hello',
    queueLength: 0,
    now: 10_000,
    ...over,
  });

describe('decideMessageDisposition', () => {
  it('rejects empty and whitespace-only messages before anything else', () => {
    expect(decide({ text: '' })).toMatchObject({ disposition: 'reject', reason: 'empty' });
    expect(decide({ text: '   \n ' })).toMatchObject({ disposition: 'reject', reason: 'empty' });
    expect(decide({ text: '  ', target: null })).toMatchObject({ disposition: 'reject', reason: 'empty' });
  });

  it('always rejects an unknown target and never redirects it', () => {
    const result = decide({ target: null, agentId: 'ghost' });
    expect(result).toMatchObject({ disposition: 'reject', reason: 'unknown_agent' });
    expect((result as { message: string }).message).toContain('ghost');
    expect((result as { message: string }).message).toContain('No agent with id');
  });

  it('rejects a duplicate waiting in the target queue after trimming', () => {
    expect(decide({ target: target('running'), queuedTexts: ['hello'], text: '  hello  ' })).toMatchObject({
      disposition: 'reject',
      reason: 'duplicate',
    });
    expect(decide({ target: target('running'), queuedTexts: ['other'], text: 'hello' })).toEqual({ disposition: 'queue' });
  });

  it('rejects a duplicate dispatched inside the 2,000 ms window and allows it at the boundary', () => {
    expect(decide({ target: target('idle'), lastDispatchAt: 8_001, now: 10_000 })).toMatchObject({
      disposition: 'reject',
      reason: 'duplicate',
    });
    expect(decide({ target: target('idle'), lastDispatchAt: 8_000, now: 10_000 })).toEqual({ disposition: 'dispatch' });
    expect(decide({ target: target('idle'), lastDispatchAt: 10_000, now: 10_000 })).toMatchObject({
      disposition: 'reject',
      reason: 'duplicate',
    });
  });

  it('queues at running/waiting and rejects the 11th message', () => {
    expect(decide({ target: target('running') })).toEqual({ disposition: 'queue' });
    expect(decide({ target: target('waiting') })).toEqual({ disposition: 'queue' });
    expect(decide({ target: target('running'), queueLength: MAX_QUEUED_MESSAGES_PER_AGENT - 1 })).toEqual({
      disposition: 'queue',
    });

    for (const status of ['running', 'waiting'] as const) {
      const result = decide({ target: target(status), queueLength: MAX_QUEUED_MESSAGES_PER_AGENT });
      expect(result).toMatchObject({ disposition: 'reject', reason: 'queue_full' });
      expect((result as { message: string }).message).toContain('10 queued messages');
    }
  });

  it('dispatches to every non-live state', () => {
    for (const status of ['idle', 'completed', 'failed', 'stopped'] as const) {
      expect(decide({ target: target(status) })).toEqual({ disposition: 'dispatch' });
    }
  });

  it('exposes the 10-message queue limit', () => {
    expect(MAX_QUEUED_MESSAGES_PER_AGENT).toBe(10);
  });
});

describe('createAgentWorkspace', () => {
  const created: AgentWorkspace[] = [];

  beforeEach(() => {
    resetSubAgents();
    agentTranscripts.clearAll();
    resetAgentSelection();
  });

  afterEach(() => {
    for (const workspace of created.splice(0)) workspace.reset();
    resetSubAgents();
    agentTranscripts.clearAll();
    resetAgentSelection();
    vi.useRealTimers();
  });

  const makeWorkspace = (): AgentWorkspace => {
    const workspace = createAgentWorkspace();
    created.push(workspace);
    return workspace;
  };

  it('routes strictly by id even when two agents share a display name', () => {
    const workspace = makeWorkspace();
    const firstId = spawnSubAgent('req-a', 'reviewer', 'first task');
    const secondId = spawnSubAgent('req-b', 'reviewer', 'second task');
    expect(getSubAgent(firstId)?.agent).toBe('reviewer');
    expect(getSubAgent(secondId)?.agent).toBe('reviewer');

    const first = fakeHandle(firstId, 'idle');
    const second = fakeHandle(secondId, 'idle');
    workspace.registerHandle(first.handle);
    workspace.registerHandle(second.handle);

    expect(workspace.send(firstId, 'for the first')).toEqual({ ok: true, disposition: 'dispatched', queueLength: 0 });
    expect(first.sent).toEqual(['for the first']);
    expect(second.sent).toEqual([]);

    expect(workspace.send(secondId, 'for the second')).toEqual({ ok: true, disposition: 'dispatched', queueLength: 0 });
    expect(second.sent).toEqual(['for the second']);
    expect(first.sent).toEqual(['for the first']);
  });

  it('never falls back to main or a parent for an unknown id', () => {
    const workspace = makeWorkspace();
    const bindings = fakeBindings();
    workspace.registerMainAgent(bindings.bindings);
    const known = fakeHandle('req-known', 'idle');
    workspace.registerHandle(known.handle);

    const result = workspace.send('ghost', 'hello');
    expect(result).toMatchObject({ ok: false, reason: 'unknown_agent' });
    expect((result as { message: string }).message).toContain('"ghost"');
    expect(bindings.submitted).toEqual([]);
    expect(known.sent).toEqual([]);
  });

  it('reports unavailable only for a missing main binding', () => {
    const workspace = makeWorkspace();

    expect(workspace.send(MAIN_AGENT_ID, 'hello')).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(workspace.send('ghost', 'hello')).toMatchObject({ ok: false, reason: 'unknown_agent' });

    const bindings = fakeBindings();
    const unregister = workspace.registerMainAgent(bindings.bindings);
    expect(workspace.send(MAIN_AGENT_ID, 'hello')).toEqual({ ok: true, disposition: 'dispatched', queueLength: 0 });
    expect(bindings.submitted).toEqual(['hello']);

    unregister();
    expect(workspace.send(MAIN_AGENT_ID, 'again')).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('submits to a pending main question when idle and queues when there is none', () => {
    const workspace = makeWorkspace();
    const bindings = fakeBindings(false);
    workspace.registerMainAgent(bindings.bindings);

    const first = workspace.send(MAIN_AGENT_ID, 'one');
    expect(first).toEqual({ ok: true, disposition: 'queued', queueLength: 1 });
    expect(bindings.submitted).toEqual(['one']);
    expect(workspace.getMainState().queued).toBe(1);

    expect(workspace.send(MAIN_AGENT_ID, 'two')).toEqual({ ok: true, disposition: 'queued', queueLength: 2 });
    expect(workspace.getMainState().queued).toBe(2);
    expect(workspace.takeQueuedMainMessage()).toBe('one');
    expect(workspace.getMainState().queued).toBe(1);
    expect(workspace.takeQueuedMainMessage()).toBe('two');
    expect(workspace.getMainState().queued).toBe(0);
    expect(workspace.takeQueuedMainMessage()).toBeUndefined();

    bindings.accepts(true);
    expect(workspace.send(MAIN_AGENT_ID, 'three')).toEqual({ ok: true, disposition: 'dispatched', queueLength: 0 });
    expect(bindings.submitted).toEqual(['one', 'two', 'three']);
  });

  it('queues main messages while running or waiting without resolving the REPL question', () => {
    const workspace = makeWorkspace();
    const bindings = fakeBindings();
    workspace.registerMainAgent(bindings.bindings);

    workspace.setMainState({ status: 'running' });
    expect(workspace.send(MAIN_AGENT_ID, 'while running')).toEqual({ ok: true, disposition: 'queued', queueLength: 1 });

    workspace.setMainState({ status: 'waiting' });
    expect(workspace.send(MAIN_AGENT_ID, 'while waiting')).toEqual({ ok: true, disposition: 'queued', queueLength: 2 });

    expect(bindings.submitted).toEqual([]);
    expect(workspace.getMainState().queued).toBe(2);
  });

  it('enforces the main FIFO queue cap and drains in order', () => {
    const workspace = makeWorkspace();
    const bindings = fakeBindings();
    workspace.registerMainAgent(bindings.bindings);
    workspace.setMainState({ status: 'running' });

    for (let index = 0; index < MAX_QUEUED_MESSAGES_PER_AGENT; index++) {
      expect(workspace.send(MAIN_AGENT_ID, `queued ${index}`)).toEqual({
        ok: true,
        disposition: 'queued',
        queueLength: index + 1,
      });
    }

    const full = workspace.send(MAIN_AGENT_ID, 'too many');
    expect(full).toMatchObject({ ok: false, reason: 'queue_full' });
    expect((full as { message: string }).message).toContain('10 queued messages');
    expect(workspace.getMainState().queued).toBe(10);

    expect(workspace.takeQueuedMainMessage()).toBe('queued 0');
    expect(workspace.getMainState().queued).toBe(9);
    expect(workspace.send(MAIN_AGENT_ID, 'now there is room')).toEqual({
      ok: true,
      disposition: 'queued',
      queueLength: 10,
    });
  });

  it('delegates a live sub-agent message to its handle and re-checks the queue cap', () => {
    const workspace = makeWorkspace();
    const id = spawnSubAgent('req-q', 'reviewer', 'task');
    const handle = fakeHandle(id, 'running');
    workspace.registerHandle(handle.handle);

    expect(workspace.send(id, 'follow up')).toEqual({ ok: true, disposition: 'queued', queueLength: 1 });
    expect(handle.sent).toEqual(['follow up']);
    expect(workspace.send(id, 'another')).toEqual({ ok: true, disposition: 'queued', queueLength: 2 });

    setSubAgentQueued(id, MAX_QUEUED_MESSAGES_PER_AGENT);
    const full = workspace.send(id, 'overflow');
    expect(full).toMatchObject({ ok: false, reason: 'queue_full' });
    expect(handle.sent).toEqual(['follow up', 'another']);

    setSubAgentQueued(id, 0);
    expect(workspace.send(id, 'third')).toEqual({ ok: true, disposition: 'queued', queueLength: 3 });
  });

  it('rejects a repeated sub-agent message inside the 2,000 ms dispatch window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(500_000);
    const workspace = makeWorkspace();
    const handle = fakeHandle('req-d', 'idle');
    workspace.registerHandle(handle.handle);

    expect(workspace.send('req-d', 'ping')).toEqual({ ok: true, disposition: 'dispatched', queueLength: 0 });
    vi.setSystemTime(501_999);
    expect(workspace.send('req-d', ' ping ')).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(handle.sent).toEqual(['ping']);

    vi.setSystemTime(502_000);
    expect(workspace.send('req-d', 'ping')).toEqual({ ok: true, disposition: 'dispatched', queueLength: 0 });
    expect(handle.sent).toEqual(['ping', 'ping']);
  });

  it('rejects a duplicate text already waiting in the main queue even after the window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const workspace = makeWorkspace();
    const bindings = fakeBindings();
    workspace.registerMainAgent(bindings.bindings);
    workspace.setMainState({ status: 'running' });

    expect(workspace.send(MAIN_AGENT_ID, 'same')).toEqual({ ok: true, disposition: 'queued', queueLength: 1 });
    vi.setSystemTime(10_000);
    expect(workspace.send(MAIN_AGENT_ID, ' same ')).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(workspace.getMainState().queued).toBe(1);
  });

  it('stop-all cancels every live target once, clears the main queue and reports the real count', () => {
    const workspace = makeWorkspace();
    const bindings = fakeBindings();
    workspace.registerMainAgent(bindings.bindings);
    const liveOne = fakeHandle('live-1', 'running');
    const liveTwo = fakeHandle('live-2', 'waiting');
    const finished = fakeHandle('finished', 'completed');
    workspace.registerHandle(liveOne.handle);
    workspace.registerHandle(liveTwo.handle);
    workspace.registerHandle(finished.handle);

    workspace.setMainState({ status: 'running' });
    workspace.send(MAIN_AGENT_ID, 'first queued');
    workspace.send(MAIN_AGENT_ID, 'second queued');
    expect(workspace.getMainState().queued).toBe(2);

    expect(workspace.stopAll()).toBe(3);
    expect(bindings.cancelCount()).toBe(1);
    expect(liveOne.cancelCount()).toBe(1);
    expect(liveTwo.cancelCount()).toBe(1);
    expect(workspace.getMainState().queued).toBe(0);
    expect(workspace.takeQueuedMainMessage()).toBeUndefined();
  });

  it('stop-all reports zero when nothing is live', () => {
    const workspace = makeWorkspace();
    const bindings = fakeBindings();
    workspace.registerMainAgent(bindings.bindings);
    workspace.registerHandle(fakeHandle('done', 'completed').handle);

    expect(workspace.stopAll()).toBe(0);
    expect(workspace.takeQueuedMainMessage()).toBeUndefined();
  });

  it('survives a throwing cancel handler and still stops the rest', () => {
    const workspace = makeWorkspace();
    const throwing = fakeHandle('boom', 'running');
    throwing.handle.cancel = () => {
      throw new Error('cancel failed');
    };
    const healthy = fakeHandle('healthy', 'running');
    workspace.registerHandle(throwing.handle);
    workspace.registerHandle(healthy.handle);

    expect(() => workspace.stopAll()).not.toThrow();
    expect(healthy.cancelCount()).toBe(1);
  });

  it('reset clears handles, registry rows, transcripts, queues and selection but keeps main bound', () => {
    const workspace = makeWorkspace();
    const bindings = fakeBindings();
    workspace.registerMainAgent(bindings.bindings);
    workspace.setMainState({ status: 'running', activity: 'working', goal: 'ship it' });
    workspace.send(MAIN_AGENT_ID, 'queued before reset');
    const startedAt = workspace.getMainState().startedAt;

    const id = spawnSubAgent('req-r', 'reviewer', 'task');
    const handle = fakeHandle(id, 'running');
    workspace.registerHandle(handle.handle);
    agentTranscripts.append({ type: 'user', agentId: id, text: 'history', at: 1 });
    setSelectedAgentId(id);

    workspace.reset();

    expect(workspace.getMainState()).toMatchObject({ status: 'idle', activity: 'ready', queued: 0, startedAt });
    expect(workspace.getMainState().goal).toBeUndefined();
    expect(workspace.getMainState().usage).toBeUndefined();
    expect(workspace.getMainState().activeAgentName).toBeUndefined();
    expect(workspace.takeQueuedMainMessage()).toBeUndefined();
    expect(workspace.send(id, 'after reset')).toMatchObject({ ok: false, reason: 'unknown_agent' });
    expect(listSubAgents()).toEqual([]);
    expect(agentTranscripts.get(id)).toEqual([]);
    expect(getSelectedAgentId()).toBe(MAIN_AGENT_ID);

    expect(workspace.send(MAIN_AGENT_ID, 'still bound')).toMatchObject({ ok: true });
    expect(bindings.submitted).toContain('still bound');
  });

  it('notifies subscribers for main state, handle registration and registry events', () => {
    const workspace = makeWorkspace();
    let calls = 0;
    const unsubscribe = workspace.subscribe(() => {
      calls += 1;
    });

    workspace.setMainState({ activity: 'working' });
    expect(calls).toBe(1);
    workspace.setMainState({ activity: 'working' });
    expect(calls).toBe(1);

    const unregister = workspace.registerHandle(fakeHandle('handle-1', 'idle').handle);
    expect(calls).toBe(2);
    unregister();
    expect(calls).toBe(3);

    spawnSubAgent('req-s', 'reviewer', 'task');
    expect(calls).toBe(4);

    workspace.setMainState({ activity: 'idle' });
    expect(calls).toBe(5);

    unsubscribe();
    workspace.setMainState({ activity: 'ready' });
    expect(calls).toBe(5);
  });

  it('isolates a throwing workspace subscriber', () => {
    const workspace = makeWorkspace();
    let calls = 0;
    workspace.subscribe(() => {
      throw new Error('broken navigator');
    });
    workspace.subscribe(() => {
      calls += 1;
    });

    expect(() => workspace.setMainState({ activity: 'working' })).not.toThrow();
    expect(calls).toBe(1);
  });

  it('applies only valid main-state patches and returns defensive copies', () => {
    const workspace = makeWorkspace();
    const initial = workspace.getMainState();
    expect(initial).toMatchObject({ status: 'idle', activity: 'ready', queued: 0 });

    const copy = workspace.getMainState();
    copy.activity = 'tampered';
    expect(workspace.getMainState().activity).toBe('ready');

    const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
    workspace.setMainState({ status: 'running', activity: 'working', activeAgentName: 'project-manager', goal: 'ship', usage });
    expect(workspace.getMainState()).toMatchObject({
      status: 'running',
      activity: 'working',
      activeAgentName: 'project-manager',
      goal: 'ship',
      usage,
    });

    workspace.setMainState({ status: 'completed' as never });
    expect(workspace.getMainState().status).toBe('running');

    workspace.setMainState({ queued: 9, startedAt: 123 } as never);
    expect(workspace.getMainState()).toMatchObject({ queued: 0, startedAt: initial.startedAt });

    workspace.setMainState({ status: 'waiting' });
    expect(workspace.getMainState().status).toBe('waiting');

    workspace.setMainState({ activeAgentName: undefined, goal: undefined });
    expect(workspace.getMainState().activeAgentName).toBeUndefined();
    expect(workspace.getMainState().goal).toBeUndefined();
    expect(workspace.getMainState().usage).toEqual(usage);
  });

  it('unregisters a handle so routing stops when its session ends', () => {
    const workspace = makeWorkspace();
    const handle = fakeHandle('handle-1', 'idle');
    const unregister = workspace.registerHandle(handle.handle);

    expect(workspace.send('handle-1', 'one')).toMatchObject({ ok: true, disposition: 'dispatched' });
    unregister();
    expect(workspace.send('handle-1', 'two')).toMatchObject({ ok: false, reason: 'unknown_agent' });
    expect(handle.sent).toEqual(['one']);
  });
});

describe('default workspace wrappers', () => {
  let unregisterMain: (() => void) | undefined;
  const handleUnregisters: Array<() => void> = [];

  beforeEach(() => {
    resetSubAgents();
    agentTranscripts.clearAll();
    resetAgentSelection();
  });

  afterEach(() => {
    unregisterMain?.();
    unregisterMain = undefined;
    for (const unregister of handleUnregisters.splice(0)) unregister();
    resetAgentWorkspace();
    resetSubAgents();
    agentTranscripts.clearAll();
    resetAgentSelection();
  });

  it('delegates main state and the main queue through the module wrappers', () => {
    const bindings = fakeBindings();
    unregisterMain = agentWorkspace.registerMainAgent(bindings.bindings);

    setMainAgentState({ status: 'running', activity: 'working' });
    expect(getMainAgentState()).toMatchObject({ status: 'running', activity: 'working' });

    expect(sendAgentMessage(MAIN_AGENT_ID, 'one')).toEqual({ ok: true, disposition: 'queued', queueLength: 1 });
    expect(getMainAgentState().queued).toBe(1);
    expect(takeQueuedMainMessage()).toBe('one');
    expect(takeQueuedMainMessage()).toBeUndefined();
    expect(getMainAgentState().queued).toBe(0);
  });

  it('delegates stop-all, subscription and reset to the default instance', () => {
    const bindings = fakeBindings();
    unregisterMain = agentWorkspace.registerMainAgent(bindings.bindings);
    const handle = fakeHandle('live-handle', 'running');
    handleUnregisters.push(agentWorkspace.registerHandle(handle.handle));
    setMainAgentState({ status: 'running' });

    let notifications = 0;
    const unsubscribe = subscribeWorkspace(() => {
      notifications += 1;
    });

    expect(stopAllAgents()).toBe(2);
    expect(bindings.cancelCount()).toBe(1);
    expect(handle.cancelCount()).toBe(1);
    expect(notifications).toBeGreaterThan(0);
    unsubscribe();

    resetAgentWorkspace();
    expect(getMainAgentState()).toMatchObject({ status: 'idle', activity: 'ready', queued: 0 });
    expect(sendAgentMessage('live-handle', 'after reset')).toMatchObject({ ok: false, reason: 'unknown_agent' });
    expect(sendAgentMessage(MAIN_AGENT_ID, 'still bound')).toMatchObject({ ok: true });
  });
});
