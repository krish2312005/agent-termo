# provider grouping fast-switch regression tests

- **Agent:** test-agent
- **When:** 2026-11-23 15:51 PST
- **Branch:** fix/ui-paste-api-keys

Why: Stage 2 regression tests for the /providers Connected/Not connected grouping and fast-switch behavior landed in f51f46a; the pure helpers, picker grouping helpers, and config persistence/activation paths had no direct tests.
Changed:
- tests/unit/providers.test.ts — added isProviderConnected, providerActivationModel, and groupProviders cases (connected vs not, built-ins, custom endpoints, active marker, env-only current provider, dedupe).
- tests/unit/provider-config.test.ts — new temp-AGENT_TERMO_DIR suite: saved-key activation with no prompt, key rotation persistence/activeProvider/env, 0600/0700 modes (non-Windows), empty-key classification.
- tests/unit/picker-groups.test.ts — new filteredPicker/nextPickerIndex suite: headers, header skipping both directions, no orphan headers, ungrouped backward compatibility, allowCustom.
- docs/TESTING.md — recorded the new coverage and extended known gaps.
Verify: bun run typecheck exit 0; bun run test = 275 passed / 2 skipped (38 files passed, 1 skipped); 23 new cases ran (13 providers, 4 config, 6 picker). Fake sk-test-* keys only; no product code changed.
Revert: delete tests/unit/provider-config.test.ts and tests/unit/picker-groups.test.ts, then git checkout -- tests/unit/providers.test.ts docs/TESTING.md (docs/TIMELINE.md entry is append-only).
