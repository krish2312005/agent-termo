# multi-agent workspace architecture spec

- **Agent:** architect
- **When:** 2026-11-23 16:12 PST
- **Branch:** master

Why: Specify the Claude Code-style sub-agent navigation workspace so backend-expert and frontend-expert can implement it without guessing. Phase 1 investigation + Phase 2 minimal design only; no product code changed.
Changed:
- docs/architecture.md (tracked filename for docs/ARCHITECTURE.md) — added section 21 "Multi-agent Workspace" (current-state findings, D1-D5 decisions, exact TypeScript contracts, data flows, lifecycle/message-disposition tables, UI/navigator/keyboard spec, file-level change plan, tests/seams, acceptance mapping, limitations); bumped doc to v1.2 LIVING and added TOC entry.
- docs/architecture/target-architecture.md — added not-yet-implemented markers for agent-workspace/agent-tree/agent-transcript/agent-selection and a "Multi-agent workspace (specified, not yet implemented)" section referencing ARCHITECTURE section 21.
- No src/ changes, no tests changed, .env.example unchanged (feature needs no new env vars).
Verify: Read docs/architecture.md section 21 and docs/architecture/target-architecture.md status rows; baseline re-checked before writing: `bun run typecheck` exit 0, `bun run test` 275 passed / 2 skipped (38 files passed, 1 skipped).
Revert: Remove section 21 + TOC entry/version bump from docs/architecture.md and the new markers/section from docs/architecture/target-architecture.md; do not touch earlier log entries.
