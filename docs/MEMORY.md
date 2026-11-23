# Project Memory System

This document tracks the project's memory and context for all agents to ensure consistency and shared understanding across the entire multi-agent system.

## Project Context

- **Project Name:** Agent-Termo
- **Goal:** Build a terminal-based AI coding agent tool that replicates the Claude Code experience
- **LLM Backend:** Nvidia NIM APIs (OpenAI-compatible), plus other OpenAI-compatible providers
- **Purpose:** Enable AI-powered autonomous software development via terminal

## Current Phase

- **Phase:** Implemented; typed runtime event stream (first vertical slice) landed on `local-branch`
- **Status:** Live runtime is `src/main.ts` (`runRepl` + `runToolLoop`). The agent loop now publishes a typed `AgentEvent` stream consumed only for observability (usage + context status); the TUI shows a context meter and a compact bordered header. Prior reliability fixes (context auto-compaction, tool-loop retry gate, loop symptom) remain in place. A degenerate raw-control-token guard now rejects malformed model output, and the user's Nemotron model is registered at a 262K context window.

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
| **CI/CD** | GitHub Actions | DECIDED |
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
2. **Terminal UI Layer:** `src/ui/` — @opentui/solid-based TUI (`tui.tsx`, `screen.ts`, `selection-copy.ts`).
3. **LLM Integration:** `src/llm/` — `NimClient`, provider/model limits, streaming + tool-call normalization.
4. **Agent System:** prompts loaded from `.claude/agents/*.md` at runtime; 12 specialist agents.
5. **Tool System:** `src/tools/` (execute/tool defs) with runtime safety in `src/runtime/` (permissions, context, sessions, checkpoints, verify, terminal-sessions, subagents, mcp, skills, plans).
6. **Memory / timeline:** `docs/MEMORY.md`, `docs/TIMELINE.md`, `docs/changes/*.md` (written by `.claude/scripts/log.sh`).

## Security Considerations

- Bash execution is sandboxed behind permission review with allowed-command filtering, timeouts, and path validation against `process.cwd()`.
- API keys come from environment variables (e.g. `NIM_API_KEY`); never log or commit secrets.
- Destructive operations are warned/confirmed; terminal process trees are killed on cancellation (`src/runtime/terminal-sessions.ts`).

## Reliability fixes applied this build flow (2026-11-23)

1. **Context auto-compaction** (`src/runtime/context.ts`): trigger changed from 85% of the input budget to the reserved input budget itself; a deterministic `collectProtectedMessages` keeps the system prompt, original objective, current goal, most recent tool result, and `Status: failure` diagnostics verbatim; `shortenToolMessages` skips protected messages. Caller `completeWithContextRecovery` (`src/main.ts`) keeps the aggressive recovery path for real context-window errors.
2. **Tool-loop retry gate** (`src/main.ts`): `MAX_CONSECUTIVE_FAILURES_PER_SIGNATURE = 2`; `shouldPauseForRepeatedFailedToolCall` now takes a `Map<string, number>` and blocks only at count >= 2 (one genuine retry allowed). Run-scoped failures are a `Map`; `taskState.failedToolCalls` remains a `Set` for persisted diagnostics. `shouldClearFailedToolCalls` clears on a successful non-read-only corrective action.
3. **Loop** was a symptom of (1) and (2); bounds are the 20-minute wall-clock budget (`src/runtime/run-budget.ts`) + the retry budget + loop termination when the model stops issuing tool calls.

Verification: `bun run typecheck` clean; `bun run test` = **215 passed / 2 skipped** (31 files passed, 1 skipped); `bun run build` = `dist/cli.js`.

## Runtime event stream + context meter (2026-11-23 slice)

- **Contract** (`src/runtime/events.ts`): flat discriminated union `AgentEvent` — `turn.started`, `tool.started`, `tool.completed`, `usage.updated`, `context.updated`, `turn.completed`; every event carries `sessionId`, `turnId`, and `at: number` (`Date.now()`). No persistence or replay.
- **Hub:** `AgentEventHub.subscribe(listener)` returns an idempotent unsubscribe; `publish(event)` dispatches synchronously over a snapshot of listeners and wraps each listener call in `try/catch`, so a UI bug can never break the agent loop. No dependencies.
- **Wiring** (additive, `src/main.ts`): `runToolLoop` takes trailing `sessionId = '', events: AgentEventHub = new AgentEventHub()`; `observeAgentEvents` maps only `usage.updated` -> `setScreenStatus({ usage })` and `context.updated` -> `setScreenStatus({ context: { usedTokens, budgetTokens } })`. Existing `print*`, spinner, and direct `setScreenStatus` calls are unchanged.
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
- `docs/architecture/architecture-comparison.md` — OpenCode / Codex / Agent-Termo comparison (source-backed)
- `docs/architecture/current-architecture-audit.md` — actual current architecture + root-cause findings
- `docs/architecture/target-architecture.md` — target design with implemented/partial/not-yet markers
- `docs/architecture/implementation-plan.md` — phases, completed work, outstanding work, risks
- `plan.md` — remediation plan and defect record
- `docs/TECH_STACK.md`, `docs/PROVIDERS.md`, `docs/CONTEXT_AND_MEMORY.md`, `docs/MCP.md`, `docs/TESTING.md`
- `docs/TIMELINE.md` — activity log (auto-appended by `.claude/scripts/log.sh`)
