# navigator row width regression test

- **Agent:** test-agent
- **When:** 2026-11-23 17:50 PST
- **Branch:** feat/subagent-workspace

Why: The previous multi-agent workspace test run left the navigator row-width invariant unasserted; the reported 40-column repro (duplicate frontend-expert, live activity/error, queued 1) rendered 46-47 cells before the concurrent frontend fix.
Changed:
- tests/unit/workspace-view.test.ts — 3 new tests: TUI-exact rendered-row width invariant (marker + connector + glyph + " " + label + " · "-joined segments) across widths 20/24/30/38/40/48/60/80, depths 0-1, six statuses, selected/unselected, 8 fixtures (duplicate/long names, queued 0/1/42, usage present/absent, CJK/emoji); the exact width-38 repro for running/waiting/failed; full name + duplicate #id6 identity at width 80.
- docs/TESTING.md — replaced the "known narrow-terminal risk" note with the invariant + coverage, kept the honest deep-nest limitation (depth 13 at width 38 renders 40-42 cells), and updated the baseline to 394 passed / 2 skipped.
Verify: bunx vitest run tests/unit/workspace-view.test.ts => 38 passed (35 before + 3 new); bun run test => 43 files passed / 1 skipped, 394 passed / 2 skipped; bun run typecheck exit 0; bun run build exit 0 (dist/cli.js). The pre-fix HEAD formatter run against the same invariant overflowed at width 38 (47/47/46 cells for running/waiting/failed) and in 96 matrix cases, so the regression test catches the bug. No product code modified.
Revert: remove the three new tests from tests/unit/workspace-view.test.ts and restore the previous "Known narrow-terminal risk" bullet plus the 391 baseline in docs/TESTING.md.
