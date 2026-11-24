# correct subagent color spec to pre-theme source

- **Agent:** uiux-designer
- **When:** 2026-11-23 23:13 PST
- **Branch:** revert/carbon-forge-palette

Why: The first Warm Terminal draft incorrectly documented navigator sub-agent names, user -> @name targets, and content-status names as subagentLabel; the pre-theme source a9f0892 is authoritative.
Changed:
- docs/DESIGN_SYSTEM.md — navigator names uniform text #E6E1DC (selected #F0B38D); user -> @name target userLabel #8FCB9B; content-status accent brand #D99168 for main and sub-agent; content-status separator border #6D625A and detail detailText #C9C1BA; subagentLabel #8D857D narrowed to the ⏺ <name> sub-agent assistant label only. Footer/help layout and content unchanged.
Verify: grep -n "subagentLabel" docs/DESIGN_SYSTEM.md shows only the ⏺ <name> uses/tables; grep confirms navigator names text/selection, user targets userLabel, content-status accent brand; bun run typecheck exit 0.
Revert: git restore docs/DESIGN_SYSTEM.md (before commit) or revert the stage commit.
