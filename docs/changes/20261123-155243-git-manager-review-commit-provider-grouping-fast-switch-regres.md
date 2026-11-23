# review+commit provider grouping fast-switch regression tests

- **Agent:** git-manager
- **When:** 2026-11-23 15:52 PST
- **Branch:** fix/ui-paste-api-keys

Why: Stage 2 of the /providers grouping + saved-key fast-switch fix needed review and commit. Verdict: approved. Tests are genuine regression coverage for the stage 1 helpers, use fake sk-test-* keys and a temp AGENT_TERMO_DIR, and no product code changed.
Changed:
- tests/unit/providers.test.ts, tests/unit/provider-config.test.ts, tests/unit/picker-groups.test.ts — committed as c5e5e1a (test(providers): cover grouping and saved-key fast switch); 23 new cases covering connected classification/grouping, saved-key activation without prompts, key rotation persistence/activation, empty-key non-connection, and picker header filtering/navigation.
- docs/TESTING.md, docs/changes/20261123-155127-test-agent-provider-grouping-fast-switch-regression-tests.md, docs/TIMELINE.md — coverage notes and test-agent log in the same commit.
- docs/changes/20261123-154821-git-manager-review-commit-providers-connected-grouping-and-fas.md, docs/TIMELINE.md — prior stage 1 git-manager log and row, deferred from f51f46a, committed in c5e5e1a.
Verify: bun run typecheck exit 0; bun run test = 275 passed / 2 skipped (38 files passed, 1 skipped); bun run build clean -> dist/cli.js (233,219 bytes). Branch fix/ui-paste-api-keys; master still 680ed66. src/ unchanged since f51f46a.
Revert: git revert c5e5e1a on fix/ui-paste-api-keys.
