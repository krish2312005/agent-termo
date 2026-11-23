import { describe, expect, it } from 'vitest';
import {
  MAX_CONSECUTIVE_FAILURES_PER_SIGNATURE,
  shouldClearFailedToolCalls,
  shouldPauseForRepeatedFailedToolCall,
  toolCallSignature,
} from '../../src/main.js';

const SIGNATURE = 'bash:execute:{"command":"node build.js"}';

describe('tool-call retry budget regression', () => {
  it('allows exactly one genuine retry before pausing (Bug 3)', () => {
    // Two consecutive failures exhaust the budget: count 1 is the first
    // failure (one retry still allowed); count 2 blocks the next identical call.
    expect(MAX_CONSECUTIVE_FAILURES_PER_SIGNATURE).toBe(2);
    expect(shouldPauseForRepeatedFailedToolCall(SIGNATURE, new Map())).toBe(false);
    expect(shouldPauseForRepeatedFailedToolCall(SIGNATURE, new Map([[SIGNATURE, 1]]))).toBe(false);
    expect(shouldPauseForRepeatedFailedToolCall(SIGNATURE, new Map([[SIGNATURE, 2]]))).toBe(true);
    expect(shouldPauseForRepeatedFailedToolCall(SIGNATURE, new Map([[SIGNATURE, MAX_CONSECUTIVE_FAILURES_PER_SIGNATURE]]))).toBe(true);
    expect(shouldPauseForRepeatedFailedToolCall(SIGNATURE, new Map([[SIGNATURE, MAX_CONSECUTIVE_FAILURES_PER_SIGNATURE + 1]]))).toBe(true);
  });

  it('keys the budget on the full call signature, not just the tool name', () => {
    expect(shouldPauseForRepeatedFailedToolCall('file:read:{"path":"a.ts"}', new Map([['file:read:{"path":"b.ts"}', 2]]))).toBe(false);
    // Signatures are stable even when the model reorders JSON object keys.
    expect(toolCallSignature({ name: 'file:write', arguments: { path: 'x.ts', content: 'hi' } }))
      .toBe(toolCallSignature({ name: 'file:write', arguments: { content: 'hi', path: 'x.ts' } }));
  });

  it('clears the budget only after a successful side-effecting corrective action (Bug 3)', () => {
    // The loop clears its run-scoped failure map when this helper returns true
    // (or when a change was applied), which is what lets a previously failed
    // signature run again after a corrective action.
    expect(shouldClearFailedToolCalls('file:write', true)).toBe(true);
    expect(shouldClearFailedToolCalls('bash:execute', true)).toBe(true);
    // A read-only success is not corrective and must leave the budget intact.
    expect(shouldClearFailedToolCalls('file:read', true)).toBe(false);
    expect(shouldClearFailedToolCalls('git:status', true)).toBe(false);
    expect(shouldClearFailedToolCalls('git:log', true)).toBe(false);
    // Failures never clear the budget.
    expect(shouldClearFailedToolCalls('file:write', false)).toBe(false);
    expect(shouldClearFailedToolCalls('bash:execute', false)).toBe(false);
  });
});
