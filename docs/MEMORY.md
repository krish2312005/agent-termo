# Project Memory System

This document tracks the project's memory and context for all agents to ensure consistency and shared understanding across the entire multi-agent system.

## Project Context

- **Project Name:** Agent-Termo
- **Goal:** Build a terminal-based AI coding agent tool that replicates the Claude Code experience
- **LLM Backend:** Nvidia NIM APIs (OpenAI-compatible), plus other OpenAI-compatible providers
- **Purpose:** Enable AI-powered autonomous software development via terminal

## Current Phase

- **Phase:** Carbon Forge UI (theme, one-line footer, registry-driven `/help`, terminal title) implemented and tested on `feat/carbon-forge-theme`; the multi-agent workspace remains the runtime baseline.
- **Status:** Live runtime is `src/main.ts` (`runRepl` + `runToolLoop`). The agent loop publishes a typed `AgentEvent` stream consumed for observability (usage + context status); the TUI shows a context meter and a compact bordered header. Prior reliability fixes (context auto-compaction, tool-loop retry gate, loop symptom, degenerate output guard, 262K Nemotron window) remain in place. The provider UI now accepts pasted API keys; connected saved providers are grouped separately and fast-switch with their saved key/model, with an explicit option to enter a new key. This build flow added a Claude Code-style multi-agent workspace: an agent navigator directly below the composer, per-agent conversation/activity workspaces, and direct follow-up messaging to an exact sub-agent id on the existing delegated runtime. Carbon Forge now provides the live palette, the single-line footer, the complete `/help` reference, and the terminal title; see "Multi-agent workspace" and "Carbon Forge theme, one-line footer, complete `/help`, terminal title" below for decisions, verification, and limitations.

## Technology Decisions (current, verified against `package.json`)

### Core Stack

| Category | Technology | Version | Status |
|----------|-----------|---------|--------|
| **Language** | TypeScript | ^5.4.0 | DECIDED |
| **Runtime / package manager** | Bun | >=1.3.14 (`packageManager: bun@1.3.14`) | DECIDED |
| **CLI/TUI** | @opentui/solid (+ solid-js) | 0.9.7 | DECIDED (live UI: `src/ui/tui.tsx`) |
| **Legacy TUI dep** | blessed | ^0.1.10 | still a dependency, not the live renderer |
| **Color Output** | chalk | ^5.3.0 | DECIDED |
| **Markdown Rendering** | marked | ^12.0.0 | DECIDED |
| **LLM Client** | openai | ^7.57.0 | DECIDED |
| **Validation** | zod | ^4.6.7 | DECIDED |
| **Git Operations** | simple-git | ^4.0.2 | DECIDED |
| **CLI Arguments** | commander | ^12.1.0 | DECIDED |
| **File Operations** | fs-extra | ^11.2.0 | DECIDED |
| **MCP** | @modelcontextprotocol/client | ^2.4.0 | DECIDED |

### Build & Distribution

| Category | Technology | Status |
|----------|-----------|--------|
| **Test Runner** | vitest ^5.1.0 | DECIDED |
| **Linting** | eslint ^9 + typescript-eslint ^8 | DECIDED |
| **Typecheck** | `bunx tsc --noEmit` | DECIDED |
| **Bundler** | `Bun.build` via `scripts/build.mjs` (+ `@opentui/solid/bun-plugin`) -> `dist/cli.js` | DECIDED |

### Infrastructure

| Category | Technology | Status |
|----------|-----------|--------|
| **LLM API** | Nvidia NIM (OpenAI-compatible) + other OpenAI-compatible providers | DECIDED |
| **CI/CD** | GitHub Actions (CI pins Bun 1.3.14; publish on `v*` tags with `NPM_TOKEN`) | DECIDED |
| **Distribution** | npm | DECIDED |

## Configuration Files

- `package.json` — dependencies and scripts (bun-based)
- `tsconfig.json` — TypeScript configuration
- `.env.example` — environment variables template (`.env` is git-excluded; never commit it)

## Architecture Decisions

### Entry Points

- `bin/agent-termo.js` -> `dist/cli.js`
- `src/cli.ts` — commander CLI; parses args, `init`, MCP subcommands; imports `runRepl` from `./main.js`
- `src/main.ts` — the **live** runtime: `runRepl` REPL + `runToolLoop` agent loop

`src/main-new.ts` + `src/core/*` were an abandoned duplicate runtime; they were deleted in commit `9f19fd7` (see `docs/TIMELINE.md`). Do not reference or re-create them.

### Core Components

1. **CLI Layer:** `src/cli.ts` (commander) -> `src/main.ts`.
2. **Terminal UI Layer:** `src/ui/` — @opentui/solid-based TUI (`tui.tsx`, `screen.ts`, `selection-copy.ts`, `workspace-view.ts`, `display-text.ts`); Carbon Forge tokens live in `theme.ts`, and `terminal-title.ts` owns the terminal-title lifecycle.
3. **LLM Integration:** `src/llm/` — `NimClient`, provider/model limits, streaming + tool-call normalization.
4. **Agent System:** prompts loaded from `.claude/agents/*.md` at runtime; 12 specialist agents.
5. **Tool System:** `src/tools/` (execute/tool defs) with runtime safety in `src/runtime/` (permissions, context, sessions, checkpoints, verify, terminal-sessions, subagents, agent-tree, agent-transcript, agent-selection, agent-workspace, mcp, skills, plans).
6. **Memory / timeline:** `docs/MEMORY.md`, `docs/TIMELINE.md`, `docs/changes/*.md` (written by `.claude/scripts/log.sh`).

## Security Considerations

- Bash execution is sandboxed behind permission review with allowed-command filtering, timeouts, and path validation against `process.cwd()`.
- API keys come from environment variables (e.g. `NIM_API_KEY`); never log or commit secrets.
- Destructive operations are warned/confirmed; terminal process trees are killed on cancellation (`src/runtime/terminal-sessions.ts`).
- `docs/SECURITY.md` is the security audit record (baseline + re-audit). Current gate: no open critical/high under the trusted-project-directory model; SEC-16 must be re-rated High if cloned repositories are untrusted.

## Reliability fixes applied this build flow (2026-11-23)

1. **Context auto-compaction** (`src/runtime/context.ts`): trigger changed from 85% of the input budget to the reserved input budget itself; a deterministic `collectProtectedMessages` keeps the system prompt, original objective, current goal, most recent tool result, and `Status: failure` diagnostics verbatim; `shortenToolMessages` skips protected messages. Caller `completeWithContextRecovery` (`src/main.ts`) keeps the aggressive recovery path for real context-window errors.
2. **Tool-loop retry gate** (`src/main.ts`): `MAX_CONSECUTIVE_FAILURES_PER_SIGNATURE = 2`; `shouldPauseForRepeatedFailedToolCall` now takes a `Map<string, number>` and blocks only at count >= 2 (one genuine retry allowed). Run-scoped failures are a `Map`; `taskState.failedToolCalls` remains a `Set` for persisted diagnostics. `shouldClearFailedToolCalls` clears on a successful non-read-only corrective action.
3. **Loop** was a symptom of (1) and (2); bounds are the 20-minute wall-clock budget (`src/runtime/run-budget.ts`) + the retry budget + loop termination when the model stops issuing tool calls.

Verification: `bun run typecheck` clean; `bun run test` = **215 passed / 2 skipped** (31 files passed, 1 skipped); `bun run build` = `dist/cli.js`.

## Runtime event stream + context meter (2026-11-23 slice)

- **Contract** (`src/runtime/events.ts`): flat discriminated union `AgentEvent` — `turn.started`, `tool.started`, `tool.completed`, `usage.updated`, `context.updated`, `turn.completed`; every event carries `sessionId`, `turnId`, and `at: number` (`Date.now()`). No persistence or replay.
- **Hub:** `AgentEventHub.subscribe(listener)` returns an idempotent unsubscribe; `publish(event)` dispatches synchronously over a snapshot of listeners and wraps each listener call in `try/catch`, so a UI bug can never break the agent loop. No dependencies.
- **Wiring** (additive, `src/main.ts`): `runToolLoop` takes trailing `sessionId = ''`, `events: AgentEventHub = new AgentEventHub()`; `observeAgentEvents` maps only `usage.updated` -> `setScreenStatus({ usage })` and `context.updated` -> `setScreenStatus({ context: { usedTokens, budgetTokens } })`. Existing `print*`, spinner, and direct `setScreenStatus` calls are unchanged.
- **Publication:** `turn.started` at loop entry; `tool.started`/`tool.completed` immediately around each executed call in both the parallel-delegation and sequential branches (blocked and budget-skipped calls publish nothing); `usage.updated`/`context.updated` after each successful primary and fallback model response (the fallback estimate omits tool schemas because that request carries none); `turn.completed` at every loop-exit return with `completed | failed | cancelled | paused`. Both `runRepl` call sites pass the real `session.id`.
- **Context meter:** `formatContextMeter(usedTokens, budgetTokens)` in `src/ui/tui.tsx` (7 cells, `▰`/`▱`, ratio clamped 0–1, percent rounded, non-finite or `budgetTokens <= 0` treated as 100%), re-exported by `src/ui/index.ts`. Screen state gained `context?: { usedTokens; budgetTokens }` (`ScreenContext`/`ScreenState`). The bottom status line prefixes `context <meter>` when present; `/context` prints the same meter.
- **UI polish:** top header row wrapped in one rounded `#6D625A` bordered box; `printWelcome` is a compact four-line block with no box-drawing characters and no separator lines.
- **Tests:** `tests/unit/events.test.ts` (delivery with exact payload, unsubscribe stops delivery and is idempotent, throwing listener does not block later listeners) and `tests/unit/context-meter.test.ts` (0%, 50%, >100% clamp, 43% example, fixed 7-cell-plus-percent shape).
- **Contract doc:** `docs/architecture/target-architecture.md` (runtime event contract, hub boundary, publication/status mapping, context meter).
- **Verification (this slice):** `bun run typecheck` exit 0; `bun run test` = **228 passed / 2 skipped** (33 files passed, 1 skipped); `bun run build` clean (`dist/cli.js`, 228,702 bytes); `bun dist/cli.js --version` -> `2.0.6`.
- **Unverified locally:** interactive TUI/REPL rendering and input handling, live provider calls (need an API key), and non-Windows behavior.

## Degenerate model output guard + 262K context (2026-11-23 fix)

- **Symptom:** the model emitted raw chat-template control tokens as plain text (`<|open|>argument ...<|close|>message<|sep|>` followed by many repeated `<|close|>message<|sep|>` lines). `parseToolCallsFromText` only parses `<tool_call>` markup and JSON, so no tool calls ran and the runaway repetition never usefully ended — the "stuck tool loop".
- **Guard:** exported pure `isDegenerateModelOutput(text)` in `src/llm/client.ts` — true only when `text` matches `/<\|(?:open|close|sep)\|>/` AND either a non-empty line repeats consecutively >= 6 times, or `<|close|>message<|sep|>` occurs >= 6 times. False for normal prose and for legitimate `<tool_call>...</tool_call>` markup.
- **Enforcement:** `streamComplete` checks the guard after each content chunk, aborts the active controller, and throws exported `MalformedModelOutputError` (`retryable = false`) before yielding; `complete()` checks after assembling `content`. The `<|open|>...` payloads are never parsed or executed — they carry no tool name and are classified as malformed.
- **Surfacing:** `isTransientError` (and `isPartialStreamFailure`) short-circuit on `retryable === false`, so `src/main.ts` does not retry; the task is paused as interrupted/resumable with an actionable message ("switch models (e.g. /model) or use a tool-capable model"). No error-handling restructuring.
- **Context window:** `NVIDIA_NIM_MODEL_LIMITS['nvidia/nemotron-3.5-super-vl-120b-a12b']` = `contextWindowTokens: 262_144`, `source: 'user-reported: 262K context window'`. `resolveContextBudget` now reserves from 262K instead of the 32,768 fallback; `maxOutputTokens` intentionally not invented.
- **Tests:** `tests/unit/models.test.ts` (limit + `resolveContextBudget` contextWindowTokens, `inputBudgetTokens > 200_000`) and `tests/unit/malformed-output.test.ts` (5 vs 6 repeated-line threshold, real `streamComplete`/`complete()` rejection via a fake transport with no yielded content, legitimate markup false).
- **Verification:** `bun run typecheck` exit 0; `bun run test` = **242 passed / 2 skipped** (34 files passed, 1 skipped); `bun run build` clean (`dist/cli.js`).
- **Unverified locally:** live provider behavior with the actual Nemotron model (needs the model/endpoint); the guard only rejects the observed repetition pattern.

## Pasted API keys in the provider prompt (2026-11-23 fix)

- **Symptom:** in `/providers`, the masked API-key prompt ignored pasted text; users had to type the key character by character. Normal prompt input and the picker were unaffected.
- **Root cause:** `src/main.ts:1313` calls `input.questionSecret`; secret mode unmounts the normal `<textarea>` (`src/ui/tui.tsx`, `Show when={secretMode()}`). OpenTUI delivers bracketed paste as a separate `PasteEvent` (`@opentui/core` `InternalKeyHandler` / `usePaste`), while `useKeyboard` subscribes only to `keypress`/`keyrelease`. With the textarea unmounted, no paste receiver existed; the secret branch's `name === "paste"` case was unreachable. Normal prompts accepted paste because the focused textarea handles it natively.
- **Fix (commit `7cf2ca8`, branch `fix/ui-paste-api-keys`):** `App` adds a `usePaste` handler that, only while `secretMode()` is true, appends decoded bytes to `secretDraft` through exported pure `applySecretPaste(current, pasted: string | Uint8Array)` (`decodePasteBytes`) and calls `event.preventDefault()`; otherwise it is a no-op, so textarea/picker paste is unchanged. `src/ui/index.ts` re-exports the helper.
- **Tests (commit `a4cd4e3`):** `tests/unit/secret-paste.test.ts` — 4 cases: append to an existing draft, UTF-8 `Uint8Array` decode (incl. multibyte), empty paste no-op, 72-character fake key preserved intact. Fake `sk-test-*` values only.
- **Verification:** `bun run typecheck` exit 0; `bun run test` = **252 passed / 2 skipped** (36 files passed, 1 skipped); `bun run build` clean (`dist/cli.js`).
- **Unverified:** interactive TUI paste (`usePaste`/`useKeyboard` wiring, `preventDefault`, real terminal bracketed paste); the non-renderer raw-stdin `questionSecret` branch and picker were intentionally unchanged.
- **Branch state:** both commits are local on `fix/ui-paste-api-keys`, unpushed and not merged to `master`.

## Connected providers: grouping + saved-key fast switch (2026-11-23 fix)

- **Symptom:** a provider configured once still went through the masked API-key prompt, a live model fetch, and the model picker on every re-selection, and `/providers list` / the picker did not distinguish configured from unconfigured providers. The key was already persisted in `~/.agent-termo/config.json`, but there was no visible or behavioral "connected" state.
- **Definition:** connected = a saved provider config from `listSavedProviders()` whose `apiKey.trim()` is non-empty. No live network validation is performed for listing or classification.
- **Pure helpers** (`src/llm/providers.ts`): `isProviderConnected(provider)`; `providerActivationModel(provider, definition?)` (saved model -> definition suggestion -> stored suggestion -> `''`); `groupProviders(saved, current?)` -> `{ connected, notConnected }` of `{ id, name, description, model, connected, active, saved }`. Saved configs override built-ins, ids are deduped, and an unsaved current provider is appended to `notConnected` with `active: true`.
- **Picker** (`src/ui/tui.tsx`): optional `group` on `PickItem`; `filteredPicker` inserts non-selectable `— Connected —` / `— Not connected —` headers only for grouped lists; exported `nextPickerIndex` skips headers in both directions. Ungrouped callers (`/model`, etc.) are unchanged. Accepted edge changes: Enter with a zero-match filter now no-ops (Esc still cancels), and Backspace while filtering resets selection to the first selectable row.
- **`/providers list`** prints `Connected:` and `Not connected:` sections, keeps the `● active` marker, shows saved configs with empty/whitespace keys and env-only current providers under Not connected, and lists built-ins without a saved key as Not connected.
- **Selection flow** (`src/main.ts` `handleProvidersCommand`): a connected provider offers "Use saved API key" (default) vs "Enter a new API key". Use-saved activates via `activateProvider`/`saveProviderConfig` with the saved key and model, with no key prompt and no model fetch; an empty saved model falls back through `providerActivationModel` (persisted when used) and only falls through to model selection when no model is known. Enter-new-key uses the masked `questionSecret` (paste path intact), saves the replacement through `saveProviderConfig` (activating), and never prints or logs the key; empty input saves nothing. Unconnected providers keep the full setup flow; `/providers use <id>` is unchanged.
- **Tests** (`tests/unit/providers.test.ts`, `tests/unit/provider-config.test.ts`, `tests/unit/picker-groups.test.ts`): 23 new cases — connected classification/grouping/dedupe/active marker, activation-model fallback, saved-key activation without new input (temp `AGENT_TERMO_DIR`, 0600/0700 checked on POSIX), key rotation persistence + activation, empty-key classification, picker header insertion/filtering/skipping/backward compatibility, and `allowCustom`. Fake `sk-test-*` keys only; no real `~/.agent-termo` access.
- **Verification:** `bun run typecheck` exit 0; `bun run test` = **275 passed / 2 skipped** (38 files passed, 1 skipped); `bun run build` clean (`dist/cli.js`, 233,219 bytes).
- **Unverified:** interactive TUI rendering/keyboard behavior of the group headers; the "Use saved API key" vs "Enter a new API key" choice and unconnected-provider key enforcement (inside unexported `handleProvidersCommand`) are not automated; real terminal key replacement, live endpoints, and bracketed paste in the new-key path need manual checks.
- **Branch state:** commits `6819770` (pre-existing runtime session log entries), `f51f46a` (fix), `c5e5e1a` (tests), plus the following docs commit, are local on `fix/ui-paste-api-keys`; unpushed, not merged, `master` still at `680ed66`.

## Multi-agent workspace (2026-11-23 build flow)

- **Goal:** a Claude Code-style multi-agent UI where selecting an agent (main or any sub-agent) enters that agent's own workspace: its actual conversation/activity fills the main content area, and the composer routes the next message to that exact stable agent id. The navigator is a compact hierarchy directly below the composer, not a sidebar/modal/read-only monitor.
- **Contract:** `docs/architecture.md` §21 (current state, decisions D1-D5, TypeScript contracts, data flows, lifecycle, UI/keyboard spec, file plan, test seams, limitations). Visual spec: `docs/DESIGN_SYSTEM.md` §10 (live palette only; no new theme).
- **Identity/hierarchy:** `MAIN_AGENT_ID = "main"`; sub-agent ids are registry ids for life, never names; `SubAgentActivity.parentId` (main today); tree builder is generic but nesting is **not enabled** (sub-agents cannot delegate). The illustrative `main > project-manager > frontend-expert` is not truthful in this runtime: project-manager is main's active-prompt label; frontend-expert is a direct child of main. No fake nodes. Status vocabulary: idle/running/waiting/completed/failed/stopped; no invented "Thinking".
- **Transcripts:** main keeps the existing `entries` log. Sub-agents write to `src/runtime/agent-transcript.ts`, a bounded in-memory store per agent id (500 entries, 256 KiB, 8,000 chars/entry, one truncation marker); snapshot reads + subscriptions mean late mounts/switches never lose history. `AgentEventHub` was deliberately not extended (run-local, no replay).
- **Follow-up dispatch:** `src/runtime/agent-workspace.ts` `sendAgentMessage(agentId, text)` is synchronous and id-only. Idle main resolves a pending REPL question via `input.submitExternal` or queues at the REPL top. Running/waiting agents queue (max 10) and drain at the turn boundary; completed/failed/stopped resume the same `DelegatedAgentSession` (same `NimClient`, messages, agent definition, permissions, root) with no new agent/conversation. Unknown ids never fall back to a parent; duplicate (same text queued or within 2 s), empty, queue-full, and unavailable are explicit rejections. Follow-up results stay in the sub-agent session and do not re-enter the parent model context; the parent `TaskState` is not mutated.
- **Main runtime integration** (`src/main.ts`): persistent `DelegatedAgentSession`, per-turn namespaced tool-call ids, detached `TaskState`, per-agent lazy checkpoint, finally-drain queue, transcript recording, quiet sub-agent prints (review/approvals still run), main state/usage updates, `/clear` workspace reset, and cancellation scoped to the selected agent for follow-ups. Stop-all (`stopAllAgents`) cancels main + live sub-agents, clears queues, and blocks a just-approved apply via `shouldAbort`; it does not kill an already-running tool call.
- **UI** (`src/ui/tui.tsx`, `src/ui/workspace-view.ts`, `src/ui/display-text.ts`): navigator directly below the composer (≤7 agent rows + overflow + hint), selected-content status row, main vs sub-agent content switching, per-agent drafts/scroll with tail-follow only at the bottom, composer prefix/placeholder `@name`, routed submit, approval panel with real command/path/±stats/diff lines visible in any workspace, and a shared terminal-control sanitizer on new and existing surfaces.
- **Keyboard:** default composer focus; `Ctrl+X` enters navigator focus (and arms the stop-all chord); navigator `↑/↓` switch selection immediately, `Enter` focuses the composer, `Esc` selects the parent (composer at main); `Ctrl+X` then `Ctrl+K` within 1.5 s stops all agents. Plain `Ctrl+K` keeps terminal-stop behavior under the documented conditions; `Ctrl+C`, pickers, secret entry, completion, history, Tab/Shift+Enter, `Ctrl+O`/`Ctrl+T`, and `/subagents` are preserved. Navigator keys are consumed before cancellation listeners. Modals own the keyboard and freeze navigation.
- **Security:** `docs/SECURITY.md` baseline + re-audit. SEC-01 (content-free sub-agent file approvals) and SEC-02 (background shell/browser tools bypassing ask-mode approval) are closed. SEC-03/04 partially fixed, SEC-05 bounded, SEC-06 open medium (unbounded sessions/checkpoints), SEC-08 partial, SEC-10 low open, SEC-15/16 medium pre-existing (raw render paths; project-script execution), SEC-17/18 low. No open critical/high under the trusted-project-directory model. `bun audit`: 2 moderate pre-existing advisories, 0 high/critical.
- **Verification (exact, final HEAD):** `bun run typecheck` exit 0; `bun run test` = **45 files passed / 1 skipped (46)**, **446 passed / 2 skipped (448)**; `bun run build` exit 0 (`dist/cli.js`, 271,741 bytes); `bun dist/cli.js --version` -> **2.0.7**; `bun dist/cli.js --help` exit 0; `bun bin/agent-termo.js --version` -> 2.0.7; `bun run test:package` -> "Packed npm CLI passed: agent-termo@2.0.7"; `bun install --frozen-lockfile` no changes. Local Bun 1.4.5 (CI pins 1.3.14; both >= minimum).
- **Feature commits:** `694f983` docs/architecture §21, `21cf5b8` design §10, `5191664` runtime, `ec9ecb7` live TUI, `129c453` unit coverage, `d8e4893` narrow-row invariant, `cc1f347` security audit, `6cb962c` approval/identity hardening, `e19b209` UI sanitization/approval panel, `6278313` security regression tests, `aeea675` re-audit/gate, plus the deployment/docs commits on `feat/subagent-workspace`.
- **Limitations (honest):** one delegation level; registry/transcripts are in-memory and lost on restart; follow-up messages wait for the turn boundary (up to the 10-minute budget) with no mid-turn injection; follow-up results do not flow back to the parent automatically; stop-all does not kill an in-flight tool call; the terminal panel is shared across agents; provider/model changes apply to newly spawned sessions only; **the live TUI is dark-only — there is no theme/light mode to verify**; no live TTY was available in this flow, so rendering, focus, scroll, approval-panel painting/keys, real escape handling, and live provider streaming remain manual-only; residual display spoofing via Unicode/zero-width homoglyphs and sibling duplicate labels; synthetic tree depths far beyond the runtime's one level can exceed narrow row widths; at extreme narrow widths the hard width invariant drops `N queued` even though the design lists it as always kept; scroll-position maps are not pruned on agent removal (drafts are).
- **Branch state:** implemented on `feat/subagent-workspace`; the user/coordinator directed the final push to GitHub and merge into `master` after this memory entry (see `docs/TIMELINE.md` and the final response for remote hashes).

## Carbon Forge theme, one-line footer, complete `/help`, terminal title (2026-11-23 feature)

- **Goal:** apply a single Carbon Forge palette across Agent-Termo (background `#101512`, surface `#19211D`, borders `#27332C`, text `#E5EDE6`, lime accent `#B5D98A`, copper `#D69B69`, teal `#83B9A2`, error `#E17D75`); lime for active selections, copper for branding/tool execution, teal for informational states/sub-agents, red for errors; remove the bright-red input border and use subtle borders with lime focus. Replace the bottom status surfaces with exactly one footer line containing shortcuts plus live context/thinking/permission/session stats. Make `/help` a complete, registry-driven reference. Set the terminal title to "Agent-Termo" on startup and restore it on exit (VS Code integrated terminal).
- **Design:** `docs/DESIGN_SYSTEM.md` §11 is the authoritative Carbon Forge spec (pre-theme live palette in §10.1 marked superseded; historical §1–§9 untouched). `src/ui/theme.ts` is the only color source: eight exact foundation colors plus four documented sRGB derivations (`textMuted #A5ACA6`, `textDim #858C87`, `diffAddSurface #293224`, `diffRemoveSurface #2F2521`). Flat `COLORS`/`ROLES`; no ThemeProvider, light mode, or runtime switching. Contrast on `#101512`: text 15.5:1, accent 11.7:1, copper 7.7:1, teal 8.3:1, error 6.5:1; border 1.4:1 is intentionally decorative, so focus is never border-only.
- **Theme application:** every live TUI surface consumes roles (header, separator, entries, markdown SyntaxStyle, diffs, terminal panel, picker/completion, approval/banner, composer, navigator, notices); non-TUI Chalk fallbacks use the same hexes. Composer border is `#27332C` unfocused and lime `#B5D98A` focused; permission mode is footer text only. `#FF5555` and `permissionBarColor()` are gone. `src/utils/ansi.ts` remains pre-existing unused legacy code (not touched).
- **Single-line footer** (`formatFooter` in `src/ui/tui.tsx`, pure): replaces the navigator hint row and the old bottom status line with exactly one row below the navigator. Canonical composer line (verified exact): `Ctrl+X navigate · ↑/↓ select · Enter send · Esc parent · Ctrl+X Ctrl+K stop all · context ▰▰▰▰▱▱▱ 51% · 12k/23k · low · auto · session ~130,851`. Context meter/percent and the token pair come from `ScreenState.context` via `formatContextMeter`/`formatTokenCount`; thinking/permission are shown verbatim; `session` strips one trailing ` tokens` from `ScreenState.usage` while retaining `~`. Absent context/thinking/usage are omitted; permission is always present. Documented width drop order: session → thinking → ↑/↓ select → context meter → Esc parent → Enter send → Ctrl+X navigate → stop all → used/budget; permission never drops, the final clip uses `…`, and nothing wraps or adds a row. Navigator-focused and modal variants swap only the shortcut cluster; transient status replaces the shortcut cluster, keeps the context meter, and clips after `12k/23k` drops. Keyboard handlers were not changed (verified: the `useKeyboard`/`usePaste` blocks are untouched; 6 keyboard/workspace suites, 131 tests pass).
- **`/help`:** one markdown transcript entry via the existing scrollbox (scrollable; no pager/modal). Generated from the live completion registry (`getCommands()`: `COMMANDS` + `/mcp` once + project commands marked `project`), with separate Commands and Shortcuts sections. All 33 built-in commands and the five real aliases are listed once: `/help` (`/`), `/clear` (`/cls`), `/timeline` (`/tl`), `/history` (`/hist`), `/exit` (`/quit`); plain `exit`/`quit` is noted. Shortcuts are audited from the real handlers and grouped Composer/Workspace/Response/Approval/Picker/Secret input; stale descriptions for `/help`, `/agents`, `/history`, `/context` were corrected. The non-TUI fallback renders the same document with Carbon Forge Chalk hexes.
- **Terminal title** (`src/ui/terminal-title.ts`): writes OSC 2 `\x1b]2;Agent-Termo\x07`, pushes/restores the xterm title stack (`\x1b[22;2t` / `\x1b[23;2t`), and sets/restores `process.title`; TTY-gated, idempotent, injectable IO, process-exit fallback. Installed at `startAgent` (covers the API-key prompt) and `runRepl`; restored in `cleanup()` after renderer teardown and before exit. VS Code's xterm.js honors OSC titles when its tab-title setting permits sequences; `process.title` covers the default process-name tab.
- **Verification (final, branch tip `9fc9e72`):** `bun run typecheck` exit 0; `bun run test` = **49 files passed / 1 skipped (50)**, **514 passed / 2 skipped (516)** (+68 tests in 4 new files: theme, footer, help, terminal-title); `bun run build` exit 0 (`dist/cli.js`); `bun dist/cli.js --version` -> **2.0.7**; `bunx eslint src/ui/terminal-title.ts` exit 0 after the intentional control-regex suppression. Grep gates: no legacy live hexes or Chalk named colors under `src/ui` outside `theme.ts`; no `#FF5555`; no `permissionBarColor` references. No changes to agent execution, tool calling, model communication, sessions/checkpoints/plans/skills; no new dependencies.
- **Flow/skips:** feature flow; architect skipped (no API/data-model/page change), backend-expert skipped (no backend surface), security-expert skipped (no auth/data/user-input/model surface added; the title is a fixed constant and help reuses the existing sanitized render boundary), deployment-expert skipped (deployment not requested). `git-manager` created the branch before code work and gated every stage.
- **Commits:** `4825b3f` prior security-report docs (pre-existing artifacts committed separately), `f9516cf` design/theme tokens, `53de170` theme/footer/help/title implementation, `18ce6f0` tests, `9fc9e72` lint suppression.
- **Limitations (honest):** no live TTY was available, so interactive 40/80/120-column rendering, footer resizing/clipping, VS Code title display/restore, picker/approval/secret painting, and live keyboard behavior remain manual checks. Title restore depends on xterm.js title-stack support; a VS Code setting that ignores sequence titles can override OSC 2 (the process-name title still covers the default). Footer segments render uniformly in `mutedText` with dim separators rather than §11.5's per-segment permission/meter styling; text/order/behavior match. Repo-wide `bun run lint` remains red from pre-existing errors in untouched code; CI's lint step (four files) is unaffected.
- **Branch state:** implemented on `feat/carbon-forge-theme`; per the user's direction, `git-manager` merges it into `master` after this memory entry (see `docs/TIMELINE.md` and the final orchestration response for the merge hash). Not pushed.

## NIM API Validation Results (historical, 2026-07-04)

- URL: `https://integrate.api.nvidia.com/v1/chat/completions`
- Model names use DOT notation: `meta/llama-3.1-8b-instruct` (HTTP 200); underscore form returns 404.
- Known per-model context limits live in `src/llm/models.ts` and feed `resolveContextBudget`.

## Access Rules

1. Read MEMORY.md at start of every session.
2. Update MEMORY.md after significant work.
3. Never delete historical context.
4. Use as single source of truth for decisions.

## Related Documentation

- `CLAUDE.md` — agent workflow / rules
- `.claude/workflow.md` — agents and flows
- `docs/architecture.md` — architecture contract (multi-agent workspace in §21)
- `docs/architecture/architecture-comparison.md` — OpenCode / Codex / Agent-Termo comparison (source-backed)
- `docs/architecture/current-architecture-audit.md` — actual current architecture + root-cause findings
- `docs/architecture/target-architecture.md` — target design with implemented/partial/not-yet markers
- `docs/architecture/implementation-plan.md` — phases, completed work, outstanding work, risks
- `plan.md` — remediation plan and defect record
- `docs/TECH_STACK.md`, `docs/PROVIDERS.md`, `docs/CONTEXT_AND_MEMORY.md`, `docs/MCP.md`, `docs/TESTING.md`
- `docs/SECURITY.md` — security audit and re-audit gate
- `docs/DEPLOY.md` — local setup/verification and manual TTY checklist
- `docs/DESIGN_SYSTEM.md` — visual design system (Carbon Forge in §11; multi-agent workspace in §10)
- `docs/TIMELINE.md` — activity log (auto-appended by `.claude/scripts/log.sh`)
