# review and commit warm terminal callsite stage

- **Agent:** git-manager
- **When:** 2026-11-23 23:21 PST
- **Branch:** revert/carbon-forge-palette

Why: Stage-3 git gate for the Warm Terminal palette revert: verify the frontend callsite restoration against the pre-theme source, then commit the stage on revert/carbon-forge-palette.
Changed:
- src/ui/tui.tsx — reviewed and approved; permissionBarColor() re-exported on theme roles (ask #6D625A, files #D99168, auto #FF5555); composer border follows inputActive()/permission mode; header, content status, meta, user target, terminal, picker, completion, approval, secret bullets, navigator names and footer bound to restored roles; orphaned composerFocused removed; keyboard/useKeyboard/usePaste regions untouched.
- src/ui/index.ts and src/ui/subagent-view.ts — reviewed and approved; non-TUI Chalk fallback restored to pre-theme named colors (subagent-view byte-identical to a9f0892); /help content, sections, commands, aliases and footer behavior unchanged.
- src/ui/theme.ts — reviewed and approved; only transitional aliases removed (COLORS accent/copper/teal/textDim, ROLES subagent/composerBorderFocused); no palette hex changed.
- docs/changes/20261123-231855-frontend-expert-restore-warm-terminal-palette-at-ui-callsites.md — included in the same commit.
Verdict: APPROVED — role hexes match the targeted pre-theme table exactly; bun run typecheck exit 0; bun run build exit 0; targeted footer/help/subagent-view suites 3 files / 50 tests passed; full suite 47 passed / 2 failed / 1 skipped with failures only in theme.test.ts and permission-colors.test.ts (Carbon Forge assertions pending test-agent); Carbon Forge hex grep under src/ empty; six-digit hexes under src/ui only in theme.ts; no transitional references; terminal-title.ts, main.ts, cli.ts, runtime, tests and keyboard handlers untouched.
Verify: bun run typecheck; bun run build; bunx vitest run tests/unit/footer.test.ts tests/unit/help.test.ts tests/unit/subagent-view.test.ts; git show --stat HEAD.
Revert: git revert this stage commit on revert/carbon-forge-palette.
