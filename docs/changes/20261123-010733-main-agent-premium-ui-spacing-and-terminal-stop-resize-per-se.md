# premium UI spacing and terminal stop resize per-session kill

- **Agent:** main-agent
- **When:** 2026-11-23 01:07 PST
- **Branch:** local-branch

Why: The chat had no vertical rhythm between user prompts and assistant replies, the terminal panel showed only the last 5 lines at a fixed height and never showed the command, and there was no keyboard way to stop the running command or kill one specific background session.
Changed:
- src/ui/tui.tsx — add marginTop + "❯ You"/"⏺ Agent-Termo" labels per entry; terminal panel now shows the full command, all output lines (capped at 2000), Ctrl+T expands to ~60% of the screen, Ctrl+K stops a running command when the prompt is idle; add terminalPanelHeight helper and setTerminalStopHandler.
- src/ui/screen.ts — re-export setTerminalStopHandler and terminalPanelHeight.
- src/runtime/terminal-sessions.ts — add listTerminalSessions() (no output payload).
- src/main.ts — register the Ctrl+K stop handler; /terminal list now shows running background session IDs; /terminal kill <id> stops one specific session.
- tests/unit/{permission-colors,terminal-sessions}.test.ts — cover terminalPanelHeight and listTerminalSessions.
- README.md — document the new keybindings and /terminal kill <id>.
Verify: bun run typecheck (exit 0); bun run test (220 passed / 2 skipped); bun run build (dist/cli.js).
Revert: git revert <this-commit>
