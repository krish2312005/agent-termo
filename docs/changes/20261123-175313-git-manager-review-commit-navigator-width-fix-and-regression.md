# review+commit navigator width fix and regression

- **Agent:** git-manager
- **When:** 2026-11-23 17:53 PST
- **Branch:** feat/subagent-workspace

Why: Stage-5 review and commit of the narrow-terminal navigator row width fix, its TUI-exact regression test, TESTING.md invariant/coverage, and the four stage logs on feat/subagent-workspace.
Changed:
- Commit d8e4893 ("fix: enforce navigator row width invariant at narrow terminals", 8 files, +316/-54): src/ui/workspace-view.ts (hard width invariant in formatAgentRow and formatContentStatus; code-point cell counting; design-priority drops then detail/name clipping below the design minimums; marker/connector/glyph/status label never truncated; duplicate #id6 retained while the label field is >= 8 cells; SHA-1 67375d67162bd97ec64704e5a8a9b501fd3b0455), tests/unit/workspace-view.test.ts (new "formatAgentRow width invariant" describe, +3 tests, 38 in file, additive only), docs/TESTING.md (invariant, coverage matrix, 394/2 baseline, honest deep-nesting limitation), the stage-4 git-manager log, the frontend fix and duplicate-dispatch verification logs, the test-agent regression log, and only the 17:13/17:45/17:47/17:50 TIMELINE rows.
- docs/TIMELINE.md app-generated 2026-11-24 Agent-Termo session lines intentionally left unstaged.
Verify: bun run typecheck exit 0 (tsc --noEmit clean); bun run test = 43 files passed / 1 skipped (44), 394 passed / 2 skipped (396), exit 0; bun run build exit 0 (Build complete: dist/cli.js). Pre-fix HEAD formatter fails the new tests (21 > 20 at width 20 for the simplest fixture; 47 > 38 for the reported duplicate frontend-expert repro), so the regression test catches the bug. shasum -a 1 src/ui/workspace-view.ts = 67375d67162bd97ec64704e5a8a9b501fd3b0455.
Revert: git revert d8e4893 (restores the pre-fix formatter, removes the three new tests, restores the previous TESTING.md narrow-terminal risk note and 391 baseline, and removes the four stage logs plus the four TIMELINE rows).
Verdict: approved. Non-blocking concerns: (1) DESIGN_SYSTEM.md §10.4 lists `N queued` as always kept, but the hard invariant drops queued counts when the design's 9-cell detail / 8-cell name minimums still overflow at narrow widths; documented in the 17:45/17:47 logs, design owner should reconcile; (2) a duplicate dispatch produced the 17:47 verification-only log, no second code change; (3) synthetic trees deeper than the runtime's one-level tree can overflow at very narrow widths (e.g. depth 13 at width 38 renders 40-42 cells), documented in TESTING.md and not reachable from the shipped runtime.
