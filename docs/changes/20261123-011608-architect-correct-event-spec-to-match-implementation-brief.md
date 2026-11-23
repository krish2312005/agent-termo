# correct event spec to match implementation brief

- **Agent:** architect
- **When:** 2026-11-23 01:16 PST
- **Branch:** local-branch

Why: The prior architect pass contradicted the implementation brief on formatContextMeter location, hub ownership, and context.updated cadence.
Changed:
- docs/architecture/target-architecture.md — moved formatContextMeter to src/ui/tui.tsx (tests import from src/ui/tui.js); made the event hub run-local inside runToolLoop with a loop-entry observability adapter; dropped on-entry context.updated publication.
Verify: grep the doc for "src/ui/format.ts", "subscribeAgentStatus", and "On entry, and after every model response" — no matches remain.
Revert: restore the three edited passages from git history.
