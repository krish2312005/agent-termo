# Developer Setup Guide — Agent-Termo

**Project:** Agent-Termo
**Purpose:** How to set up from scratch and run the project locally

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20.x LTS or higher | Check: `node --version` |
| npm | 10.x | Check: `npm --version` |
| Git | any recent | For clone and git tools |

---

## 1. Clone the Repository

```bash
cd ~/projects   # or any directory you prefer
git clone <repository-url> agent-termo
cd agent-termo
```

---

## 2. Install Dependencies

```bash
npm install
```

This installs all runtime and development dependencies listed in `package.json`. Expected packages:

- **Runtime:** blessed, chalk, commander, fs-extra, marked, openai, simple-git, zod
- **Dev:** esbuild, pkg, tsx, typescript, vitest, eslint

---

## 3. Configure Environment Variables

Copy the example file and fill in your NIM API key:

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```env
NIM_API_KEY=nvapi-YOUR_KEY_HERE
```

To get a free key:
1. Visit [https://build.nvidia.com/](https://build.nvidia.com/)
2. Sign up / log in
3. Pick a model and generate an API key
4. Copy it into `.env`

**Optional overrides** (already have sane defaults):

```env
NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NIM_MODEL=nvidia_nim/moonshotai/kimi-k2.6
LOG_LEVEL=info
```

---

## 4. Verify the TypeScript Setup

```bash
npm run typecheck
```

Expected output: no errors. Runs `tsc --noEmit` across all `src/` files.

---

## 5. Build the Project

```bash
npm run build
```

This runs the esbuild script to compile all TypeScript source files into `dist/`. Expected output: 44 JS files in `dist/`.

---

## 6. Run the CLI

### Development mode (live reload):

```bash
npm run dev
```

This starts the REPL with `tsx watch` — any file changes in `src/` trigger an instant reload.

### Single run (production-ish):

```bash
npm run cli
# or directly:
node dist/cli.js
```

---

## 7. Test the NIM API Key

```bash
node scripts/test-nim.mjs
```

This makes a single non-streaming API call and reports:
- HTTP status
- Whether the API key is valid
- Model availability

Expected success output:
```
HTTP Status: 200 OK
Response: API works
RESULT: NIM API is working correctly.
```

If you get a 404, the model name in `NIM_MODEL` may not exist in this API key's catalog — try changing the model to an official NIM model.

---

## 8. Run the Test Suite

```bash
# All tests (once)
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

---

## 9. Project Directory Structure

```
agent-termo/
├── src/                  # TypeScript source
│   ├── cli.ts            # Entry point (Commander)
│   ├── main.ts           # REPL loop
│   ├── llm/              # NIM client, tool defs
│   ├── tools/            # 9 tool implementations
│   ├── agents/            # Agent loader
│   ├── memory/            # Memory/timeline runtime
│   ├── ui/                # Terminal UI (chalk+readline)
│   ├── types/             # Shared TypeScript types
│   └── utils/             # Config, ANSI helpers
├── dist/                  # Compiled JS output (gitignored build artefact)
├── .claude/              # Agent prompts and commands
│   └── agents/           # 12 agent .md prompt files
├── scripts/              # Build and utility scripts
│   ├── build.mjs         # esbuild + pkg pipeline
│   └── test-nim.mjs       # NIM API validation script
├── tests/                # Test suites
│   └── integration/       # Integration tests
├── docs/                 # Project documentation
├── .env                  # Your local config (gitignored)
├── .env.example          # Template
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── eslint.config.mjs
```

---

## 10. Troubleshooting

### `npm run dev` starts but shows a blank/wrong screen

**Cause:** Blessed TUI may not render correctly in Git Bash / certain Windows terminals.

**Fix:** Run in Windows Terminal or Windows PowerShell instead of Git Bash.

### `npm test` fails with module resolution errors

**Cause:** Running tests from wrong directory, or `dist/` is stale.

**Fix:** `npm run build` then `npm test`.

### NIM API test returns 404

**Cause:** Model name not available for your API key.

**Fix:** Change `NIM_MODEL` to a model available at [https://build.nvidia.com/](https://build.nvidia.com/). Use the exact model slug from the URL.

### TypeScript errors on first build

**Cause:** `dist/` was modified from a different TypeScript version.

**Fix:** `rm -rf dist && npm run build`.

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

---

## Editor Setup

### VS Code

The project uses TypeScript strict mode. Recommended VS Code settings:

```json
{
  "editor.formatOnSave": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

The project already has a `tsconfig.json` configured — VS Code will pick it up automatically.

---

## Code Style

ESLint is configured:
```bash
npm run lint        # check
npm run lint:fix     # auto-fix
```

---

*Last updated: 2026-07-04*