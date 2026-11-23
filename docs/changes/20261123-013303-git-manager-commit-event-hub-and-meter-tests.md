# commit event hub and meter tests

- **Agent:** git-manager
- **When:** 2026-11-23 01:33 PST
- **Branch:** local-branch

Why: Stage 4 review approved. tests/unit/events.test.ts covers exact payload delivery, unsubscribe (idempotent handle), and throwing-listener isolation against the dependency-free AgentEventHub. tests/unit/context-meter.test.ts covers 0%, 50%, >100% clamp, the 43% example, and the fixed 7-cell-plus-percent shape of formatContextMeter. Assertions match the implementation and were not weakened; no production code changed.
Changed:
- 70f1486 test: cover agent event hub and context meter (7 files, +135/-6)
- tests/unit/events.test.ts - new hub contract tests
- tests/unit/context-meter.test.ts - new meter rendering tests
- docs/architecture/target-architecture.md - context meter marked implemented; event hub section notes the test file
- docs/changes/20261123-013058, 20261123-013152, 20261123-013221 - pending logs committed with the change
- docs/TIMELINE.md - appended the three matching rows
Verify: bun run typecheck exits 0; bun run test = 33 files passed / 1 skipped, 228 passed / 2 skipped (220/2 baseline + 8 new).
Revert: git revert 70f1486 (or git reset --hard d6d6efa before push).
Notes: Verdict approved, no blockers. Untracked testing-archi/ and todo-app/ intentionally not staged; no secrets; commit on local-branch only; no push/PR/branch switch/amend. This log is left uncommitted for the next commit.
