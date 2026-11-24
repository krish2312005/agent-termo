# silence intentional control-regex lint in title module

- **Agent:** frontend-expert
- **When:** 2026-11-23 22:50 PST
- **Branch:** feat/carbon-forge-theme

Why: `bunx eslint src/ui/terminal-title.ts` failed with one `no-control-regex` error at line 24. The regex intentionally strips control characters from the terminal title, so the rule is a false positive here; the repo already uses the standard inline suppression elsewhere (e.g. src/ui/subagent-view.ts).
Changed:
- src/ui/terminal-title.ts — added `// eslint-disable-next-line no-control-regex` immediately above the existing regex in `setTitleSequence`; regex, explanatory JSDoc, and behavior unchanged.
Verify: `bunx eslint src/ui/terminal-title.ts` exit 0; `bun run typecheck` exit 0; `bun run test` = 49 files passed / 1 skipped (50), 514 passed / 2 skipped (516); `bun run build` exit 0.
Revert: delete the `// eslint-disable-next-line no-control-regex` line above the regex in `setTitleSequence` (src/ui/terminal-title.ts).
