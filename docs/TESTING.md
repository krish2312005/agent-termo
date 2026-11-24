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
- **Display sanitizer** (`tests/unit/display-text.test.ts`): 7- and 8-bit
  CSI/OSC, 7- and 8-bit DCS/SOS/PM/APC, other two-character ESC sequences and
  lone ESC, BEL/C0/C1/DEL/CR removal, ASCII/CJK/emoji/punctuation preservation,
  newline opt-in (`keepNewlines`), single-line flattening, unterminated control
  strings dropped without leaking the payload or hanging, and 8k linear input
  (plain, mixed and unterminated).
- **Command approval policy** (`tests/unit/permissions.test.ts`):
  `isCommandApprovalRequired` true for `mcp_*`, `bash:execute`, `bash:start`,
  `bash:stop`, `browser:verify`, `git:commit`, `git:push` and false for
  read-only/file/status tools; `supportsPersistentApproval` false for `mcp_*`,
  `bash:stop`, `browser:verify`; and `commandApprovalKey` exact keys for trimmed
  bash commands, `bash:stop` session ids, `browser:verify` base URLs, git
  messages, and MCP JSON arguments (tool-prefixed so a key cannot be replayed
  across tools).
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
- **Agent tree and selection** (`tests/unit/agent-tree.test.ts`): main is always the
  first node; DFS pre-order sorted by `(startedAt, id)`; generic depth/nesting;
  direct-child active counts; completed/failed/stopped retention; sibling-only
  duplicate-name flags; orphan/missing-parent/self-link/cycle rows attach to main;
  `cancelled` -> `stopped`; selection clamping with no wrap; unknown-id fallback;
  parent lookup; `reconcileSelection`; and the `visibleAgentRows` window bounds
  (centering, top/bottom clamping, 1-row and fractional limits, overflow totals).
- **Per-agent transcripts** (`tests/unit/agent-transcript.test.ts`): agent isolation
  and current snapshots for background (non-selected) agents; user/assistant entries;
  delta accumulation and authoritative final replacement; tool start/end pairing by
  `callId` with late/foreign/mismatched ends ignored; status dedupe; error finalizing
  a streaming assistant entry; the 500-entry, 256 KiB and 8,000-char caps with exactly
  one `truncated` marker; snapshot copy semantics; subscribe/unsubscribe; throwing
  listener isolation; clear-one/clear-all; and the tool-args summarizer.
- **Agent workspace routing** (`tests/unit/agent-workspace.test.ts`): the full
  `decideMessageDisposition` matrix (empty, unknown, duplicate queued text, the
  2,000 ms dispatch window boundary, 10-message queue limit, running/waiting queue,
  idle/completed/failed/stopped dispatch); id-only routing for two agents with the
  same display name; unknown ids never fall back to main/parent; `unavailable` only
  for a missing main binding; main `submitExternal` dispatch and FIFO queue drain;
  main running/waiting queueing with a real cap; the idle-with-no-pending-question
  queue cap (SEC-07: ten accepted, the 11th rejected with `queue_full`, queue length
  stays ten, drain then accepts again); stop-all cancelling each live target
  once (main + handles), clearing the queue and returning the live count; reset
  clearing handles/registry/transcripts/queues/selection while retaining main
  bindings; workspace notifications for main state, handles and registry events;
  and defensive main-state copies/valid patches. The duplicate windows use injected
  `now`/fake timers, never real sleeps.
- **Agent selection state** (`tests/unit/agent-selection.test.ts`): get/set,
  same/empty/non-string no-ops, subscribe/unsubscribe, throwing-listener isolation,
  reset-to-main notifications, and proof that selection changes never mutate the
  sub-agent registry (navigation-only).
- **Workspace UI helpers** (`tests/unit/workspace-view.test.ts`): composer routing
  (empty, main idle -> repl, main busy -> `agent(main)`, sub-agent target while main
  awaits, unknown target, slash/exit/quit idle vs `command_while_busy`); the pure
  workspace key reducer (Ctrl+X arms/enters navigator, clamped arrows, Enter,
  Esc parent then composer at main, `Ctrl+X Ctrl+K` only inside the 1,500 ms window,
  any other key disarms, composer focus never consumes navigation keys); navigator
  row formatting (selection marker, all glyphs/labels, connectors/depth, duplicate
  `#id6` suffix, metadata drop order, no fabricated tokens/since, width/no-wrap
  truncation); the content status row; the approval panel (sanitized owner label
  with `main` fallback, at most six real detail lines with `+`/`-`/space diff
  prefixes and leading indentation preserved, width clipping, owner-only for
  missing/blank detail); sanitization of rows, content status, composer
  prefix/placeholder and transcript content against ESC/OSC/CR/control payloads
  (CJK/emoji preserved, width invariant re-checked after sanitization); the
  `main`/`MAIN`/`Main` sub-agent spoof suffix in rows, status and composer; and
  `transcriptToUiEntries` (user/assistant agent labels, markdown/streaming,
  tool/success/error/dim mapping, status/error/truncated lines, no cross-agent
  entries, the 4,000-line tool-result cap: first status line + 40 continuations +
  one `… N more line(s)` marker with singular/plural boundaries, ok/error state
  retained, and ESC/OSC/CR stripped from every rendered line).
- **Sub-agent registry extensions** (`tests/unit/subagents.test.ts`): `MAIN_AGENT_ID`,
  default/custom `parentId`, derived ids never equal to the parent (including a
  `main` request id under a non-main parent, which derives `main-2`, `main-3`, …),
  display-label sanitization (OSC/CSI/DCS/BEL/CR/C1 stripping, trim, ellipsis
  clipping, empty/control-only fallback), approval labels that append `#<id6>` for
  any case variant of `main` while leaving normal names unchanged, resume transitions
  (terminal -> running, cleared terminal fields, `resumed` event, live/unknown
  refusal), cumulative usage and queued counters with clamping and their events,
  unknown-id no-ops, and `clearSubAgentActivity` clearing rows while keeping
  listeners subscribed.
- Other unit suites cover approval queues, checkpoints, checks, delegation, markdown,
  models, plans, providers, streaming, subagents, terminal sessions, and workspace
  path validation. Integration suites cover sessions, skills, browser verification,
  and the packaged runtime.

Current baseline after the security hardening regression slice: **446 passed / 2 skipped**
(45 test files passed, 1 skipped).

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
- **Multi-agent workspace, manual-only:** the real TTY scenarios from
  `docs/architecture.md` §21.9 are not automated — spawning two sub-agents and
  seeing both rows, Ctrl+X + arrow navigation switching content, per-agent
  scroll/drafts, the approval owner banner and frozen navigator, background
  streaming while hidden, `/clear`, and the actual `Ctrl+X Ctrl+K` key chord.
  `workspace-view.test.ts` covers the pure formatting/routing/key decisions those
  handlers call; `tui.tsx` wiring and OpenTUI rendering need a real terminal.
- The literal transcript labels `❯ You → @name` / `⏺ name` are rendered by the
  `tui.tsx` JSX from `UiEntry.agentLabel`; tests assert the `agentLabel`/`kind`
  inputs produced by `transcriptToUiEntries`, not the JSX output.
- Sub-agent follow-up queueing is split: `agent-workspace` owns routing and the
  duplicate window, but each `DelegatedAgentSession` owns its FIFO and the
  end-of-turn drain in `src/main.ts`. Workspace tests use fake handles, so the real
  session queue/drain (including the finally-drain race) is covered only by manual
  runs/manual TTY use, not unit tests.
- **Navigator row width is a hard invariant (`formatAgentRow`):** a row assembled
  exactly as `tui.tsx` renders it (`marker + connector + glyph + " " + label`, then
  `" · " + segment.text` for each metadata segment) never exceeds the requested
  `width` in code points for the shipped tree (main plus direct sub-agents, depths
  0-1) at widths >= 20; the TUI's own floor is 20 cells and the supported 40-column
  terminal requests 38. `workspace-view.test.ts` asserts the matrix of widths
  20/24/30/38/40/48/60/80, depths 0-1, all six statuses, selected/unselected,
  duplicate long names, queue counts 0/1/42, usage present/absent, and CJK/emoji
  names, plus the reported duplicate `frontend-expert` + `queued 1` row at width 38
  for running/waiting/failed. The selected marker, connector, glyph and status
  label always survive, and the full name (including the duplicate `#id6` suffix)
  survives when the width permits (asserted at 80). Honest limitation: synthetic
  nests deeper than the runtime's one-level tree can still overflow at narrow
  widths because the fixed marker/connector/glyph/status prefix is never truncated
  (e.g. depth 13 at width 38 renders 40-42 cells); the tree is generic but the
  runtime does not create such rows.
- Workspace tests create in-memory workspaces with fake handles and fake main
  bindings; they never call a provider, start a terminal, or touch
  `~/.agent-termo`.
- **Security hardening, manual-only:** the real terminal interpretation of the
  injected CSI/OSC payloads (screen clears, window-title changes, OSC 52
  clipboard writes, forged chrome) and the approval panel's actual painting and
  key handling (`Y`/`A`/`N`, frozen navigator, owner banner at 80x24 and 40x12)
  require a real TTY; tests assert the pure formatter/sanitizer output, not the
  `tui.tsx` JSX or OpenTUI rendering. SEC-01's end-to-end path (the proposal
  recorded in the delegated transcript and the path shown in
  `promptAcceptReject`) lives in `src/main.ts`; tests cover the approval-panel
  formatter, not the interactive prompt flow.
- The load-time `sanitizeAgentLabel` helper handles 7-bit CSI/OSC/DCS and strips
  every C0/C1 control character. An 8-bit CSI introducer is removed but its
  printable body (for example `31m`) remains as literal text. This is
  display-only and cannot inject terminal control (the render-boundary
  `sanitizeDisplayText` handles 8-bit sequences for the workspace surfaces it
  sanitizes), so it is recorded as a limitation rather than a failing test.
- Approval-panel line widths are code points, not terminal cells (the module has
  no width library); CJK/emoji lines can occupy more terminal cells than the
  requested budget. Asserted widths therefore match the navigator/transcript
  convention used elsewhere in `workspace-view.ts`.
