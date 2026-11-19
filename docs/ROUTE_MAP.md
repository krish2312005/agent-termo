# Route Map — CLI Commands

**Project:** Agent-Termo  
**Purpose:** Complete reference for all CLI commands, flags, environment variables, REPL interactions, error formats, and exit codes  
**Status:** FINAL  
**Date:** 2026-11-16

---

## 1. Primary Commands

### `agent-termo` (default — REPL mode)

Starts the interactive REPL loop with a full-screen terminal UI built on `blessed`.

```
agent-termo
```

**What happens:**
1. Welcome banner displayed (ASCII logo, version, model info)
2. `MEMORY.md` and `TIMELINE.md` loaded into context
3. System prompt built from agent prompts in `.claude/agents/`
4. User enters natural-language instructions at the `>` prompt
5. AI responds with streaming output in the main content area
6. Tool calls are executed inline with progress indicators
7. Memory and timeline updated after each turn
8. Returns to prompt for next input

**Exit:** Type `exit`, `quit`, press `Ctrl+D`, or press `Ctrl+C`.

---

### `--help` / `-h`

Displays the full command reference to stdout and exits.

```
agent-termo --help
agent-termo -h
```

**Exit code:** 2

---

### `--version` / `-v`

Displays the version string and exits.

```
agent-termo --version
agent-termo -v
```

**Output:** `agent-termo/1.0.0`

**Exit code:** 0

---

### `--info`

Displays environment diagnostics without starting the REPL. Useful for troubleshooting configuration issues.

```
agent-termo --info
```

**Output includes:**
- Node.js version
- NIM API key status (present / missing — value never printed)
- NIM base URL
- Model configured (e.g., `meta/llama-3.1-8b-instruct`)
- Config file paths (`.env`, `docs/MEMORY.md`, `docs/TIMELINE.md`)
- Log level
- Project root directory

**Exit code:** 0

---

## 2. Interaction Commands (Inside REPL)

Once inside the REPL, these commands and key bindings are available:

### 2.1 Text Commands

| Command | Description |
|---------|-------------|
| `exit` | Exit the REPL cleanly, save session state |
| `quit` | Alias for `exit` |
| `!!` | Repeat the last command/message |

### 2.2 Key Bindings

| Key | Action | Context |
|-----|--------|---------|
| `Enter` | Send current input as a user message | Input area |
| `Ctrl+C` | Cancel current streaming operation, return to prompt | Any |
| `Ctrl+D` | Exit (EOF), clean shutdown | Input area |
| `Ctrl+L` | Clear the screen (main content area) | Any |
| `Ctrl+R` | Reverse-i-search through command history | Input area |
| `↑` | Previous command from history (last 50) | Input area |
| `↓` | Next command from history | Input area |
| `Tab` | No-op (reserved for future autocomplete) | Input area |

### 2.3 Input Behavior

- Empty input is ignored; prompt is re-displayed
- Input history persists for the session (last 50 messages)
- `Ctrl+C` during streaming cancels the current LLM response
- `Ctrl+C` at idle prompt returns to prompt (no exit)

---

### 2.4 Skills

Skills use the `SKILL.md` folder format and can be managed from the REPL:

| Command | Behavior |
|---|---|
| `/skill` | Open the interactive skill manager. |
| `/skill list [--project|--global]` | List skills in the selected scope. |
| `/skill add <name> [--global]` | Create a starter skill. |
| `/skill import <path> [--global]` | Import a local skill folder or its `SKILL.md`. |
| `/skill show <name>` | Display the skill instructions. |
| `/skill refresh` | Reload the skill catalog after external edits. |
| `/skill use <name> <task>` | Run a task with the selected skill instructions. |
| `/skill delete <name> [--global|--project]` | Delete a skill after confirmation. |

New skills are stored in `.agent-termo/skills/` for the current project or `~/.agent-termo/skills/` for user scope. Existing skills are discovered in Agent-Termo, Codex (`.agents/skills/`), and Claude Code (`.claude/skills/`) directories at both scopes. Each skill is a folder containing `SKILL.md`; supporting files remain beside it.

The model receives skill descriptions in its system prompt and loads the full instructions or supporting references on demand using the read-only `skill:read` tool.

---

### 2.5 Saved Conversations

Agent-Termo automatically snapshots the current conversation in `.agent-termo/sessions/` after user messages, assistant responses, tool-call messages, and tool results. Snapshots contain the complete message transcript plus model, thinking capacity, active agent, current goal, and task recovery state. The latest saved session for the current project is restored automatically when the REPL starts.

| Command | Behavior |
|---|---|
| `/sessions` | List saved sessions with short IDs, titles, message counts, and last-updated times. |
| `/resume` | Open a picker and switch to a saved session. |
| `/resume <id>` | Resume a session by full or unambiguous ID prefix. |
| `/fork` | Create an independent copy of the active session and switch to it. |
| `/fork <id>` | Fork a selected saved session by ID prefix. |

If the process stops while a tool call is in flight, the loader inserts a placeholder for any missing tool result so the resumed agent can verify the action instead of assuming it completed. Session snapshots are private local state and should not be committed.

---

## 3. Environment Variables

Read from `.env` or the shell environment at startup. Values are never logged or printed.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `NIM_API_KEY` | Yes | — | Nvidia NIM authentication key |
| `NIM_BASE_URL` | No | `https://integrate.api.nvidia.com/v1` | API base URL |
| `NIM_MODEL` | No | `meta/llama-3.1-8b-instruct` | Default chat model (use dot notation, e.g. `3.1` not `3_1`) |
| `LOG_LEVEL` | No | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `AGENT_TERMO_DIR` | No | `.claude` | Directory for agent prompt files |
| `AGENT_TERMO_DOCS` | No | `docs` | Directory for project documentation |
| `CONFIRM_DESTRUCTIVE` | No | `true` | Require confirmation for `rm -rf`, force-push, etc. |
| `ALLOWED_COMMANDS` | No | `git,npm,node,pnpm,yarn,tsx,tsc` | Whitelist for `bash:execute` tool (comma-separated) |
| `LLM_TIMEOUT` | No | `120000` | NIM API request timeout in milliseconds |
| `BASH_TIMEOUT` | No | `300000` | Bash command timeout in milliseconds |
| `DEBUG` | No | `false` | If `true`, includes stack traces in error output |

### Example `.env`

```bash
NIM_API_KEY=your-nvidia-nim-api-key
NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NIM_MODEL=meta/llama-3.1-8b-instruct
LOG_LEVEL=info
CONFIRM_DESTRUCTIVE=true
ALLOWED_COMMANDS=git,npm,node,pnpm,yarn,tsx,tsc
LLM_TIMEOUT=120000
BASH_TIMEOUT=300000
```

---

## 4. REPL Prompt Style

### Default Prompt

```
agent-termo $ _
```

- Prefix: `agent-termo $ ` in muted color (#94A3B8, ANSI 145)
- Cursor: `█` blinking (500ms on, 500ms off) in text color (#F8FAFC, ANSI 255)
- Input text: text color

### During Streaming

When the AI is responding, the prompt area is replaced by streaming output in the main content area. The prompt reappears once the response is complete.

### During Tool Execution

```
> Running file:read on src/main.ts...
```

The prompt prefix changes to show the active tool operation.

---

## 5. Error Output Format

All errors follow a consistent format with red coloring and clear labels.

### 5.1 General Error

```
[ERROR] Tool 'file:read' failed: path is required
```

### 5.2 Authentication Error

```
[ERROR] NIM API authentication failed (HTTP 401). Check NIM_API_KEY in .env
```

### 5.3 Tool Error (Inline Display)

```
┌─ Error ───────────────────────────────────────────────────────────┐
│ ✗ file:read failed: ENOENT: no such file or directory             │
│ Hint: Check that the path is relative to project root             │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.4 Validation Error

```
╔══════════════════════════════════════════════════════════════════╗
║ ERROR: Request validation failed                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ - Field "email" is required                                       ║
║ - Field "password" must be at least 8 characters                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### 5.5 Error Color Coding

| Severity | Label | Color | ANSI |
|----------|-------|-------|------|
| Error | `ERROR:` | Red | 196 |
| Warning | `WARNING:` | Amber | 214 |
| Info | `INFO:` | Blue | 75 |

---

## 6. Exit Codes

| Code | Meaning | Trigger |
|------|---------|---------|
| `0` | Clean exit | `exit`, `quit`, `Ctrl+D`, `--version`, `--info` |
| `1` | General error | API failure, unhandled exception, missing `NIM_API_KEY` |
| `2` | Invalid arguments | `--help`, unknown flags, malformed input |
| `130` | Interrupted | `Ctrl+C` during operation |

---

## 7. Development Commands

These are npm scripts for development and testing, not end-user CLI commands:

```
npm run dev        # tsx watch — live reload during development
npm run build      # Build dist/ from src/ with esbuild
npm run build:tsc  # TypeScript type-check only
npm run build:pkg  # Bundle self-contained binaries (.exe etc.)
npm run test       # vitest run — run all tests once
npm run test:watch # vitest — run tests with watch mode
npm run lint       # eslint src/ — check code style
```

---

## 8. Command Reference Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLI COMMAND REFERENCE                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  agent-termo              Start interactive REPL                    │
│  agent-termo --help       Show help and exit (code 2)               │
│  agent-termo -h           Same as --help                            │
│  agent-termo --version    Show version and exit (code 0)            │
│  agent-termo -v           Same as --version                         │
│  agent-termo --info       Show environment diagnostics (code 0)     │
│                                                                     │
│  Inside REPL:                                                       │
│  exit / quit              Exit cleanly (code 0)                     │
│  !!                       Repeat last command                       │
│  Ctrl+C                   Cancel operation / interrupt (code 130)   │
│  Ctrl+D                   Exit (EOF, code 0)                        │
│  Ctrl+L                   Clear screen                              │
│  Ctrl+R                   Reverse search history                    │
│  ↑ / ↓                    Navigate command history                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

*Generated by frontend-planner — 2026-11-16*