# test event hub and context meter

- **Agent:** test-agent
- **When:** 2026-11-23 01:31 PST
- **Branch:** local-branch

Why: Lock in the delivery, unsubscribe, and listener-isolation contract of the typed runtime event hub, and the exact rendering of the 7-cell context meter added in the latest UI/runtime work.
Changed:
- tests/unit/events.test.ts — new; AgentEventHub delivery exact-payload, unsubscribe (idempotent handle), and throwing-listener isolation
- tests/unit/context-meter.test.ts — new; formatContextMeter 0%, 50%, >100% clamp, 43% example, and fixed string shape
Verify: bun run typecheck exits 0; bunx vitest run tests/unit/events.test.ts tests/unit/context-meter.test.ts = 2 files / 8 tests passed; bun run test = 33 files passed / 1 skipped, 228 tests passed / 2 skipped (baseline 220/2 + 8 new).
Revert: delete tests/unit/events.test.ts and tests/unit/context-meter.test.ts.
