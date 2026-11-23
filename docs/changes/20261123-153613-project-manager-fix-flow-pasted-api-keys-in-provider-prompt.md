# fix flow: pasted API keys in provider prompt

- **Agent:** project-manager
- **When:** 2026-11-23 15:36 PST
- **Branch:** fix/ui-paste-api-keys

Why: The user reported that the `/providers` API-key prompt dropped pasted text, forcing character-by-character typing. Fix flow run per `.claude/workflow.md`: frontend-expert fixed the TUI paste wiring, test-agent added a regression test, and git-manager reviewed/committed each stage.
Changed:
- docs/MEMORY.md — recorded the root cause, fix, tests, verification counts and branch state; updated current status.
- Branch `fix/ui-paste-api-keys`: Stage 1 `7cf2ca8` (`fix(ui): accept pasted API keys in masked provider prompt`), Stage 2 `a4cd4e3` (`test(ui): cover pasted API key application`). Local only; not pushed or merged to `master`.
- docs/changes/ — agent log entries from frontend-expert, git-manager (x2), test-agent (x2) and this entry.
Verify: `bun run typecheck` exit 0; `bun run test` = 252 passed / 2 skipped (36 files passed, 1 skipped); `bun run build` clean (`dist/cli.js`); new `tests/unit/secret-paste.test.ts` = 4 passed.
Revert: `git revert a4cd4e3 7cf2ca8` on `fix/ui-paste-api-keys` (or delete the branch); restore the `docs/MEMORY.md` section if keeping the fix.
