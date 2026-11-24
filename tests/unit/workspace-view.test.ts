import { describe, expect, it } from 'vitest';
import {
  agentStatusGlyph,
  agentStatusLabel,
  formatAgentRow,
  formatComposerPlaceholder,
  formatComposerPrefix,
  formatContentStatus,
  reduceWorkspaceKey,
  routeComposerInput,
  transcriptToUiEntries,
  type AgentRow,
  type WorkspaceKeyState,
} from '../../src/ui/workspace-view.js';
import type { AgentTreeNode, WorkspaceStatus } from '../../src/runtime/agent-tree.js';
import { createAgentTranscriptStore, type AgentTranscriptEntry } from '../../src/runtime/agent-transcript.js';
import { MAIN_AGENT_ID } from '../../src/runtime/subagents.js';

const usage = { promptTokens: 900, completionTokens: 300, totalTokens: 1_200 };
const now = 1_700_000_300_000;
const startedAt = 1_700_000_000_000;

const node = (over: Partial<AgentTreeNode> = {}): AgentTreeNode => ({
  id: 'req-abcdef123456',
  name: 'frontend-expert',
  kind: 'subagent',
  parentId: 'main',
  depth: 1,
  status: 'running',
  activity: 'editing src/ui/tui.tsx',
  task: 'implement the navigator',
  startedAt,
  childCount: 0,
  activeChildCount: 0,
  queued: 0,
  duplicateName: false,
  ...over,
});

const mainNode = (over: Partial<AgentTreeNode> = {}): AgentTreeNode =>
  node({ id: MAIN_AGENT_ID, name: MAIN_AGENT_ID, kind: 'main', parentId: null, depth: 0, ...over });

/** Reconstruct exactly what the TUI renders for one row: marker/connector, glyph, name, metadata. */
const rowLine = (row: AgentRow): string =>
  row.prefix + row.glyph + ' ' + row.label + row.segments.map((segment) => ' · ' + segment.text).join('');

const cellLength = (text: string): number => [...text].length;

const treeNodes = (): AgentTreeNode[] => [
  mainNode({ status: 'running', activity: 'working' }),
  node({ id: 'a', name: 'frontend-expert', depth: 1, parentId: 'main' }),
  node({ id: 'b', name: 'test-agent', depth: 1, parentId: 'main' }),
];

describe('agent status glyphs and labels', () => {
  it('maps every workspace status to its contract glyph and label', () => {
    const glyphs: Record<WorkspaceStatus, string> = {
      idle: '○',
      running: '◐',
      waiting: '◔',
      completed: '✓',
      failed: '✗',
      stopped: '!',
    };
    const labels: Record<WorkspaceStatus, string> = {
      idle: 'Idle',
      running: 'Running',
      waiting: 'Waiting',
      completed: 'Completed',
      failed: 'Failed',
      stopped: 'Stopped',
    };

    for (const status of Object.keys(glyphs) as WorkspaceStatus[]) {
      expect(agentStatusGlyph(status)).toBe(glyphs[status]);
      expect(agentStatusLabel(status)).toBe(labels[status]);
      expect(agentStatusLabel(status)).not.toBe('Thinking');
    }
  });
});

describe('formatAgentRow', () => {
  it('marks the selected row and labels main without an @ prefix', () => {
    const selected = formatAgentRow(mainNode(), { width: 100, now, selected: true });
    const unselected = formatAgentRow(mainNode(), { width: 100, now, selected: false });

    expect(selected).toMatchObject({ marker: '▸ ', selected: true, label: 'main', prefix: '▸ ' });
    expect(unselected).toMatchObject({ marker: '  ', selected: false, prefix: '  ' });
    expect(selected.label.startsWith('@')).toBe(false);
  });

  it('renders the status glyph and label for every status without inventing Thinking', () => {
    for (const status of ['idle', 'running', 'waiting', 'completed', 'failed', 'stopped'] as WorkspaceStatus[]) {
      const row = formatAgentRow(node({ status, endedAt: now - 60_000 }), { width: 120, now, selected: false });
      expect(row.glyph).toBe(agentStatusGlyph(status));
      expect(row.meta.startsWith(agentStatusLabel(status))).toBe(true);
      expect(row.role).toBe(status);
      expect(row.meta).not.toContain('Thinking');
    }
  });

  it('indents nested rows with connectors and keeps the marker in the prefix', () => {
    expect(formatAgentRow(node({ depth: 0, parentId: null, kind: 'main', name: MAIN_AGENT_ID }), { width: 100, now, selected: true })).toMatchObject({
      connector: '',
      prefix: '▸ ',
    });
    expect(formatAgentRow(node({ depth: 1 }), { width: 100, now, selected: false, lastSibling: false })).toMatchObject({
      connector: '├ ',
      prefix: '  ├ ',
    });
    expect(formatAgentRow(node({ depth: 1 }), { width: 100, now, selected: false, lastSibling: true })).toMatchObject({
      connector: '└ ',
      prefix: '  └ ',
    });
    expect(formatAgentRow(node({ depth: 2 }), { width: 100, now, selected: true })).toMatchObject({
      connector: '  └ ',
      prefix: '▸   └ ',
    });
    expect(formatAgentRow(node({ depth: 3 }), { width: 100, now, selected: false, lastSibling: false }).connector).toBe('    ├ ');
  });

  it('appends the first six id characters only when a sibling name is duplicated', () => {
    const duplicated = formatAgentRow(node({ duplicateName: true }), { width: 120, now, selected: false });
    const unique = formatAgentRow(node({ duplicateName: false }), { width: 120, now, selected: false });
    const narrow = formatAgentRow(node({ duplicateName: true }), { width: 38, now, selected: false });

    expect(duplicated.label).toBe('frontend-expert#req-ab');
    expect(unique.label).toBe('frontend-expert');
    expect(narrow.label.endsWith('#req-ab')).toBe(true);
  });

  it('renders only real metadata and never fabricates tokens, times or queue counts', () => {
    const live = formatAgentRow(node({ status: 'running', usage: undefined, queued: 0 }), { width: 200, now, selected: false });
    expect(live.meta).toContain('Running');
    expect(live.meta).toContain('editing src/ui/tui.tsx');
    expect(live.meta).toContain('since ');
    expect(live.meta).not.toContain('tok');
    expect(live.meta).not.toContain('queued');

    const stopped = formatAgentRow(node({ status: 'stopped', endedAt: undefined, usage: undefined }), {
      width: 200,
      now,
      selected: false,
    });
    expect(stopped.meta).toBe('Stopped');

    const completed = formatAgentRow(node({ status: 'completed', endedAt: undefined, usage: undefined }), {
      width: 200,
      now,
      selected: false,
    });
    expect(completed.meta).toBe('Completed · implement the navigator');

    const withUsage = formatAgentRow(node({ status: 'completed', endedAt: startedAt + 60_000, usage }), {
      width: 200,
      now,
      selected: false,
    });
    expect(withUsage.meta).toBe('Completed · implement the navigator · 1m00s · 1.2k tok');

    const mainIdle = formatAgentRow(mainNode({ status: 'idle', startedAt, task: '' }), { width: 200, now, selected: false });
    expect(mainIdle.meta).toBe('Idle');
  });

  it('drops optional metadata in the documented priority order as the row narrows', () => {
    const main = mainNode({
      status: 'running',
      activity: 'working',
      task: 'fix the failing tests in the runtime module',
      activeChildCount: 2,
      queued: 2,
      usage,
    });
    const opts = { now, selected: true, activeAgentName: 'project-manager' };

    const wide = formatAgentRow(main, { ...opts, width: 200 });
    expect(wide.meta).toContain('Running');
    expect(wide.meta).toContain('project-manager');
    expect(wide.meta).toContain('fix the failing tests in the runtime module');
    expect(wide.meta).toContain('waiting on 2 subagents');
    expect(wide.meta).toContain('since ');
    expect(wide.meta).toContain('1.2k tok');
    expect(wide.meta).toContain('2 queued');

    const at140 = formatAgentRow(main, { ...opts, width: 140 });
    expect(at140.meta).not.toContain('tok');
    expect(at140.meta).toContain('project-manager');
    expect(at140.meta).toContain('fix the failing tests in the runtime module');
    expect(at140.meta).toContain('waiting on 2 subagents');
    expect(at140.meta).toContain('since ');
    expect(at140.meta).toContain('2 queued');

    const at120 = formatAgentRow(main, { ...opts, width: 120 });
    expect(at120.meta).not.toContain('tok');
    expect(at120.meta).not.toContain('since ');
    expect(at120.meta).toContain('project-manager');
    expect(at120.meta).toContain('fix the failing tests in the runtime module');
    expect(at120.meta).toContain('waiting on 2 subagents');

    const at100 = formatAgentRow(main, { ...opts, width: 100 });
    expect(at100.meta).not.toContain('fix the failing tests');
    expect(at100.meta).toContain('project-manager');
    expect(at100.meta).toContain('waiting on 2 subagents');
    expect(at100.meta).toContain('2 queued');

    const at60 = formatAgentRow(main, { ...opts, width: 60 });
    expect(at60.meta).not.toContain('project-manager');
    expect(at60.meta).not.toContain('fix the failing tests');
    expect(at60.meta).toContain('waiting on 2 subagents');
    expect(at60.meta).toContain('2 queued');

    const at50 = formatAgentRow(main, { ...opts, width: 50 });
    expect(at50.meta).toContain('waiting on 2 suba…');
    expect(at50.meta).toContain('2 queued');
    expect(cellLength(rowLine(at50))).toBeLessThanOrEqual(50);
  });

  it('truncates to the available width without wrapping', () => {
    const statuses: WorkspaceStatus[] = ['idle', 'running', 'waiting', 'completed', 'failed', 'stopped'];
    const simple = node({
      name: 'test-agent',
      activity: 'running the unit tests',
      task: 'run the suite',
      endedAt: startedAt + 60_000,
      error: 'provider returned 401',
      usage,
    });

    for (let width = 38; width <= 120; width++) {
      for (const status of statuses) {
        const row = formatAgentRow({ ...simple, status }, { width, now, selected: true });
        const line = rowLine(row);
        expect(line).not.toContain('\n');
        expect(cellLength(line)).toBeLessThanOrEqual(width);
        expect(row.label.length).toBeGreaterThan(0);
      }
    }

    const stress = node({
      name: 'a-very-long-agent-name-indeed',
      status: 'failed',
      duplicateName: true,
      queued: 9,
      endedAt: startedAt + 60_000,
      error: 'provider returned 401 because the key is invalid',
      usage,
    });
    for (let width = 48; width <= 120; width++) {
      const line = rowLine(formatAgentRow(stress, { width, now, selected: true }));
      expect(line).not.toContain('\n');
      expect(cellLength(line)).toBeLessThanOrEqual(width);
    }

    for (const width of [20, 30, 38]) {
      expect(rowLine(formatAgentRow(simple, { width, now, selected: false }))).not.toContain('\n');
    }
  });
});

describe('formatContentStatus', () => {
  it('shows the main idle state without inventing elapsed time or tokens', () => {
    const segments = formatContentStatus(mainNode({ status: 'idle', activity: 'ready' }), { now, width: 200 });

    expect(segments.map((segment) => segment.text).join('')).toBe('@main · Idle · ready');
    expect(segments[0]).toMatchObject({ text: '@main', role: 'accent' });
    expect(segments.some((segment) => segment.role === 'separator')).toBe(true);
    expect(segments.map((segment) => segment.text).join('')).not.toContain('tok');
  });

  it('shows real elapsed time and tokens for a live main turn', () => {
    const text = formatContentStatus(mainNode({ status: 'running', activity: 'working', usage }), {
      now: startedAt + 300_000,
      width: 200,
    })
      .map((segment) => segment.text)
      .join('');

    expect(text).toBe('@main · Running · working · 5m00s · 1.2k tok');
  });

  it('maps live, completed, failed and stopped sub-agent details correctly', () => {
    const live = formatContentStatus(node({ status: 'running' }), { now, width: 200 })
      .map((segment) => segment.text)
      .join('');
    expect(live).toMatch(/^@frontend-expert · Running · editing src\/ui\/tui\.tsx · since \d{2}:\d{2}$/);

    const completed = formatContentStatus(node({ status: 'completed', endedAt: startedAt + 60_000 }), {
      now,
      width: 200,
    })
      .map((segment) => segment.text)
      .join('');
    expect(completed).toBe('@frontend-expert · Completed · implement the navigator · 1m00s');

    const failedSegments = formatContentStatus(node({ status: 'failed', error: 'provider returned 401' }), {
      now,
      width: 200,
    });
    expect(failedSegments.map((segment) => segment.text).join('')).toBe('@frontend-expert · Failed · provider returned 401');
    expect(failedSegments.find((segment) => segment.text.includes('provider'))?.role).toBe('error');

    const stopped = formatContentStatus(node({ status: 'stopped', endedAt: undefined }), { now, width: 200 })
      .map((segment) => segment.text)
      .join('');
    expect(stopped).toBe('@frontend-expert · Stopped');
  });

  it('drops tokens, then elapsed, as the status row narrows', () => {
    const main = mainNode({ status: 'running', activity: 'working', usage });
    const at = (width: number): string =>
      formatContentStatus(main, { now: startedAt + 300_000, width })
        .map((segment) => segment.text)
        .join('');

    expect(at(60)).toContain('1.2k tok');
    expect(at(60)).toContain('5m00s');
    expect(at(40)).not.toContain('tok');
    expect(at(40)).toContain('5m00s');
    expect(at(30)).not.toContain('tok');
    expect(at(30)).not.toContain('5m00s');
    expect(at(30)).toBe('@main · Running · working');
  });

  it('fits the available width without wrapping', () => {
    const stress = node({
      name: 'a-very-long-agent-name-indeed',
      status: 'failed',
      error: 'provider returned 401 because the key is invalid',
      endedAt: startedAt + 60_000,
      usage,
    });
    for (let width = 24; width <= 120; width++) {
      const text = formatContentStatus(stress, { now, width })
        .map((segment) => segment.text)
        .join('');
      expect(text).not.toContain('\n');
      expect(cellLength(text)).toBeLessThanOrEqual(width);
    }
  });
});

describe('routeComposerInput', () => {
  const route = (over: Partial<Parameters<typeof routeComposerInput>[0]> = {}) =>
    routeComposerInput({
      text: 'hello',
      selectedAgentId: MAIN_AGENT_ID,
      knownAgentIds: [MAIN_AGENT_ID, 'agent-1'],
      mainAwaitingInput: true,
      ...over,
    });

  it('rejects empty input', () => {
    expect(route({ text: '' })).toMatchObject({ kind: 'reject', reason: 'empty' });
    expect(route({ text: '   \n ' })).toMatchObject({ kind: 'reject', reason: 'empty' });
  });

  it('sends main text to the REPL only while it awaits input and queues it while busy', () => {
    expect(route()).toEqual({ kind: 'repl' });
    expect(route({ mainAwaitingInput: false, text: '  hello  ' })).toEqual({
      kind: 'agent',
      agentId: MAIN_AGENT_ID,
    });
  });

  it('targets the selected sub-agent by id even while main awaits input', () => {
    expect(route({ selectedAgentId: 'agent-1' })).toEqual({ kind: 'agent', agentId: 'agent-1' });
    expect(route({ selectedAgentId: 'agent-1', mainAwaitingInput: false })).toEqual({
      kind: 'agent',
      agentId: 'agent-1',
    });
  });

  it('rejects an unknown selected id and never redirects', () => {
    const result = route({ selectedAgentId: 'ghost' });
    expect(result).toMatchObject({ kind: 'reject', reason: 'unknown_agent' });
    expect((result as { message: string }).message).toContain('"ghost"');
  });

  it('keeps slash commands and exit/quit in the main REPL while it is idle', () => {
    for (const text of ['/help', '/model gpt', 'exit', 'quit']) {
      expect(route({ text })).toEqual({ kind: 'repl' });
    }
    expect(route({ text: '/help', selectedAgentId: 'agent-1' })).toEqual({ kind: 'repl' });
  });

  it('rejects commands while main is busy instead of routing them to a sub-agent', () => {
    for (const text of ['/help', 'exit', 'quit']) {
      const result = route({ text, mainAwaitingInput: false });
      expect(result).toMatchObject({ kind: 'reject', reason: 'command_while_busy' });
    }
    const selectedSub = route({ text: '/help', selectedAgentId: 'agent-1', mainAwaitingInput: false });
    expect(selectedSub).toMatchObject({ kind: 'reject', reason: 'command_while_busy' });
  });
});

describe('reduceWorkspaceKey', () => {
  const navigator = (selectedAgentId = MAIN_AGENT_ID): WorkspaceKeyState => ({
    focus: 'navigator',
    selectedAgentId,
  });
  const composer = (selectedAgentId = MAIN_AGENT_ID): WorkspaceKeyState => ({
    focus: 'composer',
    selectedAgentId,
  });

  it('enters navigator focus from the composer and arms the stop-all chord', () => {
    const result = reduceWorkspaceKey(composer(), 'ctrl+x', { nodes: treeNodes(), now: 1_000 });

    expect(result).toEqual({
      state: { focus: 'navigator', selectedAgentId: MAIN_AGENT_ID, leaderArmedAt: 1_000 },
      action: 'none',
      consumed: true,
    });
  });

  it('moves the selection with arrows, clamped and without wrapping', () => {
    const down = (state: WorkspaceKeyState) => reduceWorkspaceKey(state, 'down', { nodes: treeNodes(), now: 1_000 });
    const up = (state: WorkspaceKeyState) => reduceWorkspaceKey(state, 'up', { nodes: treeNodes(), now: 1_000 });

    expect(down(navigator()).state.selectedAgentId).toBe('a');
    expect(down(down(navigator()).state).state.selectedAgentId).toBe('b');
    expect(down(down(down(navigator()).state).state).state.selectedAgentId).toBe('b');
    expect(up(navigator('b')).state.selectedAgentId).toBe('a');
    expect(up(up(navigator('b')).state).state.selectedAgentId).toBe(MAIN_AGENT_ID);
    expect(up(up(up(navigator('b')).state).state).state.selectedAgentId).toBe(MAIN_AGENT_ID);
    expect(down(navigator()).consumed).toBe(true);
    expect(down(navigator()).state.leaderArmedAt).toBeUndefined();
  });

  it('focuses the composer on Enter without changing the selected agent', () => {
    const result = reduceWorkspaceKey(navigator('a'), 'enter', { nodes: treeNodes(), now: 1_000 });

    expect(result).toEqual({
      state: { focus: 'composer', selectedAgentId: 'a', leaderArmedAt: undefined },
      action: 'none',
      consumed: true,
    });
  });

  it('walks Escape up to the parent and only then focuses the composer', () => {
    const nested = [
      ...treeNodes(),
      node({ id: 'c', name: 'nested-agent', parentId: 'a', depth: 2 }),
    ];

    const fromChild = reduceWorkspaceKey(navigator('c'), 'escape', { nodes: nested, now: 1_000 });
    expect(fromChild.state).toMatchObject({ focus: 'navigator', selectedAgentId: 'a' });
    expect(fromChild.consumed).toBe(true);

    const fromDepthOne = reduceWorkspaceKey(navigator('a'), 'escape', { nodes: nested, now: 1_000 });
    expect(fromDepthOne.state).toMatchObject({ focus: 'navigator', selectedAgentId: MAIN_AGENT_ID });

    const atMain = reduceWorkspaceKey(navigator(), 'escape', { nodes: nested, now: 1_000 });
    expect(atMain.state).toEqual({ focus: 'composer', selectedAgentId: MAIN_AGENT_ID, leaderArmedAt: undefined });
    expect(atMain.consumed).toBe(true);
  });

  it('reports stop_all only for Ctrl+K inside the 1,500 ms leader window', () => {
    const armed = reduceWorkspaceKey(navigator(), 'ctrl+x', { nodes: treeNodes(), now: 1_000 });

    const inside = reduceWorkspaceKey(armed.state, 'ctrl+k', { nodes: treeNodes(), now: 2_500 });
    expect(inside.action).toBe('stop_all');
    expect(inside.consumed).toBe(true);
    expect(inside.state.leaderArmedAt).toBeUndefined();

    const after = reduceWorkspaceKey(armed.state, 'ctrl+k', { nodes: treeNodes(), now: 2_501 });
    expect(after.action).toBe('none');
    expect(after.consumed).toBe(false);
    expect(after.state.leaderArmedAt).toBeUndefined();

    const custom = reduceWorkspaceKey(armed.state, 'ctrl+k', { nodes: treeNodes(), now: 1_500, leaderWindowMs: 500 });
    expect(custom.action).toBe('stop_all');
    const customAfter = reduceWorkspaceKey(armed.state, 'ctrl+k', { nodes: treeNodes(), now: 1_501, leaderWindowMs: 500 });
    expect(customAfter.action).toBe('none');
  });

  it('does not stop all on plain Ctrl+K and disarms the chord on any other key', () => {
    expect(reduceWorkspaceKey(navigator(), 'ctrl+k', { nodes: treeNodes(), now: 1_000 })).toMatchObject({
      action: 'none',
      consumed: false,
    });

    const armed = reduceWorkspaceKey(navigator(), 'ctrl+x', { nodes: treeNodes(), now: 1_000 });
    const disarmed = reduceWorkspaceKey(armed.state, 'other', { nodes: treeNodes(), now: 1_100 });
    expect(disarmed.state.leaderArmedAt).toBeUndefined();
    expect(disarmed.consumed).toBe(false);
    expect(reduceWorkspaceKey(disarmed.state, 'ctrl+k', { nodes: treeNodes(), now: 1_200 }).action).toBe('none');

    const moved = reduceWorkspaceKey(armed.state, 'down', { nodes: treeNodes(), now: 1_100 });
    expect(moved.state.leaderArmedAt).toBeUndefined();
    expect(moved.state.selectedAgentId).toBe('a');
  });

  it('never consumes navigation keys while the composer has focus', () => {
    for (const key of ['up', 'down', 'enter', 'escape', 'ctrl+k', 'other'] as const) {
      const result = reduceWorkspaceKey(composer('a'), key, { nodes: treeNodes(), now: 1_000 });
      expect(result).toMatchObject({ action: 'none', consumed: false, state: { focus: 'composer', selectedAgentId: 'a' } });
    }

    const stale = reduceWorkspaceKey({ ...composer('a'), leaderArmedAt: 900 }, 'ctrl+k', {
      nodes: treeNodes(),
      now: 1_000,
    });
    expect(stale).toMatchObject({ action: 'none', consumed: false });
    expect(stale.state.leaderArmedAt).toBeUndefined();
  });

  it('reconciles an id that disappeared before moving or escaping', () => {
    const moved = reduceWorkspaceKey(navigator('gone'), 'down', { nodes: treeNodes(), now: 1_000 });
    expect(moved.state.selectedAgentId).toBe('a');

    const escaped = reduceWorkspaceKey(navigator('gone'), 'escape', { nodes: treeNodes(), now: 1_000 });
    expect(escaped.state).toEqual({ focus: 'composer', selectedAgentId: MAIN_AGENT_ID, leaderArmedAt: undefined });
  });
});

describe('transcriptToUiEntries', () => {
  const entry = (over: Partial<AgentTranscriptEntry>): AgentTranscriptEntry => ({
    id: '1:agent',
    agentId: 'agent',
    kind: 'user',
    at: 1,
    text: '',
    ...over,
  });

  it('maps user and assistant entries with the agent label and preserves streaming', () => {
    const mapped = transcriptToUiEntries(
      [
        entry({ id: '1:agent', kind: 'user', text: 'please fix it' }),
        entry({ id: '2:agent', kind: 'assistant', text: '**working**', streaming: true, messageId: 'm1' }),
      ],
      'frontend-expert',
    );

    expect(mapped).toEqual([
      { id: 1, kind: 'user', content: 'please fix it', agentLabel: 'frontend-expert' },
      { id: 2, kind: 'markdown', content: '**working**', streaming: true, agentLabel: 'frontend-expert' },
    ]);
  });

  it('maps tool start/end lines, including dim continuation output', () => {
    const running = transcriptToUiEntries(
      [
        entry({
          kind: 'tool',
          text: 'file:edit(src/a.ts)',
          tool: { callId: 'c1', name: 'file:edit', args: 'src/a.ts', state: 'running', startedAt: 1 },
        }),
      ],
      'frontend-expert',
    );
    expect(running).toEqual([{ id: 1, kind: 'tool', content: '● file:edit(src/a.ts)' }]);

    const ok = transcriptToUiEntries(
      [
        entry({
          kind: 'tool',
          text: 'file:edit(src/a.ts)',
          tool: {
            callId: 'c1',
            name: 'file:edit',
            args: 'src/a.ts',
            state: 'ok',
            result: '\n\nfirst line\nsecond line\n',
            startedAt: 1,
            endedAt: 2,
          },
        }),
      ],
      'frontend-expert',
    );
    expect(ok).toEqual([
      { id: 1, kind: 'tool', content: '● file:edit(src/a.ts)' },
      { id: 2, kind: 'success', content: '⎿ ✓ first line' },
      { id: 3, kind: 'dim', content: '     second line' },
      { id: 4, kind: 'dim', content: '     ' },
    ]);

    const failed = transcriptToUiEntries(
      [
        entry({
          kind: 'tool',
          text: 'bash:execute(bun test)',
          tool: {
            callId: 'c2',
            name: 'bash:execute',
            args: 'bun test',
            state: 'failed',
            result: 'EACCES\nsee the logs',
            startedAt: 1,
            endedAt: 2,
          },
        }),
      ],
      'frontend-expert',
    );
    expect(failed).toEqual([
      { id: 1, kind: 'tool', content: '● bash:execute(bun test)' },
      { id: 2, kind: 'error', content: '⎿ ✗ EACCES' },
      { id: 3, kind: 'dim', content: '     see the logs' },
    ]);
  });

  it('does not invent a result line for a running or result-less tool', () => {
    const mapped = transcriptToUiEntries(
      [
        entry({
          kind: 'tool',
          text: 'file:read(src/a.ts)',
          tool: { callId: 'c1', name: 'file:read', args: 'src/a.ts', state: 'ok', startedAt: 1, endedAt: 2 },
        }),
        entry({ kind: 'tool', text: 'plain tool entry' }),
      ],
      'frontend-expert',
    );

    expect(mapped).toEqual([
      { id: 1, kind: 'tool', content: '● file:read(src/a.ts)' },
      { id: 2, kind: 'tool', content: '● plain tool entry' },
    ]);
  });

  it('maps status, error and truncation entries as dim/error lines', () => {
    const mapped = transcriptToUiEntries(
      [
        entry({ id: '1:a', kind: 'status', text: 'running · waiting for approval' }),
        entry({ id: '2:a', kind: 'status', text: 'completed' }),
        entry({ id: '3:a', kind: 'status', text: 'custom thing' }),
        entry({ id: '4:a', kind: 'error', text: 'boom\nstack trace' }),
        entry({ id: '5:a', kind: 'truncated', text: 'Older activity was dropped.' }),
      ],
      'frontend-expert',
    );

    expect(mapped).toEqual([
      { id: 1, kind: 'dim', content: '— Running · waiting for approval' },
      { id: 2, kind: 'dim', content: '— Completed' },
      { id: 3, kind: 'dim', content: '— custom thing' },
      { id: 4, kind: 'error', content: '✗ boom' },
      { id: 5, kind: 'dim', content: '— Older activity was dropped.' },
    ]);
  });

  it('returns an empty mapping for an empty transcript and numbers entries in order', () => {
    expect(transcriptToUiEntries([], 'frontend-expert')).toEqual([]);

    const mapped = transcriptToUiEntries(
      [
        entry({ id: '1:a', kind: 'user', text: 'one' }),
        entry({ id: '2:a', kind: 'assistant', text: 'two' }),
        entry({ id: '3:a', kind: 'user', text: 'three' }),
      ],
      'frontend-expert',
    );
    expect(mapped.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('never mixes another agent into the selected snapshot', () => {
    const store = createAgentTranscriptStore();
    store.append({ type: 'user', agentId: 'agent-a', text: 'for agent a', at: 1 });
    store.append({ type: 'user', agentId: 'agent-b', text: 'for agent b', at: 2 });
    store.append({ type: 'assistant.start', agentId: 'agent-a', messageId: 'm1', at: 3 });
    store.append({ type: 'assistant.delta', agentId: 'agent-a', messageId: 'm1', text: 'reply for a', at: 4 });
    store.append({ type: 'user', agentId: 'agent-b', text: 'more for agent b', at: 5 });

    const mapped = transcriptToUiEntries(store.get('agent-a'), 'frontend-expert');

    expect(mapped.map((item) => item.content)).toEqual(['for agent a', 'reply for a']);
    expect(mapped.every((item) => item.agentLabel === 'frontend-expert')).toBe(true);
    expect(mapped.map((item) => item.content).join(' ')).not.toContain('agent b');
  });
});

describe('composer prefix and placeholder', () => {
  it('updates the target label immediately with the selected agent', () => {
    expect(formatComposerPrefix(MAIN_AGENT_ID, 80)).toBe('@main ❯');
    expect(formatComposerPrefix('frontend-expert', 80)).toBe('@frontend-expert ❯');
    expect(formatComposerPrefix('frontend-expert', 80)).not.toBe(formatComposerPrefix(MAIN_AGENT_ID, 80));

    const prefixCells = [...formatComposerPrefix('frontend-expert', 80)].length + 1;
    expect(formatComposerPlaceholder('frontend-expert', 80, prefixCells)).toBe('Message @frontend-expert…');
    expect(formatComposerPlaceholder(MAIN_AGENT_ID, 80, 8)).toBe('Message @main…');
  });

  it('clips the prefix name and placeholder to the terminal width', () => {
    expect(formatComposerPrefix('a-very-long-agent-name-indeed', 80)).toBe('@a-very-long-agent-na… ❯');
    expect(formatComposerPrefix('a-very-long-agent-name-indeed', 80)).toHaveLength(24);
    expect(formatComposerPrefix('a-very-long-agent-name-indeed', 40)).toBe('@a-very-lon… ❯');
    expect(formatComposerPrefix('frontend-expert', 40)).toBe('@frontend-e… ❯');

    const narrowPrefixCells = [...formatComposerPrefix('a-very-long-agent-name-indeed', 40)].length + 1;
    const placeholder = formatComposerPlaceholder('a-very-long-agent-name-indeed', 40, narrowPrefixCells);
    expect(placeholder).toBe('Message @a-very-l…');
    expect(cellLength(placeholder)).toBeLessThanOrEqual(40);

    expect(formatComposerPlaceholder('frontend-expert', 30, 15)).toBe('Message…');
  });
});
