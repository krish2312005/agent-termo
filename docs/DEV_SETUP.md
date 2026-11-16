# Developer Setup Guide — Agent-Termo

**Project:** Agent-Termo  
**Purpose:** Terminal-based AI coding agent that replicates the Claude Code experience  
**Runtime:** Node.js 20.x LTS  
**Package Manager:** npm 10.x  
**LLM Backend:** Nvidia NIM APIs (free tier, OpenAI-compatible)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Clone the Repository](#clone-the-repository)
3. [Install Dependencies](#install-dependencies)
4. [Configure Environment Variables](#configure-environment-variables)
5. [Verify TypeScript Setup](#verify-typescript-setup)
6. [Build the Project](#build-the-project)
7. [Run the CLI](#run-the-cli)
8. [Test the NIM API Key](#test-the-nim-api-key)
9. [Run the Test Suite](#run-the-test-suite)
10. [Project Directory Structure](#project-directory-structure)
11. [Troubleshooting](#troubleshooting)
12. [Production Build](#production-build)
13. [Editor Setup — VS Code](#editor-setup-vs-code)
14. [Code Style](#code-style)

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20.x LTS or higher | Check: `node --version` |
| npm | 10.x | Check: `npm --version` |
| Git | any recent | For clone and git tools |
| NVIDIA NIM API Key | free tier | Get from [build.nvidia.com](https://build.nvidia.com/) |

Verify your environment:

```bash
node --version   # v20.x.x
npm --version    # 10.x.x
git --version    # git version 2.x.x
```

---

## Clone the Repository

```bash
cd ~/projects   # or any directory you prefer
git clone https://github.com/krish2312005/agent-termo.git
cd agent-termo
```

---

## Install Dependencies

```bash
npm install
```

This installs all runtime and development dependencies listed in `package.json`.

**Runtime dependencies:**
- `blessed` — Terminal UI framework
- `chalk` — Color output
- `commander` — CLI argument parsing
- `fs-extra` — File system operations
- `glob` — File pattern matching
- `marked` — Markdown rendering
- `openai` — OpenAI SDK for NIM API
- `simple-git` — Git operations
- `zod` — Schema validation

**Development dependencies:**
- `esbuild` — Bundler
- `pkg` — Binary packager
- `tsx` — TypeScript runner
- `typescript` — TypeScript compiler
- `vitest` — Test runner
- `eslint` — Linter

---

## Configure Environment Variables

Copy the example file and fill in your NIM API key:

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```env
NIM_API_KEY=nvapi-YOUR_KEY_HERE
```

To get a free NIM API key:
1. Visit [https://build.nvidia.com/](https://build.nvidia.com/)
2. Sign up / log in
3. Pick a model and generate an API key
4. Copy it into `.env` as `NIM_API_KEY`

**Optional overrides** (already have sane defaults in `.env.example`):

```env
NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NIM_MODEL=meta/llama-3.1-8b-instruct
LOG_LEVEL=info
DEBUG=false
CONFIRM_DESTRUCTIVE=true
ALLOWED_COMMANDS=git,npm,node,pnpm,yarn,tsx,tsc
LLM_TIMEOUT=120000
BASH_TIMEOUT=300000
```

> **Important:** Model names must use **dot notation** (e.g., `meta/llama-3.1-8b-instruct`), not underscores. Underscores return HTTP 404.

The `.env` file is gitignored — never commit your API key.

---

## Verify TypeScript Setup

```bash
npm run typecheck
```

This runs `tsc --noEmit` across all `src/` files. Expected output: no errors.

TypeScript configuration (`tsconfig.json`):
- Target: ES2022
- Module: NodeNext
- Strict mode: enabled
- Output directory: `./dist`
- Root directory: `./src`

---

## Build the Project

```bash
npm run build
```

This runs the esbuild script (`scripts/build.mjs`) to compile all TypeScript source files into `dist/`.

Available build scripts:

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `npm run build` | esbuild compilation to `dist/` |
| `build:tsc` | `npm run build:tsc` | `tsc` compilation |
| `build:esbuild` | `npm run build:esbuild` | Direct esbuild via `node scripts/build.mjs` |
| `build:pkg` | `npm run build:pkg` | Self-contained binaries via `pkg` |

---

## Run the CLI

### Development mode (live reload)

```bash
npm run dev
```

Starts the REPL with `tsx watch`. Any file changes in `src/` trigger an instant reload.

### Single run

```bash
npm run cli
# or directly:
node dist/cli.js
```

### CLI commands

Agent-Termo supports commander-based CLI arguments. See `docs/ROUTE_MAP.md` for the full command reference.

Common usage:

```bash
# Interactive REPL
npm run dev

# Run with a specific model
NIM_MODEL=meta/llama-3.1-70b-instruct npm run dev

# Run with debug logging
DEBUG=true npm run dev
```

---

## Test the NIM API Key

```bash
node scripts/test-nim.mjs
```

This makes a single non-streaming API call to NVIDIA NIM and reports:
- HTTP status code
- Whether the API key is valid
- Model availability

Expected success output:

```
HTTP Status: 200 OK
Response: API works
RESULT: NIM API is working correctly.
```

If you get a 404, the model name in `NIM_MODEL` may not be available for your API key — try changing it to an official NIM model from [build.nvidia.com](https://build.nvidia.com/).

---

## Run the Test Suite

```bash
# All tests (once)
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

Tests use **vitest** and live in `tests/integration/`. The test suite validates core functionality including NIM API integration, tool execution, and CLI behavior.

---

## Project Directory Structure

```
agent-termo/
├── src/                  # TypeScript source code
│   ├── cli.ts            # Entry point (Commander-based CLI)
│   ├── main.ts           # REPL event loop
│   ├── llm/              # NIM client, tool definitions
│   ├── tools/            # Tool implementations (read, write, bash, git, glob)
│   ├── agents/           # Agent loader (12 agents)
│   ├── memory/           # Memory/timeline runtime
│   ├── ui/               # Terminal UI (blessed + chalk)
│   ├── types/            # Shared TypeScript types
│   └── utils/            # Config, ANSI helpers
├── dist/                 # Compiled JS output (gitignored build artefact)
├── .claude/              # Agent prompts and commands
│   ├── agents/           # 12 agent .md prompt files
│   ├── commands/         # Command definitions
│   └── skills/           # Skill definitions
├── scripts/              # Build and utility scripts
│   ├── build.mjs         # esbuild + pkg pipeline
│   └── test-nim.mjs      # NIM API validation script
├── tests/                # Test suites
│   └── integration/      # Integration tests
├── docs/                 # Project documentation
├── .env                  # Local config (gitignored)
├── .env.example          # Environment template
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── vitest.config.ts      # Vitest configuration
└── eslint.config.mjs     # ESLint configuration
```

---

## Troubleshooting

### `npm run dev` starts but shows a blank/wrong screen

**Cause:** Blessed TUI may not render correctly in Git Bash or certain Windows terminals.

**Fix:** Run in Windows Terminal or Windows PowerShell instead of Git Bash.

### `npm test` fails with module resolution errors

**Cause:** Running tests from the wrong directory, or `dist/` is stale.

**Fix:** Run `npm run build` then `npm test`.

### NIM API test returns 404

**Cause:** Model name not available for your API key, or using underscore notation.

**Fix:** Change `NIM_MODEL` to a model available at [build.nvidia.com](https://build.nvidia.com/). Use dot notation (e.g., `meta/llama-3.1-8b-instruct`, not `meta/llama-3_1-8b-instruct`).

### TypeScript errors on first build

**Cause:** `dist/` was modified from a different TypeScript version.

**Fix:** `rm -rf dist && npm run build`.

### `npm install` fails with peer dependency warnings

**Cause:** Version mismatches between packages.

**Fix:** Try `npm install --legacy-peer-deps` or delete `node_modules` and `package-lock.json`, then reinstall.

### Port or permission errors

**Cause:** Another process using a required port, or insufficient file permissions.

**Fix:** Check for running processes (`lsof -i :PORT`) and ensure you have write access to the project directory.

### API key not recognized

**Cause:** `.env` not loaded, or `NIM_API_KEY` is empty/incorrect.

**Fix:** Verify `.env` exists in the project root and contains a valid key starting with `nvapi-`. Restart the CLI after editing `.env`.

---

## Production Build

To build self-contained binary executables (no Node.js required to run):

```bash
npm run build
npm run build:pkg
```

Outputs appear in `dist/`:
- `agent-termo-win.exe` (Windows)
- `agent-termo-macos` (macOS)
- `agent-termo-linux` (Linux)

These binaries bundle the Node.js runtime and all dependencies.

---

## Editor Setup — VS Code

The project uses TypeScript strict mode. Recommended VS Code settings (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

Recommended extensions:
- **TypeScript and JavaScript Language Features** (built-in)
- **Prettier - Code formatter** (esbenp.prettier-vscode)
- **ESLint** (dbaeumer.vscode-eslint)

VS Code will pick up `tsconfig.json` automatically for type checking and IntelliSense.

---

## Code Style

ESLint is configured for the project:

```bash
# Check for lint errors
npm run lint

# Auto-fix lint errors
npm run lint:fix
```

Key style guidelines:
- Use TypeScript strict mode
- Prefer ESM imports/exports (`import`/`export`)
- Use `const` by default, `let` only when reassignment is needed
- Use descriptive variable and function names
- Add JSDoc comments for public APIs
- Run `npm run lint:fix` before committing

---

*Last updated: 2026-07-04*