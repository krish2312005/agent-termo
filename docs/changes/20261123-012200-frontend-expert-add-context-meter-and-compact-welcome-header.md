# add context meter and compact welcome header

- **Agent:** frontend-expert
- **When:** 2026-11-23 01:21 PST
- **Branch:** local-branch

Why: Implement the specified Context meter UI (formatContextMeter, screen state, bottom status line), add the rounded top header frame, and replace the box-drawn welcome banner with a compact four-line welcome.
Changed:
- src/ui/tui.tsx — added pure formatContextMeter (7-cell bar, clamped ratio, 100% fallback for non-finite/non-positive budget); added ScreenContext/ScreenState and typed the screen signal; setScreenStatus accepts context; bottom status line prepends "context <meter> · " when present; top row wrapped in a rounded #6D625A border box.
- src/ui/index.ts — rewrote printWelcome to four compact lines using package.json version; server re-export of formatContextMeter from the facade.
Verify: `bun run typecheck` exits 0; `bunx vitest run tests/unit/keys.test.ts tests/unit/permission-colors.test.ts` = 2 files, 27 tests passed. Meter examples: 43k/100k -> "▰▰▰▱▱▱▱ 43%", 0/1k -> "▱▱▱▱▱▱▱ 0%", 2k/1k -> "▰▰▰▰▰▰▰ 100%".
Revert: restore src/ui/tui.tsx and src/ui/index.ts from the previous commit (git checkout -- src/ui/tui.tsx src/ui/index.ts).
