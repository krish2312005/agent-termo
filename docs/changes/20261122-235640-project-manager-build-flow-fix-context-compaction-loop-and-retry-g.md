# Build flow: fix context compaction, loop and retry gate

- **Agent:** project-manager
- **When:** 2026-11-22 23:56 PST
- **Branch:** local-branch

Why: User reported Agent-Termo gets stuck in a loop and cannot make production-level systems. Run the build flow to fix three concrete root causes first, then add architecture docs.
Plan:
- Skip uiux-designer and frontend-expert: CLI/TUI agent, not a web app; TUI already exists (src/ui/tui.tsx).
- Skip security-expert: fixes touch context budgeting and failure-retry gating, not permissions/shell/fs boundaries.
- Stage order: backend-expert (3 bug fixes) -> test-agent (regression tests) -> architect (docs/architecture/*.md + plan.md) -> deployment-expert (typecheck/test/build/CLI smoke). git-manager reviews+commits after every stage, local-branch only, no push.
Changed:
- docs/MEMORY.md — to be updated at end of flow with status.
Verify: typecheck/test/build green at end; timeline shows one row per stage.
Revert: git revert the resulting commits on local-branch.
