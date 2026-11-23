# fix(ui): accept pasted API keys in masked provider prompt

- **Agent:** frontend-expert
- **When:** 2026-11-23 15:30 PST
- **Branch:** master

Why: In the live TUI, /providers -> handleProvidersCommand calls input.questionSecret (src/main.ts:1313). questionSecret sets secretMode (src/ui/tui.tsx:824), which makes the Show at src/ui/tui.tsx:571 unmount the focused <textarea>. Key input arrives only through @opentui/solid useKeyboard, which subscribes to keypress/keyrelease only (node_modules/@opentui/solid/index.js:145-160); KeyEvent has no "paste" name, so the secret branch case name === "paste" (src/ui/tui.tsx:328) is unreachable dead code. Bracketed paste is delivered as a separate PasteEvent on the "paste" event (InternalKeyHandler.emitWithPriority, node_modules/@opentui/core/chunk-node-5cqzgmq3.js:298, runs global paste listeners before focused-renderable handlers). With the textarea unmounted in secret mode there was no paste receiver, so terminal paste was silently dropped and users had to type the API key character by character.
Changed:
- src/ui/tui.tsx — added a global usePaste handler in App: only while secretMode() is true it appends decodePasteBytes(event.bytes) to secretDraft via the new exported pure helper applySecretPaste(current, pasted) and calls event.preventDefault(); when secret mode is inactive it returns without preventDefault, preserving the focused textarea/picker behavior. Added the applySecretPaste helper near the other pure UI helpers.
- src/ui/index.ts — re-export applySecretPaste alongside formatContextMeter/formatTokenCount, matching the existing pure-helper export pattern.
Verify: `bun run typecheck` exit 0; `bun run test` = 248 passed / 2 skipped (35 files passed, 1 skipped; MEMORY.md's 242 baseline predates the current HEAD test set); `bun run build` exit 0 (`dist/cli.js`); `git diff --stat` for this fix = src/ui/tui.tsx + src/ui/index.ts, 19 insertions / 2 deletions (docs/TIMELINE.md was already modified before this work). Helper exercised directly with bun -e: "sk-" + "abc" -> "sk-abc", and UTF-8 bytes -> correctly appended. Real interactive TUI paste was not exercised (needs a live terminal session).
Revert: restore the prior versions of src/ui/tui.tsx and src/ui/index.ts (reverse the two-file diff); no other files were changed by this fix.
