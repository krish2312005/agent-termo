import { describe, expect, it } from 'vitest';
import { getToolLoopStopReason, TOOL_LOOP_TIME_BUDGET_MS } from '../../src/runtime/run-budget.js';

describe('agent tool-loop safety budget', () => {
  it('does not stop a task at the old 40-turn limit or at later turn counts', () => {
    for (let turn = 1; turn <= 500; turn++) {
      expect(getToolLoopStopReason(1_000)).toBeUndefined();
    }
  });

  it('still stops a run that exceeds the wall-clock safety budget', () => {
    expect(getToolLoopStopReason(TOOL_LOOP_TIME_BUDGET_MS + 1)).toContain('20-minute time budget');
  });
});
