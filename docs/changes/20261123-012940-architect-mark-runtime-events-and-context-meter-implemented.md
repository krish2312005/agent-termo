# mark runtime events and context meter implemented

- **Agent:** architect
- **When:** 2026-11-23 01:29 PST
- **Branch:** local-branch

Why: Backend shipped the typed runtime event stream and context-meter wiring (uncommitted); the target architecture doc still claimed these were not implemented.
Changed:
- docs/architecture/target-architecture.md — src/runtime/events.ts boundary row -> partially implemented (six events, hub, error isolation, one-way publish; no permission/delta/compaction/exit events, no persistence/replay); event contract rows for turn/tool/usage/context marked implemented; envelope heading -> "Implemented envelope shape (this slice)"; "Runtime event contract" banner -> implemented; "Event hub boundary" -> implemented and present tense; publication table/status mapping present tense with fallback-omits-tool-schemas note; Context meter status -> partially implemented with pending: unit tests only, rendering bullets present tense.
Verify: grep -n "not yet implemented" docs/architecture/target-architecture.md shows only genuine gaps (lifecycle transitions, uniform tool timeout contract, schema versioning, OS sandbox). Cross-checked src/runtime/events.ts, src/main.ts (observeAgentEvents, runToolLoop publish calls, /context line 2246), src/ui/tui.tsx formatContextMeter and status line.
Revert: git checkout -- docs/architecture/target-architecture.md
