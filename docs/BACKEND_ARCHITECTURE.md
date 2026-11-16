# Backend Architecture — Agent-Termo

**Project:** Agent-Termo CLI Tool  
**Date:** 2026-11-16  
**Status:** FINAL  
**Model:** meta/llama-3.1-8b-instruct (Nvidia NIM, dot notation required)

---

## Overview

Agent-Termo is a **terminal-based AI coding agent tool** (CLI only, no server component). All AI processing runs through the Nvidia NIM API via the OpenAI SDK. The "backend" is the **tool execution layer** — a set of 9 tools exposed to the LLM via OpenAI function calling. The LLM decides which tools to call, and the backend executes them and returns results to the conversation.

### Core Principles

| Principle | Description |
|-----------|-------------|
| **CLI-first** | No web server, no HTTP endpoints. Runs entirely in the terminal via REPL. |
| **Function calling** | LLM invokes tools via OpenAI-compatible `tools` parameter in NIM API requests. |
| **Stateless per call** | Each tool call is independent; session state lives in memory during the REPL session. |
| **Filesystem persistence** | Memory (`docs/MEMORY.md`) and Timeline (`docs/TIMELINE.md`) are markdown files on disk. |
| **Sandboxed execution** | All file operations constrained to project root; bash commands whitelisted and timed out. |

---

## Component Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER TERMINAL                                   │
│  stdin (REPL input) ───────────────────────────────────────────────────────► │
│  ◄────────────────────────────────────────────────────────────────────────── stdout (streaming output) │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  src/main.ts — CLI Orchestrator / REPL Event Loop                           │
│  • Reads user input from stdin                                              │
│  • Builds conversation (system prompt + memory + history)                   │
│  • Calls NIM LLM client with tool definitions                               │
│  • Routes tool calls to tool executor                                       │
│  • Feeds tool results back to LLM                                           │
│  • Renders streaming output to terminal UI                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  src/llm/        │   │  src/tools/      │   │  src/ui/         │
│  client.ts       │   │  index.ts        │   │  screen.ts       │
│  models.ts       │   │  (tool impls)    │   │  index.ts        │
│  tools.ts        │   │                  │   │                  │
│                  │   │  file:read       │   │  Scrollable      │
│  • OpenAI SDK    │   │  file:write      │   │  output region   │
│  • NIM baseURL   │   │  file:edit       │   │  Input box       │
│  • Streaming     │   │  file:glob       │   │  Status line     │
│  • Tool calling  │   │  grep            │   │  Markdown render │
│  • Model config  │   │  bash:execute    │   │  Diff viewer     │
└──────────────────┘   │  git:status      │   └──────────────────┘
                       │  git:commit      │
                       │  git:push        │
                       │  git:log         │
                       └────────┬─────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FILESYSTEM (project root: /Users/apple/Desktop/agent-termo)                │
│  • docs/MEMORY.md    — project context (loaded at startup, updated on demand)│
│  • docs/TIMELINE.md  — chronological activity log (append-only)             │
│  • .claude/agents/*.md — agent system prompts (loaded at runtime)           │
│  • src/              — TypeScript source code                               │
│  • .env              — environment variables (not committed to git)          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User types** a message in the REPL → `src/main.ts` captures stdin
2. **Build prompt** → system prompt + `docs/MEMORY.md` + conversation history
3. **Call NIM API** → OpenAI SDK POST to `https://integrate.api.nvidia.com/v1/chat/completions` with `tools` parameter
4. **LLM responds** → either text or tool calls
5. **If tool calls** → `src/tools/index.ts` executes the tool → result returned to LLM as tool message
6. **Stream output** → rendered in terminal UI via `src/ui/`
7. **Log to timeline** → significant events appended to `docs/TIMELINE.md`
8. **Update memory** → significant decisions appended to `docs/MEMORY.md`

---

## Tool Definitions (OpenAI Function Calling Schema)

All 9 tools are exposed to the NIM LLM as `tools` in the API request. Each tool has a JSON schema defining its name, description, and parameters.

### Tool: `file:read`

Reads the contents of a file from the filesystem.

```typescript
{
  name: "file:read",
  description: "Read the contents of a file from the filesystem.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or project-relative path to the file" },
      limit: { type: "number", description: "Maximum number of lines to read (default: 0 = all)", default: 0 },
      offset: { type: "number", description: "Line offset to start reading from (default: 0)", default: 0 }
    },
    required: ["path"],
    additionalProperties: false
  }
}
```

**Returns:** `{ success: boolean, output?: string, error?: string }`

**Constraints:**
- Path must be within `projectRoot` (no path traversal via `..`)
- `limit` caps lines returned; `offset` skips lines from the top

---

### Tool: `file:write`

Writes or overwrites a complete file with the given content.

```typescript
{
  name: "file:write",
  description: "Write or overwrite a complete file with the given content.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to write" },
      content: { type: "string", description: "Full file content to write" }
    },
    required: ["path", "content"],
    additionalProperties: false
  }
}
```

**Returns:** `{ success: boolean, output?: string, error?: string }`

**Constraints:**
- Path must be within `projectRoot`
- Creates parent directories if they don't exist
- Overwrites existing file completely

---

### Tool: `file:edit`

Edits a file by finding an exact string and replacing it.

```typescript
{
  name: "file:edit",
  description: "Edit a file by finding an exact string and replacing it.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File to edit" },
      old_string: { type: "string", description: "Exact text in the file to replace (must be unique)" },
      new_string: { type: "string", description: "Replacement text" }
    },
    required: ["path", "old_string", "new_string"],
    additionalProperties: false
  }
}
```

**Returns:** `{ success: boolean, output?: string, error?: string }`

**Constraints:**
- `old_string` must appear exactly once in the file (uniqueness enforced)
- Path must be within `projectRoot`

---

### Tool: `file:glob`

Lists files matching a glob pattern relative to project root.

```typescript
{
  name: "file:glob",
  description: "List files matching a glob pattern relative to project root.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern, e.g. 'src/**/*.ts'" },
      cwd: { type: "string", description: "Working directory (default: project root)" }
    },
    required: ["pattern"],
    additionalProperties: false
  }
}
```

**Returns:** `{ success: boolean, output?: string, error?: string }`

**Constraints:**
- `cwd` must be within `projectRoot`
- Pattern uses standard glob syntax (e.g., `**`, `*`, `?`)

---

### Tool: `grep`

Searches for text patterns within files.

```typescript
{
  name: "grep",
  description: "Search for text patterns within files.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex or literal text to search for" },
      path: { type: "string", description: "Directory or file to search in" },
      glob: { type: "string", description: "Optional: only match files matching this glob" },
      case_sensitive: { type: "boolean", default: true }
    },
    required: ["pattern", "path"],
    additionalProperties: false
  }
}
```

**Returns:** `{ success: boolean, output?: string, error?: string }`

**Constraints:**
- `path` must be within `projectRoot`
- `glob` filter applied before content search

---

### Tool: `bash:execute`

Executes a bash/shell command and returns its output.

```typescript
{
  name: "bash:execute",
  description: "Execute a bash/shell command and return its output.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute" },
      cwd: { type: "string", description: "Working directory (default: project root)" },
      timeout: { type: "number", description: "Timeout in ms (default: 300000 = 5 min)" }
    },
    required: ["command"],
    additionalProperties: false
  }
}
```

**Returns:** `{ success: boolean, output?: string, error?: string }`

**Constraints:**
- `cwd` must be within `projectRoot`
- Command checked against `ALLOWED_COMMANDS` whitelist
- Dangerous commands (`rm -rf`, `dd`, `> /dev/sda`, etc.) require user confirmation
- Process killed after `timeout` ms
- Output streamed live to terminal UI via terminal hooks

---

### Tool: `git:status`

Shows the working tree status of the git repository.

```typescript
{
  name: "git:status",
  description: "Show the working tree status of the git repository.",
  parameters: {
    type: "object",
    properties: {
      cwd: { type: "string", description: "Repository root (default: project root)" }
    },
    additionalProperties: false
  }
}
```

**Returns:** `{ success: boolean, output?: string, error?: string }`

**Constraints:**
- `cwd` must be within `projectRoot`
- Returns error if not a git repository

---

### Tool: `git:commit`

Commits staged changes with a message.

```typescript
{
  name: "git:commit",
  description: "Commit staged changes with a message.",
  parameters: {
    type: "object",
    properties: {
      message: { type: "string", description: "Commit message" },
      cwd: { type: "string", description: "Repository root" }
    },
    required: ["message"],
    additionalProperties: false
  }
}
```

**Returns:** `{ success: boolean, output?: string, error?: string }`

**Constraints:**
- `cwd` must be within `projectRoot`
- Requires staged changes (or uses `git add -A` depending on implementation)

---

### Tool: `git:push`

Pushes commits to the remote repository.

```typescript
{
  name: "git:push",
  description: "Push commits to the remote repository.",
  parameters: {
    type: "object",
    properties: {
      cwd: { type: "string", description: "Repository root" }
    },
    additionalProperties: false
  }
}
```

**Returns:** `{ success: boolean, output?: string, error?: string }`

**Constraints:**
- `cwd` must be within `projectRoot`
- Requires remote configured
- May require user confirmation (destructive operation)

---

### Tool: `git:log`

Shows recent git commit history.

```typescript
{
  name: "git:log",
  description: "Show recent git commit history.",
  parameters: {
    type: "object",
    properties: {
      cwd: { type: "string", description: "Repository root" },
      limit: { type: "number", description: "Number of commits (default: 20)", default: 20 }
    },
    additionalProperties: false
  }
}
```

**Returns:** `{ success: boolean, output?: string, error?: string }`

**Constraints:**
- `cwd` must be within `projectRoot`

---

## Tool Result Type

All tools return a consistent `ToolResult` type:

```typescript
interface ToolResult {
  success: boolean;
  output?: string;      // Present when success=true
  error?: string;       // Present when success=false
}
```

The LLM client wraps tool results into the conversation as tool messages and continues. No tool failure crashes the session.

---

## Session State

Sessions are **ephemeral** (in-memory only, lost when the REPL exits).

```typescript
interface Session {
  id: string;           // UUID v4, generated on startup
  projectRoot: string;  // CWD at startup (e.g., /Users/apple/Desktop/agent-termo)
  startedAt: Date;      // Session start timestamp
  messages: ConversationMessage[];  // Conversation history for context injection
  currentAgent: string; // Active agent name (e.g., "project-manager", "backend-expert")
}
```

### ConversationMessage

```typescript
interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];      // Present when role='assistant' and LLM calls tools
  tool_call_id?: string;        // Present when role='tool'
  name?: string;                // Tool name when role='tool'
}
```

### Session Lifecycle

1. **Startup**: Generate UUID, capture `process.cwd()` as `projectRoot`, load `docs/MEMORY.md` into system prompt
2. **Each turn**: Append user message, call NIM API, append assistant response, execute any tool calls, append tool results
3. **Shutdown**: Session discarded; only `docs/MEMORY.md` and `docs/TIMELINE.md` persist

---

## Memory System

**Location:** `docs/MEMORY.md` (markdown file on disk)

### Purpose

Persistent project context shared across all agents and sessions. Loaded at startup and injected into the system prompt so the LLM has awareness of prior decisions, architecture, and project state.

### Operations

```typescript
async function loadMemory(root: string): Promise<string>
// Reads docs/MEMORY.md, returns its contents as a string

async function appendToMemory(root: string, entry: string): Promise<void>
// Appends a dated entry to docs/MEMORY.md
```

### Format

Markdown with dated sections per agent activity:

```markdown
## [2026-11-16 18:17] - backend-architecture-designer

### Phase/Activity
Backend Architecture Documentation

### Actions Taken
- Rewrote docs/BACKEND_ARCHITECTURE.md completely
- Defined all 9 tool schemas for OpenAI function calling
- Documented session state, memory, timeline, error handling, security

### Notes
- NIM model: meta/llama-3.1-8b-instruct (dot notation)
```

### Access Rules

1. Read `MEMORY.md` at start of every session
2. Update `MEMORY.md` after significant work or decisions
3. Never delete historical context
4. Use as single source of truth for architectural decisions

---

## Timeline System

**Location:** `docs/TIMELINE.md` (append-only markdown log)

### Purpose

Chronological record of all agent activities, tool executions, decisions, and milestones. Every agent appends entries as work progresses.

### Log Entry Triggers

- Tool execution (tool name, path/target, status: OK/ERR)
- Agent switches (which agent took over)
- Major milestones (design complete, build pass, tests pass, etc.)
- Errors and warnings

### Operations

```typescript
async function appendToTimeline(root: string, entry: string): Promise<void>
// Appends a timestamped entry to docs/TIMELINE.md
```

### Format

```markdown
## [2026-11-16 18:17] - backend-architecture-designer

### Phase/Activity
Tool execution: file:write

### Actions Taken
- Requested tool: file:write
- File: docs/BACKEND_ARCHITECTURE.md

### Notes
- Result: succeeded
```

---

## Error Handling

### ToolResult Pattern

Every tool returns `ToolResult` — never throws uncaught exceptions:

```typescript
interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}
```

### Error Categories

| Category | Example | Handling |
|----------|---------|----------|
| **Validation** | Missing required parameter | Return `success: false, error: "..."` |
| **File not found** | `file:read` on missing path | Return `success: false, error: "ENOENT..."` |
| **Path traversal** | `../` in path | Return `success: false, error: "Path outside project root"` |
| **Bash timeout** | Command exceeds timeout | Kill process, return `success: false, error: "Command timed out"` |
| **Git not a repo** | `git:status` outside repo | Return `success: false, error: "fatal: not a git repository"` |
| **Dangerous command** | `rm -rf /` | Block execution, require user confirmation |
| **NIM API error** | HTTP 404/500 from NIM | Return error to user, do not crash session |

### Global Error Handler

The LLM client wraps all tool results into the conversation. If a tool fails, the error message is fed back to the LLM as a tool message, allowing the LLM to retry or adjust. No tool failure crashes the REPL session.

### Logging

- Internal errors logged to console (not exposed to user unless relevant)
- API keys never logged
- Stack traces captured internally for debugging only

---

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `NIM_API_KEY` | Yes | — | Nvidia NIM API authentication key |
| `NIM_BASE_URL` | No | `https://integrate.api.nvidia.com/v1` | NIM API endpoint base URL |
| `NIM_MODEL` | No | `meta/llama-3.1-8b-instruct` | Model name (dot notation required) |
| `AGENT_TERMO_DIR` | No | `.claude` | Agent prompt directory relative to project root |
| `ALLOWED_COMMANDS` | No | `git,npm,node,pnpm,yarn,tsx,tsc,ls,dir,mkdir,cat,type` | Comma-separated whitelist for bash:execute |
| `BASH_TIMEOUT_MS` | No | `300000` | Default timeout for bash commands (5 minutes) |
| `LOG_LEVEL` | No | `info` | Logging verbosity (debug, info, warn, error) |

### `.env.example`

```bash
# Nvidia NIM API (required)
NIM_API_KEY=nvapi-your-key-here
NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NIM_MODEL=meta/llama-3.1-8b-instruct

# Security
ALLOWED_COMMANDS=git,npm,node,pnpm,yarn,tsx,tsc,ls,dir,mkdir,cat,type
BASH_TIMEOUT_MS=300000

# Logging
LOG_LEVEL=info
```

**Rules:**
- Commit `.env.example` to git (with placeholder values)
- Never commit actual `.env` file
- `.env` is gitignored
- Rotate `NIM_API_KEY` regularly

---

## Security

### Defensive (Protecting Agent-Termo)

#### 1. Path Validation

All file operations (`file:read`, `file:write`, `file:edit`, `file:glob`, `grep`) validate that the target path resolves within `projectRoot`. Path traversal attempts (`..`, absolute paths outside root) are rejected.

```typescript
function validatePath(targetPath: string, projectRoot: string): boolean
// Resolves targetPath, checks it starts with projectRoot
```

#### 2. Bash Execution Sandbox

- Commands checked against `ALLOWED_COMMANDS` whitelist
- Default timeout: 300,000 ms (5 minutes)
- Long-running processes can be killed via terminal hooks
- Output streamed live to UI

#### 3. Dangerous Command Detection

Patterns that require explicit user confirmation:
- `rm -rf`, `rm -r` (recursive deletion)
- `dd` (disk operations)
- `> /dev/sda` (raw disk writes)
- `git push --force` (force push)
- `chmod 777` (overly permissive)

#### 4. Secrets Management

- `NIM_API_KEY` loaded from environment, never hardcoded
- Never logged or printed to terminal
- `.env` excluded from version control (`.gitignore`)

### Offensive (Generated Code Awareness)

The tool system does not generate or execute arbitrary code from the LLM beyond the 9 defined tools. All tool implementations are fixed and audited.

---

## NIM API Integration

### Configuration

| Setting | Value |
|---------|-------|
| Base URL | `https://integrate.api.nvidia.com/v1` |
| Model | `meta/llama-3.1-8b-instruct` |
| SDK | OpenAI SDK v4.x |
| Authentication | Bearer token from `NIM_API_KEY` |
| Streaming | Enabled (token-by-token output) |
| Tool calling | Enabled (9 tools exposed) |

### Model Name Format

**Critical:** NIM model names use **dot notation**, not underscore:
- ✅ `meta/llama-3.1-8b-instruct` → HTTP 200
- ❌ `meta/llama-3_1-8b-instruct` → HTTP 404

### API Request Flow

```
1. Build messages array (system + memory + conversation + tool results)
2. POST /v1/chat/completions with:
   - model: "meta/llama-3.1-8b-instruct"
   - messages: [...]
   - tools: [file:read, file:write, ..., git:log]
   - tool_choice: "auto"
   - stream: true
3. Parse streaming chunks:
   - text content → render to UI
   - tool_calls → execute tools, feed results back
4. Repeat until final response
```

---

## File Structure (Backend Layer)

```
src/
├── main.ts              # CLI Orchestrator / REPL event loop
├── llm/
│  ├── client.ts         # NIM API client (OpenAI SDK wrapper)
│  ├── models.ts         # Model configuration and merging
│  └── tools.ts          # Tool definitions (OpenAI function schemas)
├── tools/
│  └── index.ts          # Tool executor — routes calls to implementations
├── ui/
│  ├── screen.ts         # Terminal layout, scroll region, input box
│  └── index.ts          # Chalk styling, markdown rendering, diff viewer
├── memory/
│  └── index.ts          # MEMORY.md load/append operations
├── types/
│  └── index.ts          # TypeScript interfaces (ToolResult, Session, etc.)
└── utils/
   ├── config.ts         # Environment variable loading
   └── ansi.ts           # ANSI escape sequence helpers
```

---

## Summary

Agent-Termo's backend is a **tool execution layer** for a CLI-based AI coding agent. The LLM (via Nvidia NIM) drives all actions by calling 9 defined tools through OpenAI function calling. Session state is ephemeral; persistence is via `docs/MEMORY.md` and `docs/TIMELINE.md`. Security is enforced through path validation, command whitelisting, timeouts, and secret management. No server component exists — everything runs locally in the terminal.

---

*Generated by backend-architecture-designer — 2026-11-16*