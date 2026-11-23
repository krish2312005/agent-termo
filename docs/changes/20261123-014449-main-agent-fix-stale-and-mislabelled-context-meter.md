# fix stale and mislabelled context meter

- **Agent:** main-agent
- **When:** 2026-11-23 01:44 PST
- **Branch:** local-branch

Why: After /clear (and on startup/restore/compaction) the status-line meter kept the previous turn's value, so it disagreed with /context; the line also showed cumulative session tokens next to the context meter, making them look like context tokens.
Changed:
- src/main.ts — add refreshContextMeter() (recomputes estimateContextTokens + resolveContextBudget from the live conversation) and call it on startup, session restore, /clear, /compact; /context also pushes the same values to the status line.
- src/ui/tui.tsx — status line shows "context <meter> · <used>/<budget> · thinking · permission · session <usage>"; add formatTokenCount helper.
- src/ui/index.ts — export formatTokenCount.
- tests/unit/context-meter.test.ts — cover formatTokenCount.
Verify: bun run typecheck (exit 0); bun run test (231 passed / 2 skipped); bun run build (dist/cli.js).
Revert: git revert <this-commit>
