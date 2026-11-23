# Add regression tests for compaction, retry budget, and tool-loop fixes

- **Agent:** test-agent
- **When:** 2026-11-23 00:26 PST
- **Branch:** local-branch

Why: Pin root-cause fixes for three just-fixed bugs: premature context compaction (Bug 1), tool-loop non-termination (Bug 2), and the retry-budget gate (Bug 3).
Changed:
- tests/unit/context.test.ts — added 3 regression tests: no premature compaction under the input budget, verbatim preservation of objective/current goal/failed-call diagnostics, and determinism for identical inputs.
- tests/unit/retry-budget.test.ts — new file: one genuine retry before pausing, signature-scoped counting, corrective-clear helper invariants.
- tests/integration/tool-loop.test.ts — added loop test: a failed file:read, a successful corrective file:write clears the retry budget, the identical read retries and succeeds, and the loop completes.
- docs/TESTING.md — created test documentation (how to run, what is covered, known gaps).
Verify: bun run typecheck clean; bun run test green — 31 files passed / 1 skipped, 215 tests passed / 2 skipped.
Revert: remove the added test cases/files and docs/TESTING.md, then delete the appended TIMELINE row and docs/changes entry.
