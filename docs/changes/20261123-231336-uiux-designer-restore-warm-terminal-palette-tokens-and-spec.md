# restore warm terminal palette tokens and spec

- **Agent:** uiux-designer
- **When:** 2026-11-23 23:13 PST
- **Branch:** revert/carbon-forge-palette

Why: The user rejected the Carbon Forge palette and requested the pre-Carbon-Forge UI colors restored while keeping the footer, /help, and terminal-title implementations.
Changed:
- src/ui/theme.ts — restored the exact Warm Terminal COLORS/ROLES from a9f0892; panelSurface derives from #11100F; permission roles restored (#6D625A ask, #D99168 files, #FF5555 auto); transitional subagent/composerBorderFocused roles retained only so the untouched callsites typecheck.
- docs/DESIGN_SYSTEM.md — rewrote §11 as the authoritative Warm Terminal spec and recolored §10 live references; Carbon Forge is recorded as reverted at the user's request, not deleted.
Verify: cd /Users/apple/Desktop/agent-termo && bun run typecheck (exit 0); no Carbon Forge hexes under src/; git diff --stat shows only src/ui/theme.ts and docs/DESIGN_SYSTEM.md.
Revert: git restore src/ui/theme.ts docs/DESIGN_SYSTEM.md (before commit) or revert the stage commit.
