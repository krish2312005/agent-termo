# add carbon forge theme and live ui spec

- **Agent:** uiux-designer
- **When:** 2026-11-23 22:15 PST
- **Branch:** feat/carbon-forge-theme

Why: Apply the Carbon Forge palette consistently and define the single-line footer and complete /help reference.
Changed:
- src/ui/theme.ts — new flat COLORS/ROLES Carbon Forge token module (8 foundation colors + 4 documented derivations; no provider/light mode)
- docs/DESIGN_SYSTEM.md — pre-Carbon-Forge live palette marked superseded; §10 migrated to Carbon Forge; new authoritative §11 (palette, derivations, composer focus, one-line footer, /help)
Verify: static review of src/ui/theme.ts and docs/DESIGN_SYSTEM.md §11; after frontend-expert wiring run bun run typecheck, bun run test, bun run build, and grep src/ui for legacy hexes and #FF5555
Revert: delete src/ui/theme.ts and restore docs/DESIGN_SYSTEM.md from the previous commit (git-manager only)
