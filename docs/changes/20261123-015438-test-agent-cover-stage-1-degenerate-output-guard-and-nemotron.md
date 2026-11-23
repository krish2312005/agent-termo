# cover stage 1 degenerate output guard and nemotron 262K limit

- **Agent:** test-agent
- **When:** 2026-11-23 01:54 PST
- **Branch:** local-branch

Why: Stage 1 added the degenerate-output guard and the nemotron 262K limit; the guard's streaming and non-streaming error paths and the model's input budget were untested.
Changed:
- tests/unit/models.test.ts — added nemotron-3.5-super-vl-120b-a12b limit test (getProviderModelLimits contextWindowTokens 262144, resolveContextBudget contextWindowTokens 262144, inputBudgetTokens > 200000)
- tests/unit/malformed-output.test.ts — added user-sample runaway detection (5 lines false, 6 lines true), colon-form <tool_call> negative, and fake-transport tests proving streamComplete/complete throw MalformedModelOutputError with no yielded content (no network)
- docs/TESTING.md — documented the malformed-output guard and nemotron limit coverage
Verify: bun run typecheck exit 0; bun run test = 242 passed / 2 skipped (34 files passed, 1 skipped); bun run build -> dist/cli.js
Revert: git checkout -- tests/unit/models.test.ts tests/unit/malformed-output.test.ts docs/TESTING.md
