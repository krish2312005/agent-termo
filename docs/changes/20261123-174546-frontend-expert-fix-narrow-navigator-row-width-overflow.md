# fix narrow navigator row width overflow

- **Agent:** frontend-expert
- **When:** 2026-11-23 17:45 PST
- **Branch:** feat/subagent-workspace

Why: At the 40-column minimum (38 content cells) a stressed navigator row (duplicate long name, live activity/error, queued count, tokens) rendered 46-47 cells because the formatter had fixed clipping floors and never dropped the queued segment. Rows could overflow/wrap.
Changed:
- src/ui/workspace-view.ts — formatAgentRow now enforces rendered width <= opts.width: code-point cell counting; design-order optional drops (tokens, time, task/goal, active agent); queued counts dropped when the design's 9-cell detail / 8-cell name minimums still overflow; detail then name clipped with ellipsis, duplicate #id suffix retained while the label field is >= 8 cells. formatContentStatus got the same hard fallback for the TUI's narrow content width (20 cells). No runtime or TUI assembly changes.
Verify: bun run typecheck exit 0; bun run test = 391 passed / 2 skipped, 43 files passed / 1 skipped; bun run build clean (dist/cli.js); manual repro (frontend-expert, duplicate, running/waiting/failed, queued 1, width 38/40/48/60/80) renders 38/40/48/60/74-80 cells; 8,640-case row fuzz and 4,392-case content-status fuzz at supported widths had 0 overflows.
Revert: restore src/ui/workspace-view.ts to its pre-fix content from version control.
