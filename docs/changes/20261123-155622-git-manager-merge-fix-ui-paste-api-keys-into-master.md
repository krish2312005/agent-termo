# merge fix/ui-paste-api-keys into master

- **Agent:** git-manager
- **When:** 2026-11-23 15:56 PST
- **Branch:** master

Why: User requested merging fix/ui-paste-api-keys into master. The branch held the reviewed and verified pasted-API-key fix and connected-provider fast-switch fix.
Changed:
- Fast-forward merged master 680ed66 -> 95c8a4e (8 commits: 7cf2ca8, a4cd4e3, 4242e0a, 6819770, f51f46a, c5e5e1a, 93774e6, 95c8a4e). No conflict; no merge commit; no files changed by the merge itself.
- Reviewed diff 680ed66..95c8a4e before merging: only src/llm/providers.ts, src/main.ts, src/ui/index.ts, src/ui/tui.tsx, four test files, and docs/change logs; key-like strings are fake sk-test-* fixtures only.
Verify: on master after merge: bun run typecheck exit 0; bun run test 275 passed / 2 skipped (38 files passed, 1 skipped); bun run build exit 0 (dist/cli.js, 233,219 bytes).
Revert: local, unpushed: git reset --hard 680ed66a775c5fa6eeab46ad9100e28a89b6ffcf, or revert the 8 listed commits.
