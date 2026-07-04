# Route Map — CLI Commands

**Project:** Agent-Termo
**Purpose:** Quick reference for all CLI commands and flags

---

## Primary Commands

### `agent-termo` (default — REPL mode)

Starts the interactive REPL loop with a full-screen terminal UI.

```
agent-termo
```

**What happens:**
1. Banner and welcome message displayed
2. System prompt loaded from `.claude/agents/project-manager.md`
3. User enters natural-language instructions
4. AI responds with streaming output
5. Tool calls are executed inline
6. Memory and timeline updated after each turn

**Exit:** Type `exit`, `quit`, or press `Ctrl+C`.

---

### `--help` / `-h`

```
agent-termo --help
```

Displays the full command reference to stdout and exits.

---

### `--version` / `-v`

```
agent-termo --version
```

Displays `agent-termo/1.0.0` and exits.

---

### `--info`

```
agent-termo --info
```

Displays environment diagnostics without starting the REPL:
- Node.js version
- NIM API key status (present / missing)
- Model configured
- Config file paths
- Log level

---

## Interaction Commands (inside REPL)

Once inside the REPL, these additional commands are available:

| Command | Description |
|---------|-------------|
| `exit` | Exit the REPL cleanly |
| `quit` | Alias for `exit` |
| `Ctrl+C` | Cancel current streaming response |
| `Ctrl+D` | Exit (EOF) |
| `Ctrl+L` | Clear screen |
| `Ctrl+R` | Reverse-i-search through history |
| `!!` | Repeat last command |

---

## Environment Variables

These affect CLI behaviour and are read from `.env` or the shell environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `NIM_API_KEY` | — | **Required.** Your Nvidia NIM API key |
| `NIM_BASE_URL` | `https://integrate.api.nvidia.com/v1` | API base URL |
| `NIM_MODEL` | `meta/llama-3.1-8b-instruct` | Default chat model |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `AGENT_TERMO_DIR` | `.claude` | Directory for agent prompts |
| `AGENT_TERMO_DOCS` | `docs` | Directory for project docs |
| `CONFIRM_DESTRUCTIVE` | `true` | Ask before `rm -rf`, force-push, etc. |
| `ALLOWED_COMMANDS` | `git,npm,node,...` | Whitelist for bash tool |
| `LLM_TIMEOUT` | `120000` | API timeout in ms |
| `BASH_TIMEOUT` | `300000` | Bash command timeout in ms |

---

## REPL Prompt Style

```
agent-termo $ _
```

After the AI starts responding, the prompt is replaced by a streaming output area.
Once the response is complete, the prompt reappears.

---

## Error Output Format

Errors are displayed in red with a clear label:

```
[ERROR] Tool 'file:read' failed: path is required
```

Authentication errors:

```
[ERROR] NIM API authentication failed (HTTP 401). Check NIM_API_KEY in .env
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Clean exit |
| `1` | General error (API failure, unhandled exception) |
| `2` | Invalid arguments / --help |
| `130` | Interrupted (Ctrl+C) |

---

## Development Commands (from package.json)

These are for development and testing, not the end-user CLI:

```
npm run dev        # tsx watch — live reload during development
npm run build      # Build dist/ from src/ with esbuild
npm run build:tsc  # TypeScript type-check only
npm run build:pkg  # Bundle self-contained binaries (.exe etc)
npm run test       # vitest run — run all tests once
npm run test:watch # vitest — run tests with watch mode
npm run lint       # eslint src/ — check code style
```