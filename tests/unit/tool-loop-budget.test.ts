import { describe, expect, it } from 'vitest';
import { getToolLoopStopReason, TOOL_LOOP_TIME_BUDGET_MS } from '../../src/runtime/run-budget.js';

describe('agent tool-loop safety budget', () => {
  it('does not use a model-turn count as a stopping condition', () => {
    expect(getToolLoopStopReason(1_000)).toBeUndefined();
    expect(getToolLoopStopReason(TOOL_LOOP_TIME_BUDGET_MS)).toBeUndefined();
  });

  it('still stops a run that exceeds the wall-clock safety budget', () => {
    expect(getToolLoopStopReason(TOOL_LOOP_TIME_BUDGET_MS + 1)).toContain('20-minute time budget');
  });
});
