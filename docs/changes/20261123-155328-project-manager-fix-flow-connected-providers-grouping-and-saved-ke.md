# fix flow: connected providers grouping and saved-key fast switch

- **Agent:** project-manager
- **When:** 2026-11-23 15:53 PST
- **Branch:** fix/ui-paste-api-keys

Why: User requested that a provider configured once can be re-selected without re-entering its API key, that a visible option exists to enter a new key, and that `/providers` visibly separates Connected from Not connected providers. This follows the pasted-API-key fix on the same branch.
Changed:
- src/llm/providers.ts — pure `isProviderConnected`, `providerActivationModel`, `groupProviders` helpers (connected = saved config with non-empty trimmed key; no network checks).
- src/ui/tui.tsx — optional picker group headers (non-selectable, skipped by keyboard navigation/filtering); exported `filteredPicker`/`nextPickerIndex`; ungrouped pick callers unchanged.
- src/main.ts — `/providers list` and picker group Connected vs Not connected; connected providers fast-switch with saved key/model; "Use saved API key" vs "Enter a new API key" (masked `questionSecret`, paste path intact); unconnected providers keep the full setup flow; `/providers use` unchanged.
- tests/unit/providers.test.ts, tests/unit/provider-config.test.ts, tests/unit/picker-groups.test.ts — 23 regression tests using fake `sk-test-*` keys and an isolated temp `AGENT_TERMO_DIR`.
- docs/MEMORY.md, docs/TESTING.md, docs/TIMELINE.md, docs/changes/* — memory status/decision record, coverage and known gaps, stage/git logs.
- Commits: 6819770 (pre-existing runtime log lines), f51f46a (fix), c5e5e1a (tests); the docs commit follows.
Verify: `bun run typecheck` exit 0; `bun run test` = 275 passed / 2 skipped (38 files passed, 1 skipped); `bun run build` clean (`dist/cli.js`, 233,219 bytes). Interactive TUI grouping/key-choice and live key replacement still require manual verification.
Revert: Revert f51f46a and c5e5e1a (and the docs commit) on fix/ui-paste-api-keys; do not modify master (still at 680ed66). The pre-existing paste fix (7cf2ca8/a4cd4e3/4242e0a) is independent.
