# update tests for warm terminal palette revert

- **Agent:** test-agent
- **When:** 2026-11-23 23:23 PST
- **Branch:** revert/carbon-forge-palette

Why: Carbon Forge was reverted to the pre-Carbon-Forge Warm Terminal palette (e79e81f + ed2ec6b); the theme and permission tests still asserted Carbon Forge tokens, roles and the focus-based composer border, so 14 tests failed.
Changed:
- tests/unit/theme.test.ts — rewrote for the exact 25-token Warm Terminal COLORS and exact ROLES (selection #F0B38D distinct from brand #D99168, permission borders #6D625A/#D99168/#FF5555); asserts removed roles/aliases absent; adds recursive src/ regression gates for the 12 Carbon Forge hexes, warm-hex-only-in-theme.ts, no hex literals in tui/index/subagent-view, restored named Chalk fallbacks, and the permission-colored composer border callsite; keeps UiKind/markdown SyntaxStyle checks.
- tests/unit/permission-colors.test.ts — restored old contract: permissionBarColor ask #6D625A, files #D99168, auto #FF5555 (asserted, not banned); inactive ROLES.composerBorder #6D625A; no composerBorderFocused; terminal panel height tests unchanged.
- docs/TESTING.md — reframed the theme section as Warm Terminal (Carbon Forge reverted), documented the restored permission border contract and no-Carbon-Forge-hex gate, noted footer/help/title/subagent-view tests are unchanged, renamed the manual-only note, and updated the current baseline.
Verify: bun run typecheck exit 0; bun run test = 514 passed / 2 skipped (49 files passed, 1 skipped); bun run build exit 0; manual grep gates: no Carbon Forge hexes under src/, all 25 warm hexes only in src/ui/theme.ts, no hex literals in the three live UI files, no transitional roles/aliases. footer.test.ts/help.test.ts/subagent-view.test.ts untouched.
Revert: git checkout -- tests/unit/theme.test.ts tests/unit/permission-colors.test.ts docs/TESTING.md
