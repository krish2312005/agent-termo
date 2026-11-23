# wire typed agent event stream and context meter

- **Agent:** backend-expert
- **When:** 2026-11-23 01:28 PST
- **Branch:** local-branch

Why: Implement the specified typed runtime event stream (src/runtime/events.ts) and publish all six event types from runToolLoop without restructuring it; feed the UI context meter via an additive adapter and print the meter in /context.
Changed:
- src/runtime/events.ts — new AgentEvent union and AgentEventHub (dependency-free; snapshot dispatch; per-listener try/catch; idempotent unsubscribe)
- src/main.ts — import AgentEventHub and formatContextMeter; module-local observeAgentEvents adapter; runToolLoop gains trailing sessionId/events params, turnId, finishTurn, turn.started, per-tool started/completed in both branches, usage/context.updated after primary and fallback responses, turn.completed before every return; /context prints context meter; both runRepl call sites pass session.id
- tests/integration/tool-loop.test.ts — added getModel to the partial NimClient doubles (required by context.updated; call sites unchanged)
Verify: bun run typecheck exits 0; bunx vitest run passes (31 files, 220 passed / 2 skipped); grep shows events.publish covers turn.started, tool.started, tool.completed, usage.updated, context.updated, turn.completed and every runToolLoop return goes through finishTurn.
Revert: delete src/runtime/events.ts and revert the runToolLoop publications, imports, /context line and runRepl session.id arguments in src/main.ts, plus the getModel lines in tests/integration/tool-loop.test.ts.
