# commit control-regex lint suppression

- **Agent:** git-manager
- **When:** 2026-11-23 22:51 PST
- **Branch:** feat/carbon-forge-theme

Why: Narrow cleanup stage: silence the false-positive no-control-regex lint error in the new terminal-title module with one inline suppression line.
Changed:
- src/ui/terminal-title.ts — added `// eslint-disable-next-line no-control-regex` above the intentional control-character strip regex; no behavior/regex change. Committed as 9fc9e72.
- docs/TIMELINE.md — cleanup rows plus the pending test-stage git-manager row.
- docs/changes/20261123-225059-frontend-expert-silence-intentional-control-regex-lint-in-title-mo.md — frontend-expert cleanup log.
- docs/changes/20261123-224954-git-manager-review-and-commit-carbon-forge-ui-tests.md — prior test-stage git-manager log.
Verify: Verdict approved. Diff reviewed: exactly the one comment line plus logs; no secrets, deps, or build output. bunx eslint src/ui/terminal-title.ts exit 0; bun run typecheck exit 0; bun run test exit 0 = 49 files passed / 1 skipped (50), 514 passed / 2 skipped (516); bun run build exit 0 (dist/cli.js). Explicit-path staging; not pushed.
Revert: git revert 9fc9e72 (branch unpushed).
