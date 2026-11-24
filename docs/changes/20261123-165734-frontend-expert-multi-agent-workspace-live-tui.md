# multi-agent workspace live TUI

- **Agent:** frontend-expert
- **When:** 2026-11-23 16:57 PST
- **Branch:** feat/subagent-workspace

Why: Implement the §21 multi-agent workspace UI: selecting an agent must enter that agent's own conversation workspace, the composer must target that stable agent id, and the navigator must sit directly below the composer. The design spec (DESIGN_SYSTEM §10) and architecture §21.6 are the visual and behavioral contracts; the runtime modules already existed.
Changed:
- src/ui/workspace-view.ts (new) — pure navigator row formatting/glyphs/truncation, content status row, composer routing, transcript-to-UiEntry mapping, and the workspace key reducer.
- src/ui/tui.tsx — workspace signals/subscriptions; content status row + separator; main/sub-agent content switching with per-agent scroll (one scrollbox, per-agent scrollTop, conditional tail-follow, no stickyScroll); navigator below the composer (7-row window + overflow + hint); composer prefix/placeholder/drafts/notice/approval banner; routed submitInput, live composer during runs, focus modes and Ctrl+X / Ctrl+X Ctrl+K handling; question()/submitExternal() no longer clobber a sub-agent draft; key handling preserved (Ctrl+O/T/K/C, Tab, Shift+Enter, history, completion, picker, secret, legacy Apple Terminal).
Verify: bun run typecheck (exit 0); bun run test = 275 passed / 2 skipped (38 files passed, 1 skipped); bun run build clean (dist/cli.js); bun dist/cli.js --version -> 2.0.7. No live TTY here, so interactive rendering/keyboard behavior is unverified manually.
Revert: Revert this commit (delete src/ui/workspace-view.ts and restore src/ui/tui.tsx).
