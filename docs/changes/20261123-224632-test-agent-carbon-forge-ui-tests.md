# carbon forge ui tests

- **Agent:** test-agent
- **When:** 2026-11-23 22:46 PST
- **Branch:** feat/carbon-forge-theme

Why: Cover the Carbon Forge theme, one-line footer, live-registry /help, and terminal-title feature implemented in 53de170 with spec-derived unit tests.
Changed:
- tests/unit/theme.test.ts — exact palette/roles, static no-legacy-hex/Chalk scan, composer-border focus wiring
- tests/unit/footer.test.ts — canonical footer line, dynamic/absent values, documented drop order, variants, transient status
- tests/unit/help.test.ts — Commands/Shortcuts structure, registry completeness, aliases/project marker, dispatch parse of src/main.ts, non-TUI printHelp, live-registry seam
- tests/unit/terminal-title.test.ts — exact OSC/title-stack sequences, non-TTY no-op, install/restore/idempotency, exit fallback via injected IO, wiring
- docs/TESTING.md — Carbon Forge UI coverage section, updated baseline and manual-only gaps
Verify: bun run typecheck exit 0; bun run test = 49 files passed / 1 skipped, 514 tests passed / 2 skipped (baseline 45/1, 446/2); keyboard/workspace suites 6 files / 131 tests passed; bun run build exit 0; bun dist/cli.js --version -> 2.0.7
Revert: delete the four tests/unit/*.test.ts files and revert the docs/TESTING.md section; no product source changed
