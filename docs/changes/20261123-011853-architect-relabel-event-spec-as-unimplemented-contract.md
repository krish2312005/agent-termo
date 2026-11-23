# relabel event spec as unimplemented contract

- **Agent:** architect
- **When:** 2026-11-23 01:18 PST
- **Branch:** local-branch

Why: git-manager withheld the docs-only commit because docs/architecture/target-architecture.md asserted in present tense that src/runtime/events.ts, event publication, formatContextMeter, setScreenStatus({context}), and the /context meter line exist, but none are implemented yet. The doc must be honest at commit time.
Changed:
- docs/architecture/target-architecture.md — relabeled src/runtime/events.ts boundary row (line 52) to `not yet implemented` with "contract specified below; implementation lands in this flow"; relabeled event contract table rows for turn/tool/usage/context events (lines 141, 143, 145, 146) to `not yet implemented` with target wording, keeping the accurate existing onChunk/setScreenStatus markers (142) and compaction/process-exit markers (147-148); changed "Implemented envelope shape" to "Target envelope shape (this flow)"; added `Status: not yet implemented` banners and future-tense prose to Runtime event contract, Event hub boundary + wiring, and Context meter sections. No contract shapes, event names, clamping rules, or hub boundary semantics changed.
Verify: `grep -rn "AgentEventHub\|formatContextMeter" src/` returns only pre-existing SubAgentEvent matches (no implementation); read target-architecture.md lines 52, 141-156, 231-236, 316-323, 344-347 — every new claim is future tense or marked not-yet-implemented; `git diff --stat` shows docs/architecture/target-architecture.md only.
Revert: `git checkout -- docs/architecture/target-architecture.md` (restores pre-session state; loses this relabel and the prior spec additions).
