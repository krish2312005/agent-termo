# review and commit carbon forge theme footer help and terminal title

- **Agent:** git-manager
- **When:** 2026-11-23 22:40 PST
- **Branch:** feat/carbon-forge-theme

Why: Stage 2 (Carbon Forge frontend implementation) passed git-manager review; committed the theme, one-line footer, registry-driven /help, and terminal-title work together with both outstanding change logs and their timeline rows.
Changed:
- src/cli.ts, src/main.ts — terminal-title install/restore plus command-registry plumbing only (ad-hoc /mcp append removed; project commands marked); committed as 53de170.
- src/ui/tui.tsx, src/ui/index.ts, src/ui/subagent-view.ts, src/ui/terminal-title.ts — Carbon Forge roles at every live call site, pure width-aware formatFooter, helpMarkdown/printHelp from the live registry, Chalk fallbacks on theme hexes, new title module.
- tests/unit/permission-colors.test.ts — composer-border contract replaces the removed permission-color helper.
- docs/TIMELINE.md, docs/changes/20261123-222131-git-manager-review-and-commit-carbon-forge-theme-tokens.md, docs/changes/20261123-223227-frontend-expert-carbon-forge-theme-footer-help-and-terminal-title.md — included in the same commit.
Verify: Verdict approved. bun run typecheck exit 0; bun run test = 45 files passed / 1 skipped (46), 446 passed / 2 skipped (448); bun run build exit 0 (dist/cli.js); bun dist/cli.js --version -> 2.0.7. Independent script (deleted, not committed) confirmed the exact canonical footer, drop order, permission retention, transient-status clip after 12k/23k drops, /help sections + all five aliases + single /mcp + project mark, title save/set/restore sequences and idempotency. Legacy-hex and #FF5555 grep clean in src/ui; src/utils/ansi.ts untouched; no secrets, dependency, or build-output changes. Non-blocking nit: new no-control-regex lint error at src/ui/terminal-title.ts:24 (repo-wide lint baseline already red on the same rule; CI lint scope excludes this file).
Revert: git revert 53de170 (branch is unpushed).
