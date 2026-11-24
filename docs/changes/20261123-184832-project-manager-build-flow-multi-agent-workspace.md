# build flow multi-agent workspace

- **Agent:** project-manager
- **When:** 2026-11-23 18:48 PST
- **Branch:** feat/subagent-workspace

Why: deliver the requested Claude Code-style multi-agent workspace build flow (navigator, per-agent workspaces, direct follow-up messaging) on the existing Agent-Termo runtime
Changed:
- docs/architecture.md — §21 multi-agent workspace contract (D1-D5, type contracts, data flow, UI/keyboard, test seams, limitations)
- docs/DESIGN_SYSTEM.md — §10 live-TUI workspace design (layout, navigator, composer, approval panel, narrow-terminal, accessibility)
- src/runtime/agent-tree.ts, agent-transcript.ts, agent-selection.ts, agent-workspace.ts (new); subagents.ts extended
- src/main.ts — persistent delegated sessions, follow-up turns, queueing, transcripts, approval detail/labels, stop-all, /clear, scoped cancellation
- src/ui/workspace-view.ts, display-text.ts (new); tui.tsx — navigator below composer, content switching, per-agent drafts/scroll, routed composer, Ctrl+X navigation/chord, approval panel, sanitization
- tests — 5 new workspace suites + permissions/display-text + security regressions; docs/TESTING.md, docs/SECURITY.md, docs/DEPLOY.md, docs/MEMORY.md
- Flow: architect -> uiux -> backend -> frontend -> test-agent -> width-fix -> security audit -> security fixes -> regression tests -> re-audit -> local deployment. Backend/frontend were serialized (shared interfaces, hard dependency) rather than parallel; noted here as the stage adaptation.
Verify: bun run typecheck exit 0; bun run test = 45 files passed / 1 skipped, 446 passed / 2 skipped; bun run build clean (dist/cli.js 271,741 bytes); bun dist/cli.js --version -> 2.0.7; bun run test:package -> agent-termo@2.0.7; security re-audit has no open critical/high
Revert: revert the merge commit on master or `git checkout master && git reset --hard 6a02c44` only with explicit approval; the feature branch is feat/subagent-workspace
