import { describe, expect, it } from 'vitest';
import {
  MAX_TRANSCRIPT_BYTES_PER_AGENT,
  MAX_TRANSCRIPT_ENTRIES,
  MAX_TRANSCRIPT_TEXT,
  applyTranscriptEvent,
  createAgentTranscriptStore,
  summarizeToolArgs,
  type AgentTranscriptEntry,
  type AgentTranscriptEvent,
} from '../../src/runtime/agent-transcript.js';

const bytesOf = (entries: readonly AgentTranscriptEntry[]): number =>
  entries.reduce(
    (sum, entry) =>
      sum +
      Buffer.byteLength(entry.text, 'utf8') +
      (entry.tool
        ? Buffer.byteLength(entry.tool.args, 'utf8') + Buffer.byteLength(entry.tool.result ?? '', 'utf8')
        : 0),
    0,
  );

const userEvent = (agentId: string, text: string, at: number): AgentTranscriptEvent => ({
  type: 'user',
  agentId,
  text,
  at,
});

describe('applyTranscriptEvent', () => {
  it('appends user entries with a unique id and the real payload', () => {
    let entries: AgentTranscriptEntry[] = [];
    entries = applyTranscriptEvent(entries, userEvent('agent-a', 'do the task', 10));
    entries = applyTranscriptEvent(entries, userEvent('agent-a', 'follow up', 20));

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ agentId: 'agent-a', kind: 'user', at: 10, text: 'do the task' });
    expect(entries[0]!.id).not.toBe(entries[1]!.id);
    expect(entries[1]).toMatchObject({ text: 'follow up', at: 20 });
    expect(entries[0]!.streaming).toBeUndefined();
  });

  it('accumulates assistant deltas and replaces them with the authoritative final text', () => {
    let entries: AgentTranscriptEntry[] = [];
    entries = applyTranscriptEvent(entries, { type: 'assistant.start', agentId: 'a', messageId: 'm1', at: 1 });
    expect(entries[0]).toMatchObject({ kind: 'assistant', text: '', streaming: true, messageId: 'm1' });

    entries = applyTranscriptEvent(entries, { type: 'assistant.delta', agentId: 'a', messageId: 'm1', text: 'Hello', at: 2 });
    entries = applyTranscriptEvent(entries, { type: 'assistant.delta', agentId: 'a', messageId: 'm1', text: ' world', at: 3 });
    expect(entries[0]).toMatchObject({ text: 'Hello world', streaming: true });

    entries = applyTranscriptEvent(entries, { type: 'assistant.end', agentId: 'a', messageId: 'm1', finalText: 'Hello world!', at: 4 });
    expect(entries[0]).toMatchObject({ text: 'Hello world!', streaming: false });
    expect(entries).toHaveLength(1);
  });

  it('keeps accumulated text when assistant.end has no final text and drops a blank message', () => {
    let kept: AgentTranscriptEntry[] = [];
    kept = applyTranscriptEvent(kept, { type: 'assistant.start', agentId: 'a', messageId: 'm1', at: 1 });
    kept = applyTranscriptEvent(kept, { type: 'assistant.delta', agentId: 'a', messageId: 'm1', text: 'streamed', at: 2 });
    kept = applyTranscriptEvent(kept, { type: 'assistant.end', agentId: 'a', messageId: 'm1', at: 3 });
    expect(kept[0]).toMatchObject({ text: 'streamed', streaming: false });

    let blank: AgentTranscriptEntry[] = [];
    blank = applyTranscriptEvent(blank, { type: 'assistant.start', agentId: 'a', messageId: 'm2', at: 1 });
    blank = applyTranscriptEvent(blank, { type: 'assistant.end', agentId: 'a', messageId: 'm2', finalText: '   ', at: 2 });
    expect(blank).toEqual([]);
  });

  it('ignores deltas and ends without a matching agent + message id', () => {
    let entries: AgentTranscriptEntry[] = [];
    entries = applyTranscriptEvent(entries, { type: 'assistant.start', agentId: 'a', messageId: 'm1', at: 1 });
    entries = applyTranscriptEvent(entries, { type: 'assistant.delta', agentId: 'a', messageId: 'm1', text: 'mine', at: 2 });

    const afterForeignDelta = applyTranscriptEvent(entries, {
      type: 'assistant.delta',
      agentId: 'b',
      messageId: 'm1',
      text: ' not mine',
      at: 3,
    });
    expect(afterForeignDelta).toEqual(entries);

    const afterUnknownEnd = applyTranscriptEvent(entries, { type: 'assistant.end', agentId: 'a', messageId: 'other', at: 4 });
    expect(afterUnknownEnd).toEqual(entries);
    expect((afterUnknownEnd[0] as AgentTranscriptEntry).text).toBe('mine');
  });

  it('pairs tool start and end by callId and records the outcome', () => {
    let entries: AgentTranscriptEntry[] = [];
    entries = applyTranscriptEvent(entries, {
      type: 'tool.start',
      agentId: 'a',
      callId: 'call-1',
      name: 'file:read',
      args: 'src/a.ts',
      at: 100,
    });
    expect(entries[0]).toMatchObject({ kind: 'tool', text: 'file:read(src/a.ts)' });
    expect(entries[0]!.tool).toMatchObject({ callId: 'call-1', name: 'file:read', args: 'src/a.ts', state: 'running', startedAt: 100 });

    entries = applyTranscriptEvent(entries, {
      type: 'tool.end',
      agentId: 'a',
      callId: 'call-1',
      ok: true,
      result: '12 lines',
      at: 150,
    });
    expect(entries[0]!.tool).toMatchObject({ state: 'ok', result: '12 lines', startedAt: 100, endedAt: 150 });

    const failed = applyTranscriptEvent(
      applyTranscriptEvent([], { type: 'tool.start', agentId: 'a', callId: 'call-2', name: 'bash:execute', args: 'false', at: 1 }),
      { type: 'tool.end', agentId: 'a', callId: 'call-2', ok: false, result: 'exit 1', at: 2 },
    );
    expect(failed[0]!.tool).toMatchObject({ state: 'failed', result: 'exit 1' });
  });

  it('ignores late, foreign and mismatched tool.end events', () => {
    const late = applyTranscriptEvent([], { type: 'tool.end', agentId: 'a', callId: 'missing', ok: true, at: 1 });
    expect(late).toEqual([]);

    let entries: AgentTranscriptEntry[] = applyTranscriptEvent([], {
      type: 'tool.start',
      agentId: 'a',
      callId: 'call-1',
      name: 'file:read',
      args: 'src/a.ts',
      at: 1,
    });
    entries = applyTranscriptEvent(entries, { type: 'tool.end', agentId: 'a', callId: 'other', ok: true, at: 2 });
    entries = applyTranscriptEvent(entries, { type: 'tool.end', agentId: 'b', callId: 'call-1', ok: true, at: 3 });
    expect(entries[0]!.tool).toMatchObject({ state: 'running' });
    expect(entries[0]!.tool!.result).toBeUndefined();
    expect(entries[0]!.tool!.endedAt).toBeUndefined();
  });

  it('deduplicates status transitions but keeps real changes', () => {
    let entries: AgentTranscriptEntry[] = [];
    entries = applyTranscriptEvent(entries, { type: 'status', agentId: 'a', status: 'running', at: 1 });
    entries = applyTranscriptEvent(entries, { type: 'status', agentId: 'a', status: 'running', at: 2 });
    entries = applyTranscriptEvent(entries, userEvent('a', 'hello', 3));
    entries = applyTranscriptEvent(entries, { type: 'status', agentId: 'a', status: 'running', at: 4 });
    expect(entries.filter((entry) => entry.kind === 'status').map((entry) => entry.text)).toEqual(['running']);

    entries = applyTranscriptEvent(entries, { type: 'status', agentId: 'a', status: 'running', detail: 'working', at: 5 });
    entries = applyTranscriptEvent(entries, { type: 'status', agentId: 'a', status: 'running', detail: 'working', at: 6 });
    entries = applyTranscriptEvent(entries, { type: 'status', agentId: 'a', status: 'completed', at: 7 });
    entries = applyTranscriptEvent(entries, { type: 'status', agentId: 'a', status: 'running', at: 8 });

    expect(entries.filter((entry) => entry.kind === 'status').map((entry) => entry.text)).toEqual([
      'running',
      'running · working',
      'completed',
      'running',
    ]);
  });

  it('deduplicates status entries per agent only', () => {
    let entries: AgentTranscriptEntry[] = [];
    entries = applyTranscriptEvent(entries, { type: 'status', agentId: 'a', status: 'running', at: 1 });
    entries = applyTranscriptEvent(entries, { type: 'status', agentId: 'b', status: 'running', at: 2 });
    expect(entries).toHaveLength(2);
  });

  it('finalizes any streaming assistant entry when an error arrives for that agent', () => {
    let entries: AgentTranscriptEntry[] = [];
    entries = applyTranscriptEvent(entries, { type: 'assistant.start', agentId: 'a', messageId: 'm1', at: 1 });
    entries = applyTranscriptEvent(entries, { type: 'assistant.delta', agentId: 'a', messageId: 'm1', text: 'partial', at: 2 });
    entries = applyTranscriptEvent(entries, { type: 'assistant.start', agentId: 'b', messageId: 'm2', at: 3 });

    entries = applyTranscriptEvent(entries, { type: 'error', agentId: 'a', message: 'provider failed', at: 4 });
    const aAssistant = entries.find((entry) => entry.agentId === 'a' && entry.kind === 'assistant')!;
    const bAssistant = entries.find((entry) => entry.agentId === 'b' && entry.kind === 'assistant')!;

    expect(aAssistant).toMatchObject({ text: 'partial', streaming: false });
    expect(bAssistant.streaming).toBe(true);
    expect(entries.at(-1)).toMatchObject({ agentId: 'a', kind: 'error', text: 'provider failed' });
  });

  it('caps entries at 500 including a single truncated marker', () => {
    let entries: AgentTranscriptEntry[] = [];
    for (let index = 0; index < 600; index++) {
      entries = applyTranscriptEvent(entries, userEvent('a', `message ${index}`, index));
    }

    expect(entries).toHaveLength(MAX_TRANSCRIPT_ENTRIES);
    expect(entries.filter((entry) => entry.kind === 'truncated')).toHaveLength(1);
    expect(entries[0]!.kind).toBe('truncated');
    expect(entries[0]!.text).toContain('Older activity was dropped');
    expect(entries[1]!.text).toBe('message 101');
    expect(entries.at(-1)!.text).toBe('message 599');

    entries = applyTranscriptEvent(entries, userEvent('a', 'message 600', 600));
    expect(entries).toHaveLength(MAX_TRANSCRIPT_ENTRIES);
    expect(entries.filter((entry) => entry.kind === 'truncated')).toHaveLength(1);
    expect(entries.at(-1)!.text).toBe('message 600');
  });

  it('caps total text bytes per agent and keeps one truncation marker', () => {
    let entries: AgentTranscriptEntry[] = [];
    for (let index = 0; index < 40; index++) {
      entries = applyTranscriptEvent(entries, userEvent('a', 'x'.repeat(8_000), index));
    }

    expect(entries[0]!.kind).toBe('truncated');
    expect(entries.filter((entry) => entry.kind === 'truncated')).toHaveLength(1);
    expect(bytesOf(entries)).toBeLessThanOrEqual(MAX_TRANSCRIPT_BYTES_PER_AGENT);
    expect(entries.length).toBeLessThan(MAX_TRANSCRIPT_ENTRIES);
    expect(entries.at(-1)!.text).toBe('x'.repeat(8_000));
  });

  it('caps each entry text, tool args and tool result at 8,000 characters', () => {
    const long = 'y'.repeat(9_000);
    const user = applyTranscriptEvent([], userEvent('a', long, 1));
    expect(user[0]!.text).toHaveLength(MAX_TRANSCRIPT_TEXT);
    expect(user[0]!.text.endsWith('…')).toBe(true);

    let tool: AgentTranscriptEntry[] = applyTranscriptEvent([], {
      type: 'tool.start',
      agentId: 'a',
      callId: 'c1',
      name: 'bash:execute',
      args: long,
      at: 2,
    });
    expect(tool[0]!.tool!.args).toHaveLength(MAX_TRANSCRIPT_TEXT);
    expect(tool[0]!.tool!.args.endsWith('…')).toBe(true);
    expect(tool[0]!.text).toHaveLength(MAX_TRANSCRIPT_TEXT);

    tool = applyTranscriptEvent(tool, { type: 'tool.end', agentId: 'a', callId: 'c1', ok: true, result: long, at: 3 });
    expect(tool[0]!.tool!.result).toHaveLength(MAX_TRANSCRIPT_TEXT);
    expect(tool[0]!.tool!.result!.endsWith('…')).toBe(true);
  });

  it('keeps caps per agent', () => {
    let a: AgentTranscriptEntry[] = [];
    for (let index = 0; index < 600; index++) a = applyTranscriptEvent(a, userEvent('a', `a${index}`, index));
    const b = applyTranscriptEvent([], userEvent('b', 'only one', 1));

    expect(a).toHaveLength(MAX_TRANSCRIPT_ENTRIES);
    expect(b).toHaveLength(1);
    expect(b[0]!.kind).toBe('user');
  });
});

describe('summarizeToolArgs', () => {
  it('summarizes the meaningful argument per tool family on one line', () => {
    expect(summarizeToolArgs('bash:execute', { command: 'bun   test\n--run' })).toBe('bun test --run');
    expect(summarizeToolArgs('file:read', { path: 'src/main.ts' })).toBe('src/main.ts');
    expect(summarizeToolArgs('file:glob', { pattern: '**/*.ts', path: 'src' })).toBe('**/*.ts in src');
    expect(summarizeToolArgs('grep', { pattern: 'TODO', path: 'src' })).toBe('TODO in src');
    expect(summarizeToolArgs('agent:delegate', { agent: 'test-agent', task: 'run the suite' })).toBe(
      'test-agent: run the suite',
    );
  });

  it('falls back to compact JSON and clips long summaries', () => {
    expect(summarizeToolArgs('custom:tool', { url: 'https://example.test' })).toBe('https://example.test');
    expect(summarizeToolArgs('custom:tool', { alpha: 1, beta: true })).toBe('{"alpha":1,"beta":true}');
    expect([...summarizeToolArgs('bash:execute', { command: 'z'.repeat(400) })]).toHaveLength(160);
  });
});

describe('createAgentTranscriptStore', () => {
  it('isolates agents and keeps a hidden agent snapshot current', () => {
    const store = createAgentTranscriptStore();
    store.append(userEvent('a', 'for agent a', 1));
    store.append(userEvent('b', 'for agent b', 2));

    const aBefore = store.get('a');
    expect(aBefore.map((entry) => entry.text)).toEqual(['for agent a']);
    expect(store.get('b').map((entry) => entry.text)).toEqual(['for agent b']);

    store.append(userEvent('b', 'background update', 3));
    store.append({ type: 'assistant.start', agentId: 'b', messageId: 'm1', at: 4 });
    store.append({ type: 'assistant.delta', agentId: 'b', messageId: 'm1', text: 'streaming', at: 5 });

    expect(store.get('a')).toEqual(aBefore);
    expect(store.get('b').map((entry) => entry.text)).toEqual(['for agent b', 'background update', 'streaming']);
    expect(store.get('b').every((entry) => entry.agentId === 'b')).toBe(true);
  });

  it('returns an empty snapshot for an unknown agent and a copy for every read', () => {
    const store = createAgentTranscriptStore();
    expect(store.get('missing')).toEqual([]);
    store.append(userEvent('a', 'one', 1));

    const snapshot = store.get('a');
    expect(store.get('a')).not.toBe(snapshot);
    (snapshot as AgentTranscriptEntry[]).push({
      id: 'fake',
      agentId: 'a',
      kind: 'user',
      at: 2,
      text: 'injected',
    });
    expect(store.get('a').map((entry) => entry.text)).toEqual(['one']);
  });

  it('notifies subscribers with the affected agent id and stops after unsubscribe', () => {
    const store = createAgentTranscriptStore();
    const seen: string[] = [];
    const unsubscribe = store.subscribe((agentId) => seen.push(agentId));

    store.append(userEvent('a', 'one', 1));
    store.append(userEvent('b', 'two', 2));
    store.append({ type: 'assistant.start', agentId: 'a', messageId: 'm1', at: 3 });
    expect(seen).toEqual(['a', 'b', 'a']);

    unsubscribe();
    store.append(userEvent('a', 'three', 4));
    expect(seen).toEqual(['a', 'b', 'a']);
    expect(() => unsubscribe()).not.toThrow();
  });

  it('isolates a throwing subscriber so later listeners still run', () => {
    const store = createAgentTranscriptStore();
    const seen: string[] = [];
    store.subscribe(() => {
      throw new Error('broken view');
    });
    store.subscribe((agentId) => seen.push(agentId));

    expect(() => store.append(userEvent('a', 'one', 1))).not.toThrow();
    expect(seen).toEqual(['a']);
  });

  it('clears one agent or all agents and notifies only when something changed', () => {
    const store = createAgentTranscriptStore();
    const seen: string[] = [];
    store.subscribe((agentId) => seen.push(agentId));
    store.append(userEvent('a', 'one', 1));
    store.append(userEvent('b', 'two', 2));
    seen.length = 0;

    store.clearAgent('missing');
    expect(seen).toEqual([]);

    store.clearAgent('a');
    expect(store.get('a')).toEqual([]);
    expect(seen).toEqual(['a']);

    store.clearAll();
    expect(store.get('a')).toEqual([]);
    expect(store.get('b')).toEqual([]);
    expect(seen).toEqual(['a', 'b']);
  });

  it('notifies on every streaming update and exposes the finalized entry', () => {
    const store = createAgentTranscriptStore();
    const seen: string[] = [];
    store.subscribe((agentId) => seen.push(agentId));

    store.append({ type: 'assistant.start', agentId: 'a', messageId: 'm1', at: 1 });
    store.append({ type: 'assistant.delta', agentId: 'a', messageId: 'm1', text: 'stream', at: 2 });
    store.append({ type: 'assistant.end', agentId: 'a', messageId: 'm1', finalText: 'done', at: 3 });

    expect(seen).toEqual(['a', 'a', 'a']);
    expect(store.get('a')[0]).toMatchObject({ kind: 'assistant', text: 'done', streaming: false });
  });
});
