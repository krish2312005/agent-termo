# multi-agent workspace live TUI design spec

- **Agent:** uiux-designer
- **When:** 2026-11-23 16:23 PST
- **Branch:** feat/subagent-workspace

Why: define the visual design for the §21 multi-agent workspace without changing behavior or adding a theme system
Changed:
- docs/DESIGN_SYSTEM.md — appended section 10 (live palette reality, layout, composer states, navigator anatomy/priority, status colors, content area/scroll, edge cases/mockups, keyboard hint, accessibility, open items)
Verify: inspect docs/DESIGN_SYSTEM.md section 10; confirm the quoted hex values against src/ui/tui.tsx; no code or tests were changed
Revert: remove the appended section 10 from docs/DESIGN_SYSTEM.md
