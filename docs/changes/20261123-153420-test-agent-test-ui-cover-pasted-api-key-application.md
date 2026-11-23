# test(ui): cover pasted API key application

- **Agent:** test-agent
- **When:** 2026-11-23 15:34 PST
- **Branch:** fix/ui-paste-api-keys

Why: Regression coverage for the Stage 1 fix (7cf2ca8) where bracketed paste into the masked /providers API-key prompt was dropped. Covers only the extracted pure helper applySecretPaste: string append, UTF-8 Uint8Array decode, empty-paste no-op, and a 72-char fake key preserved intact. It does NOT exercise the usePaste subscription wiring or a real terminal, so live TUI paste remains unverified.
Changed:
- tests/unit/secret-paste.test.ts — new vitest file with four cases targeting applySecretPaste
Verify: bun run typecheck exit 0; bun run test -> 252 passed / 2 skipped (36 files passed, 1 skipped of 37); targeted bunx vitest run tests/unit/secret-paste.test.ts -> 4 passed. Before fix: helper absent at 680ed66 (git show grep = 0 in tui.tsx and index.ts); a temp probe showed a missing named export resolves to undefined under vitest, so the test would fail pre-fix with TypeError at first call (probe removed).
Revert: delete tests/unit/secret-paste.test.ts (no product code changed)
