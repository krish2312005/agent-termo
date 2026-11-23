/** Maximum wall-clock time for one parent-agent run. Model turns are not capped. */
export const TOOL_LOOP_TIME_BUDGET_MS = 20 * 60 * 1000;

export function getToolLoopStopReason(elapsedMs: number): string | undefined {
  if (elapsedMs > TOOL_LOOP_TIME_BUDGET_MS) return 'The run reached its 20-minute time budget.';
  return undefined;
}
