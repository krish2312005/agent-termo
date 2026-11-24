# Deployment Guide — Agent-Termo

**Owner:** `deployment-expert` (see `.claude/workflow.md`).

**Scope of this document:** local build/run verification and the existing release path. The multi-agent workspace work on `feat/subagent-workspace` was verified **locally only**. No production deployment was performed, no host was configured, no secrets were set, and nothing was pushed. The interactive REPL/TUI was deliberately not started because it would hang a non-interactive verification.

**Verified revision:** branch `feat/subagent-workspace`, HEAD `aeea675` (`docs: record workspace security re-audit and deployment gate`), 2026-11-23. Working tree at verification time contained only `M docs/TIMELINE.md` plus one untracked `docs/changes/` log fragment; no product-code changes.

## Security gate

`docs/SECURITY.md`, section "Re-audit — 2026-11-23 (HEAD `6278313`)": **no critical or high finding is open**. The baseline highs SEC-01 (sub-agent approval detail) and SEC-02 (`bash:start` approval gate) are closed. Medium/low/informational findings remain documented and accepted for this deployment (SEC-06, SEC-15, SEC-16, SEC-17, SEC-18, and others; see the re-audit). Gate passed.

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Bun | >= 1.3.14 | `package.json` `engines.bun`; verified with 1.4.5 locally |
| Operating system | macOS, Linux, or Windows (Node-compatible) | Native Windows arm64 requires Bun 1.4+ per `docs/DEV_SETUP.md` |
| Git | any recent | Needed for clone and the git tools |
| LLM provider API key | optional for build/tests | Required only for live model calls (e.g. `NIM_API_KEY`) |

CI pins Bun `1.3.14`; the local verification below used Bun `1.4.5`. Both are above the declared minimum.

## Local install, typecheck, test, build

Commands were run from `/Users/apple/Desktop/agent-termo`:

| Command | Exact result | Exit |
|---|---|---|
| `bun --version` | `1.4.5` | 0 |
| `bun install --frozen-lockfile` | `Checked 274 installs across 307 packages (no changes) [84.00ms]` (`bun.lock` present) | 0 |
| `bun run typecheck` | `$ bunx tsc --noEmit`; no diagnostics | 0 |
| `bun run test` | `Test Files 45 passed \| 1 skipped (46)`; `Tests 446 passed \| 2 skipped (448)` | 0 |
| `bun run build` | `Copied .claude to dist/`; `Build complete: dist/cli.js` | 0 |
| `bun run test:package` | `Packed npm CLI passed: agent-termo@2.0.7` | 0 |

Notes on the test run: the vitest output includes intentional fixture-failure blocks (the completion-gate and retry tests exercise failing commands on purpose); the final summary above is the authoritative result. The one skipped test file and two skipped tests are pre-existing and unchanged. Node `v26.5.0` is installed locally.

`bun run test:package` packs the package with npm, installs the tarball into an isolated global prefix under the OS temp directory, verifies the tarball contents, `agent-termo --version`/`--help`, and `init` output. It needs registry access to install the tarball's dependencies (it succeeded here) but no real API key. Its pseudo-terminal REPL check runs only on Linux, so on this macOS run it printed `Skipping the Linux pseudo-terminal check on this platform.`

## Build artifact

- Path: `dist/cli.js`
- Size: **271,741 bytes** (271.7 kB), mode `rwxr-xr-x`, Bun shebang; source map `dist/cli.js.map` (919.7 kB, per `npm pack` output)
- The build also copies bundled defaults to `dist/.agent-termo-defaults/` and `.claude` assets into `dist/`
- `bin/agent-termo.js` is the published launcher (`#!/usr/bin/env bun`) and imports `../dist/cli.js`
- `dist/` and `node_modules/` are gitignored and untracked (verified: 0 tracked files)

Non-interactive smoke checks (no API key, no network):

| Command | Exact result | Exit |
|---|---|---|
| `bun dist/cli.js --version` | `2.0.7` | 0 |
| `bun dist/cli.js --help` | `Usage: agent-termo [options] [command] [project]` (full help printed) | 0 |
| `bun bin/agent-termo.js --version` | `2.0.7` | 0 |

## Environment variables (names only)

Copy `.env.example` to `.env` and fill values locally. `.env` is gitignored and was absent from the working tree; `git ls-files .env` returned zero entries. Never commit a filled `.env`.

- `NIM_API_KEY`
- `NIM_BASE_URL`
- `NIM_MODEL`
- `AGENT_TERMO_OUTPUT_RESERVE_TOKENS`
- `AGENT_TERMO_CONTEXT_SAFETY_MARGIN`
- `AGENT_TERMO_CONTEXT_WINDOW` (optional, commented out in the template)
- `AGENT_TERMO_DIR`
- `AGENT_TERMO_DOCS`
- `AGENT_TERMO_MEMORY`
- `AGENT_TERMO_TIMELINE`
- `LOG_LEVEL`
- `DEBUG`
- `CONFIRM_DESTRUCTIVE`
- `ALLOWED_COMMANDS`
- `LLM_TIMEOUT`
- `BASH_TIMEOUT`

The multi-agent workspace branch adds **no new environment variables** and no dependency/lockfile changes (per `docs/SECURITY.md`).

## Run the CLI

```bash
# Built bundle
bun dist/cli.js

# Published launcher
bun bin/agent-termo.js
# or, when installed: agent-termo

# Development with watch mode
bun run dev
```

CLI flags (`--api-key`, `--model`, `--debug`, `--yes/--auto-approve`, `init`, `mcp`) are shown by `--help`. The default project directory is the current working directory.

Health check for a built artifact (used in CI and suitable for a post-install check):

```bash
bun dist/cli.js --version   # expected: 2.0.7
bun dist/cli.js --help      # expected: usage text, exit 0
```

## CI and release

Existing GitHub Actions workflows (no new deploy config was added; no production deployment was requested):

- `.github/workflows/ci.yml` — on every push and PR to `master`. Ubuntu job: checkout, Bun `1.3.14`, `bun install`, Playwright/Chromium install, `bun run typecheck`, targeted eslint on changed runtime files, `bun run test`, `bun run test:package`, `bun run cli --help`. Windows job: terminal process lifecycle and Windows glob normalization tests.
- `.github/workflows/publish.yml` — on `v*` tags: validates the tag, typechecks, tests, builds, and publishes to npm with `NPM_TOKEN` held in GitHub Actions secrets (not in the repo). Do not push a tag or run this workflow unless a release is explicitly requested.

Secrets belong in the host/CI secret store (for example GitHub Actions `NPM_TOKEN` and any provider keys kept out of CI); they must never be committed. No production host or deploy target is configured in this repository.

## Rollback

No production deployment occurred; rollback is local/package-only:

- **Source rollback:** check out the previous verified commit and rebuild:
  ```bash
  git checkout 6278313          # previous commit (security re-audit, tests/build green)
  bun install --frozen-lockfile
  bun run build
  bun dist/cli.js --version
  ```
  (Substitute the last known-good commit; `git-manager` is the only agent that may create branches/commits.)
- **Rebuild-only rollback:** `rm -rf dist && bun run build`.
- **Installed package rollback:** `npm install -g agent-termo@<previous-version>` (current verified version is `2.0.7`), then `agent-termo --version`.
- **Data/config rollback:** user state lives in `~/.agent-termo/config.json` and project-local `.agent-termo/` (permissions, checkpoints, agent folders). Code rollback does not modify them; remove or restore only with user intent.

## Manual TTY verification still required

**None of the following were run in this verification** (the interactive REPL/TUI was not started, and no API key or live provider was used). They must be exercised manually in a real terminal before any release announcement:

- Starting main (REPL/TUI launches and accepts input).
- Spawning at least two sub-agents.
- Navigator positioned directly below the composer, and selection changing the content view.
- Direct messages delivered to each exact sub-agent (no cross-routing).
- Background streaming and per-agent transcript isolation while another agent is selected.
- Inspecting completed and failed agents (transcript retained, error visible).
- Per-agent scroll positions and per-agent composer drafts across switches.
- `Ctrl+X`, arrow keys, `Enter`, and `Esc` navigation/focus behavior.
- `Ctrl+X Ctrl+K` stop-all.
- Approval panel showing path/diff with `Y` / `A` / `N` keys.
- Resize behavior at 80x24 and 40x12.
- Composer arrow editing, history, and completion.
- Dark-only theme reality (the TUI is dark-only; there is no light mode).
- Legacy Apple Terminal behavior.
- Live provider streaming (requires a real API key).
