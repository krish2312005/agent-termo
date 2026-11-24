# review+commit multi-agent workspace tests

- **Agent:** git-manager
- **When:** 2026-11-23 17:13 PST
- **Branch:** feat/subagent-workspace

Why: Stage 4 (test-agent) of the multi-agent workspace build flow: review and commit the automated coverage for docs/architecture.md §21.9 plus the test-agent and previous-stage logs on feat/subagent-workspace.
Changed:
- Commit 129c453 ("test: add multi-agent workspace unit coverage", 10 files, 2304 insertions): tests/unit/agent-tree.test.ts, agent-transcript.test.ts, agent-selection.test.ts, agent-workspace.test.ts, workspace-view.test.ts (new), tests/unit/subagents.test.ts (additive), docs/TESTING.md, the test-agent and prior git-manager change logs, and only the 17:01/17:11 TIMELINE rows.
- docs/TIMELINE.md app-generated 2026-11-24 session lines intentionally left unstaged.
Verify: bun run test = 43 files passed / 1 skipped (44), 391 tests passed / 2 skipped (393), exit 0; bun run typecheck exit 0 (tsc --noEmit clean); bun run build exit 0 (Build complete: dist/cli.js, 266,256 bytes). Git status before commit showed no src/** changes: tests and docs only. Full diff reviewed: no secrets, no product code, no weakened existing assertions (subagents.test.ts diff is additive). Coverage maps to §21.9 items (tree/selection/window, transcripts, routing/queues/stop-all, composer routing, keyboard reducer, UI formatting, registry); determinism confirmed via fake handles/bindings/timers and no real TTY/network/home-dir access; the 40-column duplicate-name + queued row overflow is honestly documented in docs/TESTING.md as a known gap and not hidden by a weakened test.
Revert: git revert 129c453 (removes the five new test files, the additive subagents cases, TESTING.md coverage, both change logs and the two TIMELINE rows).
Verdict: approved. Non-blocking concerns: (1) sub-agent follow-up FIFO/drain in src/main.ts remains manual-only per TESTING.md; (2) literal TUI labels are asserted at the transcriptToUiEntries level, not JSX; (3) the narrow-terminal row overflow fix is deferred to the follow-up fix stage as instructed.
