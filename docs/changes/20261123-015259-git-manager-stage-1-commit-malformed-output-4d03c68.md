# stage 1 commit malformed output 4d03c68

- **Agent:** git-manager
- **When:** 2026-11-23 01:52 PST
- **Branch:** local-branch

Why: Stage 1 of the degenerate raw-control-token bug fix (backend-expert implementation) reviewed and committed on local-branch.
Changed:
- commit 4d03c68 fix(llm): reject degenerate raw control-token model output
- files: src/llm/models.ts, src/llm/client.ts, tests/unit/malformed-output.test.ts, docs/changes/20261123-015157-backend-expert-reject-degenerate-raw-control-token-output-and-add.md
Verify: bun run typecheck exit 0; bun run test 238 passed / 2 skipped (34 files passed / 1 skipped)
Revert: git revert 4d03c68
Verdict: approved — one model-limit entry (nemotron 262_144), exported isDegenerateModelOutput + non-retryable MalformedModelOutputError, streaming + complete() guards, tests. No out-of-scope changes. docs/TIMELINE.md left unstaged per live-session constraint.
