# review+commit docs connected-provider fix memory timeline

- **Agent:** git-manager
- **When:** 2026-11-23 15:54 PST
- **Branch:** fix/ui-paste-api-keys

Why: Final docs stage of the /providers grouping + saved-key fast-switch fix needed review and commit. Verdict: approved. Diff is docs-only since c5e5e1a (MEMORY.md status + new section, two change logs, two TIMELINE rows); no src/tests/package changes, no historical content removed, no secrets (fake sk-test-* references only).
Changed:
- docs/MEMORY.md — status sentence plus "Connected providers: grouping + saved-key fast switch" section (definition, helpers, picker headers, /providers list, selection flow, 23 tests, verification, unverified items, branch state); committed as 93774e6.
- docs/changes/20261123-155328-project-manager-fix-flow-connected-providers-grouping-and-saved-ke.md, docs/changes/20261123-155243-git-manager-review-commit-provider-grouping-fast-switch-regres.md, docs/TIMELINE.md — stage logs and rows, same commit 93774e6.
Verify: claims checked against shipped code (isProviderConnected trims saved apiKey; providerActivationModel fallback order; groupProviders saved-over-builtin dedupe and unsaved-current active; picker headers "— Connected —"/"— Not connected —" skipped by nextPickerIndex; Use saved vs Enter new key flow; unconnected full setup). bun run typecheck exit 0; bun run test = 275 passed / 2 skipped (38 files passed, 1 skipped); bun run build clean -> dist/cli.js 233,219 bytes. Branch fix/ui-paste-api-keys, master still 680ed66.
Revert: git revert 93774e6 on fix/ui-paste-api-keys.
