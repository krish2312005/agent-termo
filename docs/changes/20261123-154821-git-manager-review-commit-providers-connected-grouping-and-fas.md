# review+commit providers connected grouping and fast switch

- **Agent:** git-manager
- **When:** 2026-11-23 15:48 PST
- **Branch:** fix/ui-paste-api-keys

Why: Stage 1 of the fix flow needed an approved, focused commit for the /providers connected-state UX and saved-key fast switch. Verdict: approved.
Changed:
- docs/TIMELINE.md — committed pre-existing runtime session-log append separately as 6819770 (docs: record runtime session log entries); frontend-expert stage row included in f51f46a.
- src/llm/providers.ts, src/ui/tui.tsx, src/main.ts, docs/changes/20261123-154614-frontend-expert-providers-connected-grouping-and-fast-switch.md — committed as f51f46a (fix(providers): fast-switch connected providers with saved keys).
Verify: bun run typecheck exit 0; bun run test 252 passed / 2 skipped (36 files passed, 1 skipped); bun run build clean -> dist/cli.js. Branch fix/ui-paste-api-keys; master still 680ed66.
Revert: git revert f51f46a (stage 1 code+docs) and git revert 6819770 (runtime session log) on fix/ui-paste-api-keys.
