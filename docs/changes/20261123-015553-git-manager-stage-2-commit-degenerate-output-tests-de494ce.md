# stage 2 commit degenerate output tests de494ce

- **Agent:** git-manager
- **When:** 2026-11-23 01:55 PST
- **Branch:** local-branch

Why: Stage 2 of the degenerate raw-control-token fix (test-agent coverage) reviewed and committed on local-branch.
Changed:
- commit de494ce test(llm): cover degenerate-output guard and 262K model limit
- files: tests/unit/models.test.ts, tests/unit/malformed-output.test.ts, docs/TESTING.md, docs/MEMORY.md, docs/changes/20261123-015438-test-agent-cover-stage-1-degenerate-output-guard-and-nemotron.md, docs/changes/20261123-015259-git-manager-stage-1-commit-malformed-output-4d03c68.md
Verify: bun run typecheck exit 0; bun run test 242 passed / 2 skipped (34 files passed / 1 skipped); bun run build -> dist/cli.js
Revert: git revert de494ce
Verdict: approved — tests add only the specified coverage (nemotron 262K limit/input budget, 5-vs-6 threshold, fake-transport streamComplete/complete rejection, legitimate markup negatives); docs/MEMORY.md only adds the new section plus the Status line edit. No secrets or out-of-scope files. docs/TIMELINE.md left unstaged per live-session constraint.
