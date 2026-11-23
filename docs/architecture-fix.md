# Architecture Fix — Target Design and Migration Rules

## Production baseline

The published executable enters through `bin/agent-termo.js → dist/cli.js → src/cli.ts`.
The active REPL and agent orchestration currently live in `src/main.ts`. The parallel
`src/core/*` prototype is not imported by this path; it is not a production runtime yet.

## Target module boundaries

| Module | Responsibility |
|---|---|
| CLI adapter | arguments, startup, shutdown, exit codes |
| Application runtime | run lifecycle, orchestration, cancellation, retries |
| Session service | transcript persistence, event journal, checkpoints, recovery |
| Context engine | model-aware budgets, compaction, retrieval, project instructions |
| Provider adapters | normalized requests, streaming, usage, capabilities |
| Tool registry | schemas, validation, dispatch, tool metadata |
| Permission service | policy decisions, scoped grants, approval audit |
| Tool services | filesystem, process, Git, MCP |
| Terminal presentation | input, rendering, progress, status; no business logic |

## Required invariants

1. Tool arguments are validated at the execution boundary.
2. Filesystem tools reject lexical traversal and symlink escapes from the canonical workspace.
3. Reviewed file proposals are applied only if the reviewed snapshot still matches disk.
4. Shared terminal approval prompts have one owner, even when delegated agents run concurrently.
5. Tool lifecycle states are explicit and recoverable after interruption.
6. Completion is gated by checks that actually ran and passed.
7. Cancellation reaches provider streams, child processes, MCP requests, and delegated workers.
8. Compaction preserves complete assistant tool-call/tool-result exchanges.
9. Recovery never blindly replays uncertain side effects.
10. The active full-screen renderer exclusively owns terminal output.

## Migration phases

### Phase 1 — safety and concurrency (implemented in this branch)
- Symlink-aware workspace checks for existing file-tool path guards.
- Stale file-proposal rejection.
- FIFO serialization for interactive approvals shared by delegated workers.
- Regression tests for path boundaries and prompt queue behavior.

### Phase 2 — active runtime extraction
- Extract the active tool loop from `src/main.ts` into a runtime service.
- Make run state, cancellation, tool events, and dependencies explicit.
- Keep terminal I/O behind injected interfaces.
- Do not adopt `src/core/*` wholesale; replace or remove it only after behavior parity tests.

### Phase 3 — durable execution
- Persist tool lifecycle events around side effects.
- Add idempotency keys and explicit recovery states for interrupted commands/MCP calls.
- Serialize session writes and make snapshots crash-safe.

### Phase 4 — context and providers
- Add model capability metadata and per-model context/output limits.
- Compact only at safe request boundaries, preserving the newest user turn and tool pairs.
- Use provider tokenizers where available with a conservative fallback.

### Phase 5 — tool and permission platform
- Validate every tool schema before dispatch.
- Use resource-scoped approvals and auditable grants.
- Enforce process timeouts, output limits, cancellation, and process-tree termination.
- Treat MCP servers as untrusted external executables.

### Phase 6 — presentation and release gates
- Give one renderer ownership of terminal output.
- Expose run state, active tool, elapsed time, token usage, and cancellation.
- Gate releases on typecheck, lint, unit/integration tests, package tests, and cross-platform terminal smoke tests.

## Definition of done

A phase is complete only when the production CLI uses the implementation and regression tests cover
its invariants. Unused parallel modules are not a completed migration.


## Additional reliability work on this branch

- The active shell executor now starts common development-server commands as retained background terminal sessions. Their output is captured with bounded buffering, can be read incrementally by cursor, and can be stopped explicitly.
- The main tool loop no longer pauses at 40 turns. It has a larger 120-turn / 20-minute safety budget; delegated agents have a 48-turn / 10-minute budget. These are guardrails, not claims that every large task will complete within one run.
- The system prompt now requires end-to-end full-stack tracing and real frontend/backend runtime-log inspection. This improves execution discipline but cannot replace missing browser automation or project-specific integration tests.


### Phase 7 — browser verification (implemented in this branch)

- Added a first-party `browser:verify` tool backed by the project's installed Playwright package and Chromium.
- Supports a bounded sequence of user actions and assertions (navigation, fill, click, select, checkbox, keyboard, visible-element and text/URL assertions).
- Captures browser console errors, uncaught page errors, failed network requests, and HTTP 4xx/5xx responses; returns a failing tool result with diagnostics so the agent can repair and rerun.
- Saves full-page screenshots to `.agent-termo/browser-artifacts` and always closes the browser after a run.
- The tool does not silently install dependencies: if Playwright or Chromium is missing, the agent receives exact setup guidance. Browser automation is not claimed until the tool actually runs.
- Each run is limited to 30 actions and 120 seconds; project-specific credentials are never fabricated.
