# Testing

## How to run

```bash
bun run typecheck        # TypeScript (src only; tests are excluded from tsconfig)
bun run test             # Run the whole Vitest suite once
bun run test:watch       # Watch mode
bun run test:coverage    # Coverage report (v8)
```

Vitest configuration lives in `vitest.config.ts`. Tests live in `tests/unit/` and
`tests/integration/` (pattern `tests/**/*.test.ts`).

## What is covered

- **Context budgeting/compaction** (`tests/unit/context.test.ts`): token estimation,
  input-budget resolution, non-premature compaction, verbatim preservation of the
  objective/current goal/most-recent tool result/failed-call diagnostics, and
  deterministic results for identical inputs.
- **Malformed model output** (`tests/unit/malformed-output.test.ts`): degenerate
  raw control-token detection (positive sample, normal prose and valid `<tool_call>`
  markup negatives), non-retryable `MalformedModelOutputError` classification, and
  the streaming/non-streaming guard throwing without yielding content (fake
  transport, no network). `tests/unit/models.test.ts` asserts the nemotron
  `nvidia/nemotron-3.5-super-vl-120b-a12b` 262K context window and input budget.
- **Tool-call retry budget** (`tests/unit/retry-budget.test.ts`): one genuine retry
  before pausing, signature-scoped counting, and clearing only after a successful
  side-effecting corrective action.
- **Task resumability** (`tests/unit/task-state.test.ts`): interrupted vs idle task
  state, transient provider errors, retry gate helpers, and delegation fan-out.
- **Tool-loop safety budget** (`tests/unit/tool-loop-budget.test.ts`): wall-clock stop
  reason (no model-turn cap).
- **UI pure helpers** (`tests/unit/context-meter.test.ts`, `tests/unit/secret-paste.test.ts`):
  context-meter formatting plus masked secret-paste application (draft append, UTF-8
  `Uint8Array` decode, empty no-op, 60+ char key preserved intact).
- **Provider connection grouping and fast switch** (`tests/unit/providers.test.ts`,
  `tests/unit/picker-groups.test.ts`, `tests/unit/provider-config.test.ts`):
  `isProviderConnected` rejects empty/whitespace/missing keys; `providerActivationModel`
  prefers the saved model, then the definition suggestion, then the stored suggestion;
  and `groupProviders` splits saved and built-in providers into Connected/Not
  connected, keeps the active marker (including an unsaved env-only current provider),
  and dedupes ids with the saved entry winning over the built-in. Picker helper tests
  cover non-selectable group headers, `nextPickerIndex` skipping them in both
  directions and stopping at the current row, filtering that drops headers for groups
  with no matches, ungrouped lists staying header-free, and `allowCustom` typed values.
  Config tests use a temp `AGENT_TERMO_DIR` and fake `sk-test-*` keys to prove a
  connected provider activates its saved key/model from disk with no prompt or network,
  a rotated key replaces the old key in the listing and on disk (with `activeProvider`
  and the `AGENT_TERMO_*` env updated), file/dir permissions stay 0600/0700 off
  Windows, and a saved provider with an empty key classifies as Not connected.
- **Tool-loop orchestration** (`tests/integration/tool-loop.test.ts`): real
  tool execution through `runToolLoop`, including failing-call recovery, completion
  gate blocking, duplicate-call suppression, repeated-failure pause, and corrective
  action clearing the retry budget so a failed call can succeed on retry.
- Other unit suites cover approval queues, checkpoints, checks, delegation, markdown,
  models, plans, providers, streaming, subagents, terminal sessions, and workspace
  path validation. Integration suites cover sessions, skills, browser verification,
  and the packaged runtime.

## Known gaps

- `bun run typecheck` only checks `src/` (tests are excluded by `tsconfig.json`);
  test files are transformed, not type-checked, by Vitest.
- Integration tests exercise the real tool executor (file I/O, `bash:execute`, git)
  inside temporary directories; they intentionally print the agent UI output.
- Provider/API tests use mocks and do not make real NIM network calls.
- Interactive TUI input handling (the `usePaste`/`useKeyboard` subscriptions and a real
  terminal paste) is not automated; `secret-paste.test.ts` covers only the extracted
  pure helper `applySecretPaste`. The same applies to the picker key handler: the
  zero-match-Enter no-op and backspace reset behavior live in `src/ui/tui.tsx` and are
  not automated, only the `filteredPicker`/`nextPickerIndex` helpers they use.
- The interactive `/providers` picker and the "Use saved API key" vs "Enter a new API
  key" flow, plus the "requires a key" enforcement for unconnected providers, live in
  the unexported `handleProvidersCommand` in `src/main.ts` and are not automated.
  Tests cover only the extracted grouping/config helpers; a saved empty-key provider is
  verified as classified Not connected, not the prompt that rejects it.
- Real terminal rendering of group headers, live provider key replacement/switching
  against a real API, and bracketed paste in the new-key path require manual
  verification.
- Provider config tests use temp `AGENT_TERMO_DIR` directories and fake `sk-test-*`
  keys; they never read or write the real `~/.agent-termo`.
