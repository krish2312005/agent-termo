# spec runtime event stream and context meter

- **Agent:** architect
- **When:** 2026-11-23 01:14 PST
- **Branch:** local-branch

Why: First production-grade architecture vertical slice: a typed runtime event stream consumed by the UI, plus context visualization.
Changed:
- docs/architecture/target-architecture.md — added the six-event AgentEvent discriminated union, the AgentEventHub publish/subscribe boundary and runToolLoop publication/status-mapping tables, and the formatContextMeter + /context rendering contract; updated the src/runtime/events.ts boundary row and Event contract table, and replaced the old "standardize later" envelope line with the flat implemented shape.
Verify: Re-read docs/architecture/target-architecture.md. The union matches the six events field-for-field; hub signature is subscribe(listener) => unsubscribe and publish(event); formatContextMeter yields 7 cells + rounded percent; no product code was edited.
Revert: git checkout -- docs/architecture/target-architecture.md
