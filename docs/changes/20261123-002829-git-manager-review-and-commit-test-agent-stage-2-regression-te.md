# review and commit test-agent stage-2 regression tests

- **Agent:** git-manager
- **When:** 2026-11-23 00:28 PST
- **Branch:** local-branch

Why: Reviewed test-agent stage-2 work (regression tests for premature compaction, retry budget, tool-loop termination) and committed it to local-branch (no push/PR/merge).
Verdict: approved.
Commit: ec7e8c0 test: add regression tests for compaction, retry budget, tool-loop
Changed:
- tests/unit/context.test.ts — 3 new regression tests (no premature compaction, verbatim protection markers, determinism)
- tests/unit/retry-budget.test.ts — new suite for retry-budget gate invariants
- tests/integration/tool-loop.test.ts — 1 new loop regression test (corrective write clears retry budget)
- docs/TESTING.md — new testing doc
- docs/changes + docs/TIMELINE.md — test-agent log and swept-in prior git-manager log row
Verify: bun run typecheck clean; suite green per test-agent (31 files / 215 passed / 2 skipped)
Revert: git revert ec7e8c0
