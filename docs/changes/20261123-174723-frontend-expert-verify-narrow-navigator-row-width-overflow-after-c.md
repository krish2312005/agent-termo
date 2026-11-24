# verify narrow navigator row width overflow after concurrent fix

- **Agent:** frontend-expert
- **When:** 2026-11-23 17:47 PST
- **Branch:** feat/subagent-workspace

Why: Independent verification of the reported 40-column navigator row overflow. While this stage was running, a concurrent frontend-expert edit landed the fix in src/ui/workspace-view.ts and logged it at 17:45; this entry records verification and the deviation from the requested drop order, not a second code change.
Changed:
- none — verified the on-disk fix in src/ui/workspace-view.ts (formatAgentRow hard width handling, formatContentStatus narrow fallback); no tests or docs edited by this stage.
Verify: exact repro (frontend-expert, duplicateName true, live activity, queued 1, tokens/since, selected, depth 1, width 38) renders 38 cells (was 47); widths 40/48/60/80 render 40/48/60/80. bun run typecheck exit 0; bun run test = 391 passed / 2 skipped (43 files passed, 1 skipped); bun run build clean (dist/cli.js, 267,338 bytes). 191,808-case row fuzz (widths 20-130, depths 0-3, all statuses, duplicate names, queued, tokens, Unicode names) had 0 overflows at width >= 22 and 144 overflows at widths 20-21 (depth 3 + Completed), below the supported 40-column terminal. formatContentStatus fuzz (widths 20-130) had 0 overflows and no hang on astral names.
Revert: no change made in this stage; revert the concurrent fix via git checkout of src/ui/workspace-view.ts (see docs/changes/20261123-174546-frontend-expert-fix-narrow-navigator-row-width-overflow.md).
