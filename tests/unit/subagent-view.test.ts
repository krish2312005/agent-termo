import { describe, expect, it } from 'vitest';
import {
  INITIAL_MONITOR,
  formatDuration,
  reduceMonitorKey,
  renderPanel,
  renderStrip,
  type MonitorKeyContext,
} from '../../src/ui/subagent-view.js';
import type { SubAgentActivity } from '../../src/runtime/subagents.js';

// eslint-disable-next-line no-control-regex
const plain = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

const agent = (over: Partial<SubAgentActivity> = {}): SubAgentActivity => ({
  id: 'abc',
  runId: 1,
  parentId: 'main',
  agent: 'backend-developer',
  task: 'Implement the REST API',
  status: 'running',
  activity: 'file:read src/a.ts',
  step: 2,
  budget: 8,
  startedAt: 1000,
  tools: [
    { name: 'file:read', args: 'src/a.ts', startedAt: 1000, endedAt: 1500, ok: true, result: '12 lines' },
    { name: 'bash:run', args: 'npm test', startedAt: 2000 },
  ],
  progress: ['Reading the project layout'],
  queued: 0,
  ...over,
});

const ctx = (over: Partial<MonitorKeyContext> = {}): MonitorKeyContext => ({ count: 3, typing: false, canInspect: true, page: 5, maxScroll: 20, ...over });

describe('reduceMonitorKey', () => {
  it('navigates with up/down, clamped, and resets scroll when switching', () => {
    let s = { ...INITIAL_MONITOR, scroll: 4 };
    expect(reduceMonitorKey(s, 'up', ctx()).state.selected).toBe(0);
    s = reduceMonitorKey(s, 'down', ctx()).state;
    expect(s).toMatchObject({ selected: 1, scroll: 0 });
    s = reduceMonitorKey(reduceMonitorKey(s, 'down', ctx()).state, 'down', ctx()).state;
    expect(s.selected).toBe(2);
  });

  it('opens on Enter and closes on Esc', () => {
    const open = reduceMonitorKey(INITIAL_MONITOR, 'enter', ctx());
    expect(open).toMatchObject({ consumed: true, state: { open: true } });
    expect(reduceMonitorKey(open.state, 'escape', ctx()).state.open).toBe(false);
  });

  it('leaves Esc to the app (request cancellation) while the panel is closed', () => {
    expect(reduceMonitorKey(INITIAL_MONITOR, 'escape', ctx()).consumed).toBe(false);
  });

  it('does not steal Enter while a /command is being typed, or when the terminal is too small', () => {
    expect(reduceMonitorKey(INITIAL_MONITOR, 'enter', ctx({ typing: true })).consumed).toBe(false);
    expect(reduceMonitorKey(INITIAL_MONITOR, 'enter', ctx({ canInspect: false })).consumed).toBe(false);
  });

  it('ignores every key when there are no sub-agents and unrelated keys always', () => {
    expect(reduceMonitorKey(INITIAL_MONITOR, 'up', ctx({ count: 0 })).consumed).toBe(false);
    for (const k of ['text', 'backspace', 'ctrl+o', 'ctrl+c', 'tab']) expect(reduceMonitorKey({ ...INITIAL_MONITOR, open: true }, k, ctx()).consumed).toBe(false);
  });

  it('scrolls only while open, within bounds', () => {
    expect(reduceMonitorKey(INITIAL_MONITOR, 'pageup', ctx()).consumed).toBe(false);
    const open = { ...INITIAL_MONITOR, open: true };
    expect(reduceMonitorKey(open, 'pageup', ctx()).state.scroll).toBe(5);
    expect(reduceMonitorKey({ ...open, scroll: 18 }, 'pageup', ctx()).state.scroll).toBe(20);
    expect(reduceMonitorKey({ ...open, scroll: 2 }, 'pagedown', ctx()).state.scroll).toBe(0);
  });
});

describe('rendering', () => {
  it('shows the indicator with counts, and statuses for mixed agents', () => {
    const list = [agent(), agent({ id: 'b', status: 'waiting' }), agent({ id: 'c', status: 'completed' }), agent({ id: 'd', status: 'failed' })];
    const text = plain(renderStrip(list, { width: 120, open: false, canInspect: true, selected: 0 }));
    expect(text).toContain('2 subagents running');
    expect(text).toContain('1 waiting');
    expect(text).toContain('1 done');
    expect(text).toContain('1 failed');
    expect(text).toContain('↑↓ Navigate | Enter Inspect');
  });

  it('never exceeds the terminal width, down to tiny terminals', () => {
    const list = [agent(), agent({ id: 'b', agent: 'a-very-long-agent-name-indeed-for-the-test' })];
    for (let width = 1; width <= 100; width++) {
      expect(plain(renderStrip(list, { width, open: true, canInspect: true, selected: 1 })).length).toBeLessThanOrEqual(width);
    }
  });

  it('renders a panel of exact height and width with tools, progress, and a live tool', () => {
    for (const [width, height] of [[80, 12], [40, 7], [200, 16]] as const) {
      const { rows } = renderPanel(agent(), { index: 0, count: 2, width, height, scroll: 0, now: 5000 });
      expect(rows).toHaveLength(height);
      for (const r of rows) expect(plain(r).length).toBe(width);
    }
    const text = renderPanel(agent(), { index: 0, count: 2, width: 100, height: 16, scroll: 0, now: 5000 }).rows.map(plain).join('\n');
    expect(text).toContain('backend-developer');
    expect(text).toContain('Implement the REST API');
    expect(text).toContain('file:read src/a.ts');
    expect(text).toContain('↳ 12 lines');
    expect(text).toContain('bash:run npm test');
    expect(text).toContain('Reading the project layout');
  });

  it('shows final output and error details for finished agents, and scrolls long logs', () => {
    const done = agent({ status: 'completed', endedAt: 4000, output: 'All endpoints implemented.' });
    expect(renderPanel(done, { index: 0, count: 1, width: 80, height: 16, scroll: 0 }).rows.map(plain).join('\n')).toContain('All endpoints implemented.');
    const failed = agent({ status: 'failed', endedAt: 4000, error: 'API key invalid' });
    expect(renderPanel(failed, { index: 0, count: 1, width: 80, height: 16, scroll: 0 }).rows.map(plain).join('\n')).toContain('API key invalid');
    const long = agent({ status: 'completed', output: Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n') });
    const tail = renderPanel(long, { index: 0, count: 1, width: 80, height: 10, scroll: 0 });
    expect(tail.maxScroll).toBeGreaterThan(30);
    expect(tail.rows.map(plain).join('\n')).toContain('line 49');
    expect(renderPanel(long, { index: 0, count: 1, width: 80, height: 10, scroll: tail.maxScroll }).rows.map(plain).join('\n')).not.toContain('line 49');
  });

  it('formats durations', () => {
    expect([formatDuration(400), formatDuration(2500), formatDuration(42_000), formatDuration(125_000)]).toEqual(['400ms', '2.5s', '42s', '2m05s']);
  });
});
