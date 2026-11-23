# fix verify false positive on Todo errors

- **Agent:** main-agent
- **When:** 2026-11-23 00:57 PST
- **Branch:** local-branch

Why: The completion gate flagged a legitimate `throw new Error("Todo not found")` as a stub, wrongly blocking an otherwise verified task.
Changed:
- src/runtime/verify.ts — split the placeholder regex: `not implemented|unimplemented` stay case-insensitive; `TODO` must be uppercase, so domain words like "Todo" no longer match.
- tests/unit/verify.test.ts — regression tests: "Todo not found: …" yields 0 issues; uppercase "TODO: …" and "Not implemented" still each yield 1.
Verify: bun run typecheck (exit 0); bun run test (217 passed / 2 skipped); bun run build (dist/cli.js).
Revert: git revert af9ecb1
