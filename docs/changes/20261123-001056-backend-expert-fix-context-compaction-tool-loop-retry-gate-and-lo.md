# Fix context compaction, tool-loop retry gate, and loop bounds

- **Agent:** backend-expert
- **When:** 2026-11-23 00:10 PST
- **Branch:** local-branch

Why: Three root-cause bugs. (1) prepareConversationForRequest compacted at 85% of the reserved input budget even though that budget already reserves output+safety headroom, and compaction summarized away the original objective while shortening the most recent/failed tool results. (2) The resulting context loss plus a zero-retry failure gate made the model repeat blocked calls and loop. (3) shouldPauseForRepeatedFailedToolCall returned failedToolCalls.has(signature), blocking the very first identical retry instead of allowing one genuine retry.
Changed:
- src/runtime/context.ts — removed COMPACTION_TRIGGER_RATIO and set the compaction trigger to budget.inputBudgetTokens; added collectProtectedMessages (system prompt, original objective/first user, latest user, most recent tool result, and any tool message containing "Status: failure") and used it in makeCompactionSnapshot (kept verbatim, archived only the summarized remainder) and shortenToolMessages (skips protected tool messages).
- src/main.ts — added MAX_CONSECUTIVE_FAILURES_PER_SIGNATURE = 2; changed shouldPauseForRepeatedFailedToolCall to a Map<string, number> threshold check; changed the run-scoped failedToolCalls from Set to Map and incremented per-signature failure counts in recordToolCallOutcome (taskState.failedToolCalls stays a Set for persisted diagnostics).
- tests/unit/context.test.ts — updated the proactive-compaction threshold test and the oversized-tool-message test to the new input-budget trigger and verbatim-preservation rules.
- tests/unit/task-state.test.ts — updated the repeated-failure test to the new budget (0/1 not blocked, 2 blocked).
- tests/integration/tool-loop.test.ts — updated duplicate-write and repeated-failure expectations for the one-retry budget.
Verify: bun run typecheck (clean) and bun run test (30 files passed, 208 tests passed, 2 skipped).
Revert: git checkout -- src/runtime/context.ts src/main.ts tests/unit/context.test.ts tests/unit/task-state.test.ts tests/integration/tool-loop.test.ts
