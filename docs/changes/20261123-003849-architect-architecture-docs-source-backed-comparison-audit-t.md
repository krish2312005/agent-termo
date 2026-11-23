# Architecture docs: source-backed comparison, audit, target, plan

- **Agent:** architect
- **When:** 2026-11-23 00:38 PST
- **Branch:** local-branch

Why: The architecture-improvement brief required source-backed documentation of OpenCode/Codex vs Agent-Termo, an audit of the actual code, a truthful target gap analysis, and an implementation plan. Implementation of the three bug fixes was already completed and committed by prior agents; this pass documents that reality without changing code.
Changed:
- docs/architecture/architecture-comparison.md — OpenCode (609e4bb) vs Codex (a1604a8) vs Agent-Termo comparison with citations.
- docs/architecture/current-architecture-audit.md — actual entry points, module ownership, lifecycle, and the three just-fixed bugs (compaction trigger, loop bounds, retry gate).
- docs/architecture/target-architecture.md — target design with implemented/partially/not-yet markers.
- docs/architecture/implementation-plan.md — phases, completed work, outstanding work, risks.
- plan.md — added the three bug fixes (root cause/fix/verification), updated test counts to 215 passed / 2 skipped, linked the new docs.
Verify: bun run test reports 215 passed / 2 skipped across 32 test files; bun run typecheck clean; docs cite real source paths and reference SHAs.
Revert: git checkout -- plan.md and delete docs/architecture/*.md (docs only; no product code changed).
