import { describe, expect, it } from 'vitest';
import {
  buildAgentTree,
  moveAgentSelection,
  parentAgentId,
  reconcileSelection,
  visibleAgentRows,
  workspaceStatusOf,
  type AgentTreeNode,
  type MainAgentState,
} from '../../src/runtime/agent-tree.js';
import type { SubAgentActivity, SubAgentStatus } from '../../src/runtime/subagents.js';

const mainState = (over: Partial<MainAgentState> = {}): MainAgentState => ({
  status: 'idle',
  activity: 'ready',
  queued: 0,
  startedAt: 1_000,
  ...over,
});

const sub = (over: Partial<SubAgentActivity> = {}): SubAgentActivity => ({
  id: 's1',
  runId: 1,
  parentId: 'main',
  agent: 'reviewer',
  task: 'review the change',
  status: 'running',
  activity: 'working',
  step: 0,
  budget: 0,
  startedAt: 2_000,
  tools: [],
  progress: [],
  queued: 0,
  ...over,
});

const ids = (nodes: readonly AgentTreeNode[]): string[] => nodes.map((node) => node.id);
const nodeById = (nodes: readonly AgentTreeNode[], id: string): AgentTreeNode => nodes.find((node) => node.id === id)!;

const usage = { promptTokens: 900, completionTokens: 300, totalTokens: 1_200 };

describe('buildAgentTree', () => {
  it('always renders main first with real main state and no sub-agents', () => {
    const nodes = buildAgentTree(
      mainState({ status: 'running', activity: 'working', goal: 'ship it', queued: 2, usage }),
      [],
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: 'main',
      name: 'main',
      kind: 'main',
      parentId: null,
      depth: 0,
      status: 'running',
      activity: 'working',
      task: 'ship it',
      startedAt: 1_000,
      usage,
      childCount: 0,
      activeChildCount: 0,
      queued: 2,
      duplicateName: false,
    });
    expect(nodes[0]!.endedAt).toBeUndefined();
  });

  it('emits DFS pre-order with generic depth for nested agents', () => {
    const nodes = buildAgentTree(mainState(), [
      sub({ id: 'b', startedAt: 3_000 }),
      sub({ id: 'd', parentId: 'c', startedAt: 1_000 }),
      sub({ id: 'a', startedAt: 2_000 }),
      sub({ id: 'c', parentId: 'a', startedAt: 1_500 }),
    ]);

    expect(ids(nodes)).toEqual(['main', 'a', 'c', 'd', 'b']);
    expect(nodes.map((node) => node.depth)).toEqual([0, 1, 2, 3, 1]);
    expect(nodeById(nodes, 'main')).toMatchObject({ childCount: 2, activeChildCount: 2 });
    expect(nodeById(nodes, 'a')).toMatchObject({ parentId: 'main', childCount: 1, activeChildCount: 1 });
    expect(nodeById(nodes, 'c')).toMatchObject({ parentId: 'a', childCount: 1 });
    expect(nodeById(nodes, 'd')).toMatchObject({ parentId: 'c', childCount: 0 });
  });

  it('sorts siblings by startedAt and then by id', () => {
    const nodes = buildAgentTree(mainState(), [
      sub({ id: 'z', startedAt: 5_000 }),
      sub({ id: 'b', startedAt: 2_000 }),
      sub({ id: 'a', startedAt: 2_000 }),
      sub({ id: 'c', startedAt: 2_000 }),
    ]);

    expect(ids(nodes)).toEqual(['main', 'a', 'b', 'c', 'z']);
  });

  it('counts only direct active children and retains completed/failed/stopped rows', () => {
    const nodes = buildAgentTree(mainState(), [
      sub({ id: 'running', status: 'running' }),
      sub({ id: 'waiting', status: 'waiting' }),
      sub({ id: 'done', status: 'completed', endedAt: 4_000, output: 'finished' }),
      sub({ id: 'failed', status: 'failed', endedAt: 4_000, error: 'boom\nstack line' }),
      sub({ id: 'cancelled', status: 'cancelled', endedAt: 4_000 }),
    ]);

    expect(nodes).toHaveLength(6);
    expect(nodeById(nodes, 'main')).toMatchObject({ childCount: 5, activeChildCount: 2 });
    expect(nodeById(nodes, 'running').status).toBe('running');
    expect(nodeById(nodes, 'waiting').status).toBe('waiting');
    expect(nodeById(nodes, 'done')).toMatchObject({ status: 'completed', endedAt: 4_000 });
    expect(nodeById(nodes, 'failed')).toMatchObject({ status: 'failed', error: 'boom' });
    expect(nodeById(nodes, 'cancelled').status).toBe('stopped');
  });

  it('counts active grandchildren only for their direct parent', () => {
    const nodes = buildAgentTree(mainState(), [
      sub({ id: 'parent', status: 'running' }),
      sub({ id: 'child', parentId: 'parent', status: 'waiting' }),
    ]);

    expect(nodeById(nodes, 'main')).toMatchObject({ childCount: 1, activeChildCount: 1 });
    expect(nodeById(nodes, 'parent')).toMatchObject({ childCount: 1, activeChildCount: 1 });
  });

  it('flags duplicate display names only between siblings', () => {
    const nodes = buildAgentTree(mainState(), [
      sub({ id: 'x', agent: 'qa' }),
      sub({ id: 'y', agent: 'qa' }),
      sub({ id: 'z', parentId: 'x', agent: 'qa' }),
      sub({ id: 'w', agent: 'dev' }),
    ]);

    expect(nodeById(nodes, 'x')).toMatchObject({ name: 'qa', duplicateName: true });
    expect(nodeById(nodes, 'y')).toMatchObject({ name: 'qa', duplicateName: true });
    expect(nodeById(nodes, 'z')).toMatchObject({ name: 'qa', duplicateName: false });
    expect(nodeById(nodes, 'w').duplicateName).toBe(false);
    expect(nodeById(nodes, 'main').duplicateName).toBe(false);
  });

  it('attaches orphans, missing parents, self-links and cycles to main without looping', () => {
    const nodes = buildAgentTree(mainState(), [
      sub({ id: 'orphan', parentId: 'ghost' }),
      sub({ id: 'empty-parent', parentId: '' }),
      sub({ id: 'self', parentId: 'self' }),
      sub({ id: 'a', parentId: 'b' }),
      sub({ id: 'b', parentId: 'a' }),
      sub({ id: 'valid', status: 'completed' }),
      sub({ id: 'nested', parentId: 'valid' }),
    ]);

    expect(nodeById(nodes, 'orphan')).toMatchObject({ parentId: 'main', depth: 1 });
    expect(nodeById(nodes, 'empty-parent')).toMatchObject({ parentId: 'main', depth: 1 });
    expect(nodeById(nodes, 'self')).toMatchObject({ parentId: 'main', depth: 1 });
    expect(nodeById(nodes, 'a')).toMatchObject({ parentId: 'main', depth: 1 });
    expect(nodeById(nodes, 'b')).toMatchObject({ parentId: 'main', depth: 1 });
    expect(nodeById(nodes, 'nested')).toMatchObject({ parentId: 'valid', depth: 2 });
    expect(ids(nodes).filter((id) => id === 'main')).toHaveLength(1);
  });

  it('propagates timing, usage, queue, task, activity and first-line errors', () => {
    const nodes = buildAgentTree(mainState(), [
      sub({
        id: 'done',
        status: 'failed',
        task: 'write tests',
        activity: 'failed',
        startedAt: 2_500,
        endedAt: 3_500,
        usage,
        queued: 3,
        error: 'first line\nsecond line',
      }),
    ]);
    const node = nodeById(nodes, 'done');

    expect(node).toMatchObject({
      task: 'write tests',
      activity: 'failed',
      startedAt: 2_500,
      endedAt: 3_500,
      usage,
      queued: 3,
      error: 'first line',
    });
  });
});

describe('workspaceStatusOf', () => {
  it('maps cancelled to stopped and leaves every other status unchanged', () => {
    const cases: Array<[SubAgentStatus, string]> = [
      ['running', 'running'],
      ['waiting', 'waiting'],
      ['completed', 'completed'],
      ['failed', 'failed'],
      ['cancelled', 'stopped'],
    ];

    for (const [input, expected] of cases) expect(workspaceStatusOf(input)).toBe(expected);
  });
});

describe('agent selection helpers', () => {
  const nodes = buildAgentTree(mainState(), [
    sub({ id: 'a', startedAt: 2_000 }),
    sub({ id: 'b', startedAt: 3_000 }),
    sub({ id: 'c', parentId: 'a', startedAt: 4_000 }),
  ]);

  it('moves with clamping and no wrap-around', () => {
    expect(moveAgentSelection(nodes, 'main', 1)).toBe('a');
    expect(moveAgentSelection(nodes, 'a', 1)).toBe('c');
    expect(moveAgentSelection(nodes, 'c', 1)).toBe('b');
    expect(moveAgentSelection(nodes, 'b', 1)).toBe('b');
    expect(moveAgentSelection(nodes, 'b', -1)).toBe('c');
    expect(moveAgentSelection(nodes, 'main', -1)).toBe('main');
  });

  it('falls back to main for an unknown selected id or an empty tree', () => {
    expect(moveAgentSelection(nodes, 'missing', 1)).toBe('main');
    expect(moveAgentSelection(nodes, 'missing', -1)).toBe('main');
    expect(moveAgentSelection([], 'a', 1)).toBe('main');
  });

  it('reports the parent id and null at main or an unknown id', () => {
    expect(parentAgentId(nodes, 'c')).toBe('a');
    expect(parentAgentId(nodes, 'a')).toBe('main');
    expect(parentAgentId(nodes, 'main')).toBeNull();
    expect(parentAgentId(nodes, 'missing')).toBeNull();
  });

  it('reconciles a live selection and falls back to main only when the node disappears', () => {
    expect(reconcileSelection(nodes, 'b')).toBe('b');
    expect(reconcileSelection(nodes, 'main')).toBe('main');
    expect(reconcileSelection(nodes, 'gone')).toBe('main');
    expect(reconcileSelection([], 'gone')).toBe('main');
  });
});

describe('visibleAgentRows', () => {
  const nodes = buildAgentTree(
    mainState(),
    Array.from({ length: 9 }, (_, index) =>
      sub({ id: `s${index}`, agent: `agent-${index}`, startedAt: 2_000 + index }),
    ),
  );

  it('returns every row when the list fits', () => {
    expect(visibleAgentRows(nodes, 'main', 10)).toEqual({ rows: nodes, hiddenAbove: 0, hiddenBelow: 0 });
    expect(visibleAgentRows(nodes, 's4', nodes.length).rows).toHaveLength(nodes.length);
  });

  it('centers a window around a middle selection and reports both overflow counts', () => {
    const view = visibleAgentRows(nodes, 's4', 3);

    expect(ids(view.rows)).toEqual(['s3', 's4', 's5']);
    expect(view.hiddenAbove).toBe(4);
    expect(view.hiddenBelow).toBe(3);
    expect(view.rows.length + view.hiddenAbove + view.hiddenBelow).toBe(nodes.length);
  });

  it('clamps the window at the top and the bottom', () => {
    expect(visibleAgentRows(nodes, 'main', 3)).toMatchObject({ hiddenAbove: 0, hiddenBelow: 7 });
    expect(ids(visibleAgentRows(nodes, 'main', 3).rows)).toEqual(['main', 's0', 's1']);
    expect(visibleAgentRows(nodes, 's8', 3)).toMatchObject({ hiddenAbove: 7, hiddenBelow: 0 });
    expect(ids(visibleAgentRows(nodes, 's8', 3).rows)).toEqual(['s6', 's7', 's8']);
  });

  it('always keeps the selected row inside the window', () => {
    for (const selected of nodes.map((node) => node.id)) {
      const view = visibleAgentRows(nodes, selected, 3);
      expect(ids(view.rows)).toContain(selected);
      expect(view.rows.length).toBeLessThanOrEqual(3);
      expect(view.rows.length + view.hiddenAbove + view.hiddenBelow).toBe(nodes.length);
    }
  });

  it('honors a one-row window and floors fractional or invalid sizes', () => {
    expect(ids(visibleAgentRows(nodes, 's4', 1).rows)).toEqual(['s4']);
    expect(visibleAgentRows(nodes, 's4', 1)).toMatchObject({ hiddenAbove: 5, hiddenBelow: 4 });
    expect(visibleAgentRows(nodes, 's4', 0).rows).toHaveLength(1);
    expect(visibleAgentRows(nodes, 's4', Number.NaN).rows).toHaveLength(1);
    expect(visibleAgentRows(nodes, 's4', -3).rows).toHaveLength(1);
    expect(visibleAgentRows(nodes, 's4', 2.9).rows).toHaveLength(2);
  });

  it('returns an empty view for an empty tree', () => {
    expect(visibleAgentRows([], 'main', 7)).toEqual({ rows: [], hiddenAbove: 0, hiddenBelow: 0 });
  });
});
