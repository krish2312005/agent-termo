# docs(testing): document secret paste coverage

- **Agent:** test-agent
- **When:** 2026-11-23 15:34 PST
- **Branch:** fix/ui-paste-api-keys

Why: Keep the test-agent-owned testing guide current after adding the masked secret-paste regression test, and record that live TUI paste wiring is still unverified.
Changed:
- docs/TESTING.md — added UI pure-helper coverage bullet (context meter + applySecretPaste) and a known gap for interactive TUI input handling
Verify: docs-only change; suite state from the prior test-agent entry stands (252 passed / 2 skipped, 37 files)
Revert: revert docs/TESTING.md to the previous two-bullet wording
