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
