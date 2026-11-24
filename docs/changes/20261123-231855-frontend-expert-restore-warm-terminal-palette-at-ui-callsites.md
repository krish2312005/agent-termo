# restore warm terminal palette at ui callsites

- **Agent:** frontend-expert
- **When:** 2026-11-23 23:18 PST
- **Branch:** revert/carbon-forge-palette

Why: The user rejected Carbon Forge. The pre-Carbon-Forge warm palette was restored in theme.ts (e79e81f); this stage applies it at the live UI callsites while keeping the one-line footer, the registry-driven /help content, and the terminal title unchanged.
Changed:
- src/ui/tui.tsx — restored exported permissionBarColor() on theme roles; composer border follows inputActive()/permission mode; restored warm role callsites (header, content status, meta color, user sub-agent target, terminal panel, picker, completion, approval panel, secret bullets, navigator names); removed the now-orphaned composerFocused helper.
- src/ui/subagent-view.ts — removed the COLORS import and ink map; restored pre-theme named Chalk colors for status icons, strip, inspector, and panel; structure/behavior unchanged.
- src/ui/index.ts — removed the COLORS import and ink map; restored pre-theme named Chalk colors for inline code, links, markdown printer prefixes, headings, rules, lists, and quotes; help/registry/footer content unchanged.
- src/ui/theme.ts — removed transitional ROLES.subagent, ROLES.composerBorderFocused, and COLORS aliases accent/copper/teal/textDim; no palette value changed.
Verify: bun run typecheck exit 0; bun run build exit 0; bunx vitest run footer/help/subagent-view = 50 passed; full suite = 47 files passed, 2 failed (theme, permission-colors — expected Carbon Forge assertions pending test-agent updates), 1 skipped; no Carbon Forge hexes under src/; six-digit hexes under src/ui only in theme.ts; no transitional references remain; useKeyboard/usePaste regions byte-identical; git status showed only the four UI files before logging.
Revert: git checkout -- src/ui/tui.tsx src/ui/index.ts src/ui/subagent-view.ts src/ui/theme.ts
