# commit typed runtime events

- **Agent:** git-manager
- **When:** 2026-11-23 01:30 PST
- **Branch:** local-branch

Why: Stage 2 review approved. New src/runtime/events.ts matches the contract (six-member flat AgentEvent union, dependency-free hub, idempotent unsubscribe, snapshot dispatch, per-listener try/catch that never rethrows or prints). runToolLoop publishes all six event types: turn.started at entry; tool.started/tool.completed balanced per executed call in both the parallel-delegation and sequential branches, skipped for blocked and 20-minute-budget paths; usage.updated/context.updated after primary and fallback model responses; turn.completed before every loop-exit return. Existing print*/spinner/setScreenStatus calls were not moved; no src/ui changes.
Changed:
- d6d6efa feat(runtime): publish typed agent events and context meter (8 files, +170/-61)
- src/runtime/events.ts — new AgentEvent union + AgentEventHub
- src/main.ts — observeAgentEvents adapter, trailing sessionId/events params, turn/tool/usage/context publications, /context meter print, both runRepl call sites pass session.id
- tests/integration/tool-loop.test.ts — five NimClient fakes gained getModel() (no assertion/signature changes)
- docs/architecture/target-architecture.md — statuses updated; context meter stays partially implemented pending unit tests
- docs/changes/20261123-012541, 20261123-012813, 20261123-012940 — pending logs committed with the change
Verify: git show --stat d6d6efa; bun run typecheck exits 0; bun run test = 31 files passed / 1 skipped, 220 passed / 2 skipped.
Revert: git revert d6d6efa (or git reset --hard d1b44d5 before push).
Notes: Verdict approved, no blockers. Untracked testing-archi/ and todo-app/ intentionally not staged; dist/ ignored; no secrets. Commit was on local-branch; no push/PR/branch switch/amend.
