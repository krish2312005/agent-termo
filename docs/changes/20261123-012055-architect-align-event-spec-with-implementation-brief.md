# align event spec with implementation brief

- **Agent:** architect
- **When:** 2026-11-23 01:20 PST
- **Branch:** local-branch

Why: Implementation brief is authoritative and differs from the spec in three places; align the target architecture doc so implementers do not follow stale contract detail.
Changed:
- docs/architecture/target-architecture.md — (1) screen state / setScreenStatus context is now { usedTokens, budgetTokens } and the context.updated adapter publishes that object; status line formats via formatContextMeter(screen().context...) only when present; /context still formats directly. (2) tool.started/tool.completed now publish around each executed tool in both parallel-delegation and sequential branches; blocked/budget-skipped calls publish no pair. (3) runToolLoop trailing parameter order is sessionId = '', events: AgentEventHub = new AgentEventHub(), so runRepl call sites append only session.id. Status markers, additive-only rule, and hub error isolation untouched.
Verify: grep target-architecture.md for "context?: string" (no matches), "results loop" (no matches), and confirm "sessionId = '', events: AgentEventHub = new AgentEventHub()" appears at the parameter entry; re-read the Event hub boundary and Context meter sections.
Revert: restore docs/architecture/target-architecture.md from the previous commit (no product code changed).
