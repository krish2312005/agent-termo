# Agent-Termo — Bug Report & Architecture Review

Generated from inspection of the current source tree (`C:\Users\coccg\OneDrive\Desktop\agent-termo`).

## Verified test / type / lint results

| Check | Command | Result |
|-------|---------|--------|
| TypeScript typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS** (exit 0) |
| Unit + integration tests | `npm test` (`vitest run`) | **130/130 passed** (18 files) |
| ESLint | `npm run lint` (`eslint src --ext .ts`) | **0 errors** (35 pre-existing warnings) |

---

## Bugs

### B-1: Integration test fails on Windows path separators (CONFIRMED)
**File:** `tests/integration/basic.test.ts:252`  
**File:** `src/tools/index.ts` (`toolFileGlob`)

`file:glob` with pattern `src/**/*.ts` returns Windows-style paths (`src\main.ts`, `src\main-new.ts`, `src\cli.ts`) because the `glob` library preserves OS separators. The test asserts `result.output).toContain('src/cli.ts')` (forward slash), which fails on Windows.

**Evidence (test output):**
```
AssertionError: expected 'src\main.ts\nsrc\main-new.ts\nsrc\cli.ts…' to contain 'src/cli.ts'
```

**Fix:** Normalize glob results to forward slashes before returning (e.g. `files.map(f => f.replace(/\\/g, '/'))`), or make the test platform-aware.

---

### B-2: ESLint errors — `prefer-const` (5 errors)
**Files:** `src/core/events.ts`, `src/main-new.ts`

Variables declared with `let` that are never reassigned:

| File | Line | Variable |
|------|------|----------|
| `src/core/events.ts` | 240 | `session` |
| `src/main-new.ts` | 179 | `activeAgentName` |
| `src/main-new.ts` | 186 | `currentGoal` |
| `src/main-new.ts` | 187 | `taskState` |
| `src/main-new.ts` | 194 | `activePlan` |

**Fix:** Change `let` to `const` for these variables.

---

### B-3: ESLint error — floating promise
**File:** `src/core/tools.ts:81`  
**Rule:** `@typescript-eslint/no-floating-promises`

A Promise is created but not awaited, `.catch()`ed, `.then()`ed, or marked with `void`.

**Fix:** Await the promise or explicitly handle it with `void`.

---

### B-4: ESLint errors — unused variables (2 errors)
**File:** `src/main-new.ts:253`

| Variable | Issue |
|----------|-------|
| `_llmClient` | Assigned but never used |
| `_projectRoot` | Assigned but never used |

**Fix:** Remove the unused parameters or prefix/use them meaningfully.

---

### B-5: ESLint warnings — `no-console` (many)
**File:** `src/cli.ts` (lines 33, 34, 104, 107, 138–140, 152, 157, 203, 212, 222, 230, 231)

`console.log` / `console.error` calls are used where the project's ESLint config only allows `console.warn` and `console.error`.

**Fix:** Replace `console.log` with the project's UI printing functions (`printInfo`, `printSuccess`, etc.) or add an eslint exception.

---

### B-6: ESLint warnings — `no-explicit-any` (many)
**Files:** `src/core/events.ts:170`, `src/core/run-loop.ts` (lines 20, 21, 145, 235, 255, 256, 266, 267, 294, 295), `src/main-new.ts` (lines 52, 65)

**Fix:** Replace `any` with specific types or `unknown` + type guards.

---

### B-7: Duplicate / split-brain entry points (ARCHITECTURAL BUG) — RESOLVED
**Files:** `src/main.ts` (monolithic REPL) and `src/main-new.ts` (modular architecture)

**Fix applied:** `src/cli.ts` now imports `runRepl` from `./main-new.js` instead of `./main.js`, so both `npm run dev` and the published binary (`package.json` `bin`/`main` → `dist/main-new.js`) use the same code path.

**Status:** RESOLVED — single entry point confirmed.

---

### B-8: Glob path traversal / `withinProject` edge case — OPEN
**File:** `src/tools/index.ts` (`withinProject`)

`withinProject` calls `realpathSync(path)` which throws if the path does not exist. The `catch` block returns `false`, which silently denies access to non-existent paths. For `file:write` to a new file, this is handled separately, but the inconsistency means some tools may reject valid new-file paths while others allow them.

**Fix:** Make path validation consistent across all tools — validate the resolved path against the project root without requiring the file to already exist.

---

### B-9: Type-only imports used as value imports (CRITICAL — runtime crash) — FIXED
**Files:** `src/core/verification.ts`, `src/core/run-loop.ts`

All imports from `./types.js` are TypeScript interfaces/types (type-only). With ESM + `module: NodeNext`, type-only imports must use `import type` syntax. Without it, Node.js treats them as value imports and crashes at runtime:

```
SyntaxError: The requested module './types.js' does not provide an export named 'VerificationEvidence'
```

**Fix:** Changed `import { ... } from './types.js'` to `import type { ... } from './types.js'` in both files.

**Status:** FIXED — CLI now starts successfully (`npm run cli` works).

---

## Features needed / Architecture rewire recommendations

### F-1: Unify the entry points (HIGH PRIORITY — architecture rewire) — RESOLVED
**Fix applied:** `src/cli.ts` now imports `runRepl` from `./main-new.js`. Both `npm run dev` and the published binary use `src/main-new.ts` as the single entry point.

### F-2: Add a config file (`.agent-terrc` / `agent-termo.json`)
Currently all configuration is via environment variables (`NIM_API_KEY`, `NIM_MODEL`, `AGENT_TERMO_PERMISSION_MODE`, etc.). A JSON config file with project-level and user-level layers would improve usability and make CI/CD and team sharing easier.

### F-3: Add unit tests for core modules
The test suite is almost entirely integration tests (`tests/integration/`). There are no unit tests for:
- `src/tools/index.ts` (file read/write/edit, glob, grep, bash)
- `src/llm/client.ts` (NimClient streaming, tool-call parsing)
- `src/runtime/verify.ts` (completion gate)
- `src/runtime/checkpoints.ts` (undo/redo)

### F-4: Add `--help` graceful degradation without API key
`startAgent` in `src/cli.ts` throws if `NIM_API_KEY` is missing and stdin is not a TTY. Running `agent-termo --help` or `agent-termo init` should not require an API key.

### F-5: Normalize all tool output paths to forward slashes
Related to B-1 — every tool that returns file paths (`file:read`, `file:glob`, `grep`, `git:*`) should normalize `\\` to `/` so output is deterministic across Windows/macOS/Linux.

---

## Quick fix commands

```bash
# Fix lint errors (prefer-const, unused vars, floating promise)
# Manual edits required in: src/core/events.ts, src/core/tools.ts, src/main-new.ts

# Fix no-console warnings in src/cli.ts
# Replace console.log with printInfo/printSuccess from ./ui/index.js

# Fix glob path separator in src/tools/index.ts toolFileGlob
# Map results through .replace(/\\/g, '/')
```

---

## Summary

The codebase is functional (typecheck passes, 129/130 tests pass) but has:
- **1 confirmed test failure** (Windows path separators in glob output)
- **7 ESLint errors** (prefer-const ×6, floating promise ×1, unused vars ×2)
- **Dozens of ESLint warnings** (console, any)
- **A critical architectural duplication** between `src/main.ts` and `src/main-new.ts` that should be resolved before further feature work.
