# providers connected grouping and fast switch

- **Agent:** frontend-expert
- **When:** 2026-11-23 15:46 PST
- **Branch:** fix/ui-paste-api-keys

Why: Selecting an already-saved provider in /providers always re-ran masked API-key entry, a live model fetch, and the model picker, so switching felt like a fresh setup. /providers list and the picker also showed no connected vs not-connected distinction.
Changed:
- src/llm/providers.ts — added pure exported helpers isProviderConnected (non-empty trimmed saved apiKey), providerActivationModel (saved model, else first suggested model), and groupProviders (splits saved providers + built-ins into connected/notConnected, keeps the active marker for unsaved env-only providers).
- src/ui/tui.tsx — PickItem gained optional group/header; filteredPicker inserts non-selectable section headers and skips them while filtering; new exported nextPickerIndex skips headers for up/down and initial selection; Enter ignores headers; picker renders headers as "— Connected —"/"— Not connected —"; grouped pickers keep allowCustom.
- src/main.ts — /providers list prints Connected and Not connected sections; the interactive picker uses the same grouping; selecting a connected provider offers "Use saved API key" (activate immediately, no key prompt, no model fetch) or "Enter a new API key" (masked questionSecret, saveProviderConfig + activate, empty/cancel changes nothing); unconnected providers keep the existing full setup flow.
Verify: bun run typecheck exit 0; bun run test 252 passed / 2 skipped (36 files passed, 1 skipped); bun run build clean -> dist/cli.js.
Revert: git checkout -- src/llm/providers.ts src/ui/tui.tsx src/main.ts on branch fix/ui-paste-api-keys (no config schema change).
