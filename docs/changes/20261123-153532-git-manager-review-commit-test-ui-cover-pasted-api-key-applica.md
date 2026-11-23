# review+commit test(ui): cover pasted API key application

- **Agent:** git-manager
- **When:** 2026-11-23 15:35 PST
- **Branch:** fix/ui-paste-api-keys

Why: Stage 2 review APPROVED. Test-only stage for the pasted-API-key bug fixed in 7cf2ca8 (Stage 1). The new test targets the extracted pure helper applySecretPaste (exported from src/ui/tui.tsx, re-exported via src/ui/index.ts): draft append, UTF-8 Uint8Array decode, empty-paste no-op, and a long fake key preserved intact. No product/source changes; test data uses fake sk-test-* strings only (no secrets). docs/TESTING.md (test-agent-owned) adds the UI pure-helper coverage bullet and records the known gap that interactive TUI paste wiring (usePaste/useKeyboard, real terminal) is not automated. Both test-agent log files and both TIMELINE rows were produced by log.sh; no unrelated edits.
Changed:
- Commit "test(ui): cover pasted API key application" (this commit; a commit cannot contain its own hash, assigned on creation). Paths: tests/unit/secret-paste.test.ts, docs/TESTING.md, docs/TIMELINE.md (2 test-agent rows + this row), docs/changes/20261123-153420-test-agent-test-ui-cover-pasted-api-key-application.md, docs/changes/20261123-153439-test-agent-docs-testing-document-secret-paste-coverage.md, and this git-manager log file.
Verify: `bun run typecheck` exit 0 (bunx tsc --noEmit, no errors); `bun run test` exit 0 = 36 test files passed / 1 skipped (37 total), 252 tests passed / 2 skipped (254 total); targeted `bunx vitest run tests/unit/secret-paste.test.ts` = 4 passed. Matches the Stage 2 baseline.
Revert: `git revert <commit>` on branch fix/ui-paste-api-keys (or `git reset --soft HEAD~1` to uncommit while keeping changes); removes tests/unit/secret-paste.test.ts and the docs/TESTING.md coverage notes, and removes the three change-log entries/timeline rows added in this commit (no product code affected).
