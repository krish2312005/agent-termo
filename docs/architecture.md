# Agent-Termo Architecture

**Project:** Agent-Termo — Terminal-Based AI Coding Agent  
**Version:** 1.1  
**Status:** FINAL  
**Date:** 2026-11-16

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [High-Level Architecture](#high-level-architecture)
4. [Component Architecture](#component-architecture)
5. [Data Flow](#data-flow)
6. [Technology Stack](#technology-stack)
7. [CLI Layer](#cli-layer)
8. [Terminal UI Layer](#terminal-ui-layer)
9. [LLM Integration Layer](#llm-integration-layer)
10. [Agent System](#agent-system)
11. [Tool System](#tool-system)
12. [Memory & Timeline System](#memory--timeline-system)
13. [Security Architecture](#security-architecture)
14. [Build & Distribution](#build--distribution)
15. [Directory Structure](#directory-structure)
16. [Configuration](#configuration)
17. [Error Handling](#error-handling)
18. [Performance Characteristics](#performance-characteristics)
19. [Testing Strategy](#testing-strategy)
20. [Development Workflow](#development-workflow)
21. [Related Documentation](#related-documentation)

---

## Executive Summary

Agent-Termo is a terminal-based AI coding agent tool that replicates the Claude Code experience. It runs as an interactive CLI application with a full-screen terminal UI (TUI), uses Nvidia NIM APIs (free tier, OpenAI-compatible) as the LLM backend, and implements a 12-agent orchestration system to create complete software autonomously through tool use.

**Key Characteristics:**
- **Type:** CLI Tool (Internal Developer Tool)
- **LLM Backend:** Nvidia NIM API (OpenAI-compatible, free tier)
- **Target Users:** Software developers who want AI-assisted coding in terminal
- **Team Size:** 1 developer
- **Budget:** Bootstrap ($0 infrastructure)
- **Timeline:** MVP in 2-4 weeks
- **Geographic Scope:** Global (cross-platform: Windows, macOS, Linux)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENT-TERMO SYSTEM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   USER       │───▶│   CLI LAYER  │───▶│   TUI LAYER  │                  │
│  │   (stdin)    │    │  (commander) │    │   (blessed)  │                  │
│  └──────────────┘    └──────┬───────┘    └──────┬───────┘                  │
│                             │                   │                          │
│                             ▼                   ▼                          │
│                    ┌─────────────────────────────────────┐                 │
│                    │         MAIN ORCHESTRATOR            │                 │
│                    │         (src/main.ts)                │                 │
│                    │  • REPL event loop                   │                 │
│                    │  • Session management                │                 │
│                    │  • Agent switching                   │                 │
│                    └──────────────┬──────────────────────┘                 │
│                                   │                                        │
│              ┌────────────────────┼────────────────────┐                   │
│              │                    │                    │                   │
│              ▼                    ▼                    ▼                   │
│     ┌───────────────┐   ┌──────────────┐   ┌──────────────┐               │
│     │   LLM CLIENT  │   │  AGENT       │   │   TOOL       │               │
│     │   (OpenAI SDK │   │  REGISTRY    │   │  EXECUTOR    │               │
│     │    + NIM API) │   │              │   │              │               │
│     │  • Streaming  │   │  • 12 agents │   │  • 9 tools   │               │
│     │  • Tool calls │   │  • Prompts   │   │  • File IO   │               │
│     │  • Functions  │   │  • Context   │   │  • Bash/Git  │               │
│     └───────┬───────┘   └──────────────┘   └──────┬───────┘               │
│             │                                    │                          │
│             └────────────────────┬───────────────┘                          │
│                                  ▼                                            │
│                    ┌─────────────────────┐                                   │
│                    │   MEMORY SYSTEM     │                                   │
│                    │   (MEMORY.md)       │                                   │
│                    │   (TIMELINE.md)     │                                   │
│                    └─────────────────────┘                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## High-Level Architecture

### Architectural Pattern

Agent-Termo follows a **layered architecture** with clear separation of concerns:

| Layer | Responsibility | Key Files |
|-------|---------------|-----------|
| **CLI Layer** | Argument parsing, entry point, process lifecycle | `src/cli.ts`, `src/main.ts` |
| **TUI Layer** | Terminal UI rendering, input handling, output display | `src/ui/screen.ts`, `src/ui/index.ts` |
| **LLM Layer** | Nvidia NIM API integration, streaming, tool calling | `src/llm/client.ts`, `src/llm/tools.ts` |
| **Agent Layer** | Agent registry, prompt loading, context management | `src/agents/index.ts` |
| **Tool Layer** | File IO, bash execution, git operations | `src/tools/index.ts` |
| **Memory Layer** | Project memory, timeline persistence | `src/memory/index.ts` |

### Design Principles

1. **CLI-first:** No web server, no database, no external dependencies beyond NIM API
2. **Tool-driven:** All AI actions go through explicit tool calls (function calling)
3. **File-based memory:** Memory and timeline stored as markdown files (git-friendly)
4. **Streaming-first:** LLM responses stream in real-time for responsive UX
5. **Sandboxed execution:** Bash commands whitelisted, paths validated, timeouts enforced
6. **Cross-platform:** Works on Windows, macOS, Linux

---

## Component Architecture

### 1. CLI Layer (`src/cli.ts`, `src/main.ts`)

**`src/cli.ts`** — Commander.js entry point:
- Parses `--help`, `--version`, `--info` flags
- Validates environment variables on startup
- Launches REPL mode by default
- Handles process exit codes (0, 1, 2, 130)

**`src/main.ts`** — Main orchestrator:
- REPL event loop (read → process → stream → repeat)
- Session state management (UUID, project root, messages, current agent)
- System prompt construction from memory + timeline
- Agent switching logic
- Error recovery and retry logic

### 2. Terminal UI Layer (`src/ui/`)

**`src/ui/screen.ts`** — Blessed screen initialization:
- Full-screen layout with header, main content, input area
- DECSTBM scroll region for output scrolling
- Pinned input box at bottom
- Keyboard input handling (Ctrl+C, Ctrl+D, Ctrl+L, Ctrl+R, arrow keys)

**`src/ui/index.ts`** — UI rendering:
- Chalk-based styling (colors, bold, dim)
- Markdown-to-ANSI conversion via `marked`
- Message bubble rendering (user, assistant, agent badges)
- Code block rendering with syntax highlighting
- Spinner and progress indicators
- Error box rendering

### 3. LLM Integration Layer (`src/llm/`)

**`src/llm/client.ts`** — NIM client:
- OpenAI SDK configured with NIM baseURL
- Streaming response handler
- Tool call extraction and execution
- Retry logic with exponential backoff
- Token usage tracking

**`src/llm/tools.ts`** — Tool definitions:
- OpenAI function-calling schema for all 9 tools
- Parameter validation with zod
- Return type definitions

### 4. Agent System (`src/agents/`)

**`src/agents/index.ts`** — Agent registry:
- Loads prompts from `.claude/agents/*.md` at runtime
- Manages 12 agents: project-manager, tech-stack-expert, uiux-designer, backend-architecture-designer, frontend-planner, frontend-expert, backend-expert, security-expert, test-agent, git-manager, deployment-expert, dev-environment-initiator
- Agent switching and context injection
- Prompt template rendering

### 5. Tool System (`src/tools/`)

**`src/tools/index.ts`** — Tool executor:
- Routes tool calls to implementations
- 9 tools: file:read, file:write, file:edit, file:glob, grep, bash:execute, git:status, git:commit, git:push, git:log
- Path validation (prevents traversal outside project root)
- Bash sandbox (command whitelist, timeout, dangerous command detection)
- Terminal hooks for streaming bash output to UI

### 6. Memory & Timeline System (`src/memory/`)

**`src/memory/index.ts`** — Memory runtime:
- Loads `docs/MEMORY.md` at startup
- Appends entries when significant decisions are made
- Loads `docs/TIMELINE.md` for chronological history
- Append-only timeline logging

---

## Data Flow

### REPL Event Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                      REPL EVENT LOOP                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [1] Display welcome banner (first run only)                   │
│  [2] Load MEMORY.md into context                                │
│  [3] Display prompt ">" in purple                               │
│  [4] Read user input from stdin                                 │
│  [5] Add user message to conversation                           │
│  [6] Build prompt (system + memory + conversation)              │
│  [7] Stream LLM response (show text as it arrives)              │
│  [8] If tool_call: execute tool → inject result → [7]           │
│  [9] Display agent badge if agent switches                      │
│  [10] On completion: display prompt → [4]                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Tool Execution Flow

```
User Input
    │
    ▼
LLM Client (OpenAI SDK)
    │
    ├─▶ Text response → Stream to TUI
    │
    └─▶ Tool call → Tool Executor
              │
              ├─▶ Validate path/command
              ├─▶ Execute (file IO / bash / git)
              ├─▶ Return ToolResult (success/error)
              │
              ▼
LLM Client receives tool result
    │
    ▼
Stream updated response to TUI
    │
    ▼
Update MEMORY.md and TIMELINE.md
    │
    ▼
Return to REPL prompt
```

### Message Rendering Flow

```
LLM Response Chunk
    │
    ▼
Accumulate into buffer
    │
    ▼
Parse markdown (marked)
    │
    ▼
Convert to ANSI escape sequences
    │
    ▼
Render in blessed output box
    │
    ▼
Auto-scroll to bottom
```

---

## Technology Stack

### Core Stack

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **Language** | TypeScript | 5.x | Type safety, IDE support, mirrors Claude Code approach |
| **Runtime** | Node.js | 20.x LTS | Stable, cross-platform, massive ecosystem |
| **Package Manager** | npm | 10.x | Standard for Node.js, works globally with npm install -g |

### CLI/Terminal UI

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **TUI Framework** | blessed | 0.1.10 | Mature, cross-platform, complex widget system |
| **Color Output** | chalk | 5.x | Simple, chainable API |
| **Markdown Rendering** | marked | 12.x | Fast, extensible, renders markdown to ANSI |

### LLM Integration

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **API Client** | OpenAI SDK | 4.x | Official, handles streaming, tool calls, retries |
| **API Compatibility** | OpenAI-compatible | N/A | Nvidia NIM uses OpenAI API format |

### Agent System

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **Agent Prompts** | Claude.md format | N/A | Loads from .claude/agents/*.md |
| **Memory System** | Markdown files | docs/MEMORY.md | Filesystem-based, simple, git-friendly |
| **Timeline System** | Markdown files | docs/TIMELINE.md | Append-only history log |
| **Validation** | zod | 3.x | Runtime type checking |

### Build & Distribution

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **TypeScript Runner** | tsx | 4.x | Fast TypeScript execution |
| **Bundler** | esbuild | 0.21.x | Fastest bundler, small bundles |
| **Binary Packager** | pkg | 5.x | Standalone .exe/.app binaries |
| **Testing** | vitest | 1.x | Fast, Vite-based |
| **Lint** | eslint + typescript-eslint | 9.x, 8.x | Code quality |

### Infrastructure

| Category | Technology | Status |
|----------|-----------|--------|
| **LLM API** | Nvidia NIM (OpenAI-compatible) | DECIDED |
| **CI/CD** | GitHub Actions | DECIDED |
| **Distribution** | npm + pkg binaries | DECIDED |

---

## CLI Layer

### Entry Point (`src/cli.ts`)

```typescript
// Commander.js-based CLI
// Flags: --help, --version, --info
// Default: REPL mode
```

### Commands

| Command | Description |
|---------|-------------|
| `agent-termo` | Start interactive REPL |
| `agent-termo --help` | Display command reference |
| `agent-termo --version` | Display version (1.0.0) |
| `agent-termo --info` | Environment diagnostics |

### REPL Interaction Commands

| Command | Description |
|---------|-------------|
| `exit` / `quit` | Exit the REPL |
| `Ctrl+C` | Cancel current operation |
| `Ctrl+D` | Exit (EOF) |
| `Ctrl+L` | Clear screen |
| `Ctrl+R` | Reverse-i-search history |
| `!!` | Repeat last command |

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `NIM_API_KEY` | Yes | — | Nvidia NIM authentication |
| `NIM_BASE_URL` | No | `https://integrate.api.nvidia.com/v1` | API endpoint |
| `NIM_MODEL` | No | `meta/llama-3.1-8b-instruct` | Model selection |
| `LOG_LEVEL` | No | `info` | Logging verbosity |
| `AGENT_TERMO_DIR` | No | `.claude` | Agent prompt directory |
| `AGENT_TERMO_DOCS` | No | `docs` | Project docs directory |
| `CONFIRM_DESTRUCTIVE` | No | `true` | Ask before destructive ops |
| `ALLOWED_COMMANDS` | No | `git,npm,node,...` | Bash command whitelist |
| `LLM_TIMEOUT` | No | `120000` | API timeout in ms |
| `BASH_TIMEOUT` | No | `300000` | Bash command timeout in ms |

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Clean exit |
| `1` | General error |
| `2` | Invalid arguments / --help |
| `130` | Interrupted (Ctrl+C) |

---

## Terminal UI Layer

### Screen Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌─ Agent-Termo ──────────────────────────────────────────────────┐ │
│ │ [logo] Agent-Termo v1.0.0                      [STATUS: READY] │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │                                                                  │ │
│ │  [scrollable message area - chat history]                       │ │
│ │                                                                  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌─ Input ──────────────────────────────────────────────────────────┐ │
│ │ > █                                                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌─ Status ────────────────────────────────────────────────────────┐ │
│ │ Agents: 12 │ Memory: 2.3MB │ Uptime: 00:15:32                   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Color System (ANSI 256)

| Token | Hex | ANSI Code | Usage |
|-------|-----|-----------|-------|
| `primary` | #7C3AED | 93 | Agent messages, highlights |
| `success` | #22C55E | 82 | User messages, success |
| `warning` | #F59E0B | 214 | Warnings, caution |
| `error` | #EF4444 | 196 | Error messages |
| `info` | #3B82F6 | 75 | Informational messages |
| `background` | #0F172A | 17 | Main terminal background |
| `surface` | #1E293B | 59 | Code blocks, elevated surfaces |
| `text` | #F8FAFC | 255 | Primary text |
| `muted` | #94A3B8 | 145 | Secondary text, labels |
| `border` | #475569 | 59 | Dividers, borders |

### Components

- **MessageBubble:** User and AI conversation messages with role badges, timestamps, durations
- **CodeBlock:** Syntax-highlighted code with language labels, line numbers, copy button
- **InlineCode:** Inline code highlighting within text
- **Spinner:** Loading indicators (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ cycle)
- **ProgressBar:** Completion percentage for long operations
- **AgentBadge:** Active agent identification with per-agent colors
- **ErrorBox:** Error messages with clear visual distinction
- **InputPrompt:** Command line input area with blinking cursor
- **Divider:** Visual separation between sections
- **Table:** Structured tabular data display

### Markdown Rendering Rules

| Markdown | Terminal Output |
|----------|----------------|
| `**text**` | Bold (chalk.bold) |
| `*text*` | Dim (chalk.dim) |
| `` `code` `` | Gray background chip |
| ` ```lang` code ` ``` ` | Syntax-highlighted code box |
| `[link](url)` | `[link]` in blue |
| `# Heading` | Bright purple, bold |
| `> quote` | Dimmed, prefixed with `│` |
| `- item` | Bullet list with `•` |
| `---` | Divider line |

---

## LLM Integration Layer

### Client Configuration

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NIM_API_KEY,
});
```

### Model Configuration

- **Default Model:** `meta/llama-3.1-8b-instruct` (dot notation REQUIRED)
- **Alternative:** `meta/llama-3.1-70b-instruct` (dot notation)
- **Format:** DOT notation works (`3.1`), underscore returns 404 (`3_1`)
- **Prefix format NOT available:** `nvidia_nim/moonshotai/...` returns 404

### Streaming

- OpenAI SDK streaming with `stream: true`
- Content extracted per chunk and written to blessed output box
- Markdown rendering per complete paragraph (not per character)

### Tool Calling

- Tools exposed as OpenAI function-calling schema
- LLM decides which tool to call with parameters
- Tool results injected back into conversation
- No tool failure crashes the session

---

## Agent System

### 12 Agents

| Agent | Responsibility |
|-------|---------------|
| project-manager | Entry point, coordinates all other agents |
| tech-stack-expert | Technology selection and documentation |
| uiux-designer | Visual design system and TUI specification |
| backend-architecture-designer | API and database specification |
| frontend-planner | CLI behavior and route specification |
| frontend-expert | TUI implementation and components |
| backend-expert | LLM integration and tool implementations |
| security-expert | Security audit and vulnerability assessment |
| test-agent | Test suite creation and validation |
| git-manager | Git commits and repository management |
| deployment-expert | CI/CD pipeline and production deployment |
| dev-environment-initiator | Development environment setup |

### Agent Prompt Loading

- Prompts loaded from `.claude/agents/*.md` at runtime
- Each agent has a dedicated `.md` prompt file
- System prompt constructed from active agent + memory + timeline
- Agent switching injects new system prompt

---

## Tool System

### 9 Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `file:read` | Read file contents | path, limit, offset |
| `file:write` | Write/overwrite file | path, content |
| `file:edit` | Edit file (find/replace) | path, old_string, new_string |
| `file:glob` | List files matching pattern | pattern, cwd |
| `grep` | Search text in files | pattern, path, glob, case_sensitive |
| `bash:execute` | Execute shell command | command, cwd, timeout |
| `git:status` | Git working tree status | cwd |
| `git:commit` | Commit staged changes | message, cwd |
| `git:push` | Push to remote | cwd |
| `git:log` | Show commit history | cwd, limit |

### Tool Result Interface

```typescript
interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}
```

### Security Constraints

- **Path validation:** All file operations constrained to project root
- **Bash sandbox:** Command whitelist via `ALLOWED_COMMANDS`
- **Timeout:** Bash commands timeout after `BASH_TIMEOUT` ms (default 300000)
- **Dangerous command detection:** `rm -rf`, `dd`, `> /dev/sda` require confirmation
- **No API key logging:** Never print NIM_API_KEY value

---

## Memory & Timeline System

### Memory (`docs/MEMORY.md`)

- **Purpose:** Project context, historical decisions, team context, past issues
- **Load:** Read at startup, inject into system prompt
- **Update:** Append entries when significant decisions are made
- **Format:** Markdown with dated sections per agent activity

### Timeline (`docs/TIMELINE.md`)

- **Purpose:** Chronological project history
- **Format:** Append-only log
- **Entries:** Tool execution, agent switches, milestones, errors/warnings
- **Never deleted:** Historical context preserved

### Memory Runtime (`src/memory/index.ts`)

```typescript
async function loadMemory(root: string): Promise<string>
async function appendToMemory(root: string, entry: string): Promise<void>
async function loadTimeline(root: string): Promise<string>
async function appendToTimeline(root: string, entry: string): Promise<void>
```

---

## Security Architecture

### Defensive (Protecting Agent-Termo)

1. **Bash Execution Sandbox:**
   - Whitelist allowed commands (git, npm, node, pnpm, yarn, tsx, tsc)
   - Configurable via `ALLOWED_COMMANDS` env var
   - Timeout on long-running commands (default: 5 minutes)

2. **Path Validation:**
   - Prevent path traversal (no `..` in paths)
   - Restrict operations to project directory
   - Validate paths against `process.cwd()`

3. **Secrets Management:**
   - API key from `NIM_API_KEY` environment variable
   - Never log API keys
   - `.env` file excluded from git

### Offensive (Generated Code Awareness)

1. **Dangerous Operation Warnings:**
   - Detect `rm -rf`, `git push --force`
   - Warn before destructive operations
   - Require confirmation for deletions

2. **User Confirmation:**
   - Before executing bash commands
   - Before overwriting files
   - Before git push operations

---

## Build & Distribution

### Build Pipeline

```
tsc (type check) → esbuild (bundle) → pkg (binary) → npm publish
```

### Build Commands

```bash
npm run build        # esbuild bundle to dist/
npm run build:tsc    # TypeScript type-check only
npm run build:pkg    # Self-contained binaries (.exe etc)
npm run dev          # tsx watch — live reload
```

### Distribution

| Method | Command | Output |
|--------|---------|--------|
| npm install -g | `npm install -g agent-termo` | CLI available globally |
| Development | `git clone` + `npm install` + `npm link` | From source |
| Binary (Windows) | `pkg` | `agent-termo-win.exe` |
| Binary (macOS) | `pkg` | `agent-termo-macos` |
| Binary (Linux) | `pkg` | `agent-termo-linux` |

### package.json Configuration

```json
{
  "name": "agent-termo",
  "version": "1.0.0",
  "bin": { "agent-termo": "./dist/cli.js" },
  "preferGlobal": true
}
```

---

## Directory Structure

```
agent-termo/
├── src/
│   ├── cli.ts              # Commander entry point
│   ├── main.ts             # Main application logic / REPL
│   ├── ui/
│   │   ├── index.ts        # UI exports
│   │   ├── screen.ts       # Main blessed screen
│   │   ├── input.ts        # User input handling
│   │   ├── output.ts       # Streaming output renderer
│   │   └── markdown.ts     # Markdown to ANSI renderer
│   ├── agents/
│   │   ├── index.ts        # Agent loader and registry
│   │   ├── project-manager.ts
│   │   ├── tech-stack-expert.ts
│   │   ├── backend-expert.ts
│   │   ├── frontend-expert.ts
│   │   └── ... (12 agents total)
│   ├── llm/
│   │   ├── index.ts        # LLM exports
│   │   ├── client.ts       # OpenAI/NIM client
│   │   ├── streaming.ts    # Streaming response handler
│   │   └── tools.ts        # Tool definitions for function calling
│   ├── tools/
│   │   ├── index.ts        # Tool exports
│   │   ├── read.ts         # File reading tool
│   │   ├── write.ts        # File writing tool
│   │   ├── edit.ts         # File editing tool
│   │   ├── glob.ts         # File search tool
│   │   ├── grep.ts         # Text search tool
│   │   ├── bash.ts         # Bash execution tool
│   │   └── git.ts          # Git operations tool
│   ├── memory/
│   │   ├── index.ts        # Memory system
│   │   ├── memory.ts       # Memory read/write
│   │   └── timeline.ts     # Timeline append
│   ├── types/
│   │   └── index.ts        # Shared TypeScript types
│   └── utils/
│       ├── index.ts        # Utils exports
│       ├── config.ts       # Config management
│       └── logger.ts       # Logging utility
├── .claude/
│   └── agents/             # Agent prompts (runtime loads these)
│       ├── project-manager.md
│       ├── tech-stack-expert.md
│       └── ...
├── tests/
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── e2e/                # E2E tests
├── scripts/
│   ├── build.mjs           # Build script (esbuild + pkg)
│   └── test-nim.mjs        # NIM API validation script
├── docs/                   # Project documentation
│   ├── architecture.md     # This file
│   ├── TECH_STACK.md       # Technology decisions
│   ├── DESIGN_SYSTEM.md    # Visual design specification
│   ├── BACKEND_ARCHITECTURE.md  # Backend/API specification
│   ├── FRONTEND_ARCHITECTURE.md # CLI/TUI behavior spec
│   ├── ROUTE_MAP.md        # CLI command reference
│   ├── DEV_SETUP.md        # Developer setup guide
│   ├── MEMORY.md           # Project memory
│   ├── TIMELINE.md         # Project timeline
│   └── PROJECT_PROGRESS.md # Implementation roadmap
├── dist/                   # Compiled JS output (gitignored)
├── .env                    # Local config (gitignored)
├── .env.example            # Environment template
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.test.json
├── vitest.config.ts
├── eslint.config.mjs
└── README.md
```

---

## Configuration

### `.env.example`

```env
NIM_API_KEY=nvapi-YOUR_KEY_HERE
NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NIM_MODEL=meta/llama-3.1-8b-instruct
LOG_LEVEL=info
AGENT_TERMO_DIR=.claude
AGENT_TERMO_DOCS=docs
CONFIRM_DESTRUCTIVE=true
ALLOWED_COMMANDS=git,npm,node,pnpm,yarn,tsx,tsc
LLM_TIMEOUT=120000
BASH_TIMEOUT=300000
```

### `tsconfig.json`

TypeScript strict mode configured for all `src/` files.

---

## Error Handling

### Tool Result Pattern

All tools return `ToolResult`:
```typescript
interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}
```

### Error Categories

| Error | Behavior |
|-------|----------|
| NIM API unreachable | Retry 3x with backoff, then show error + prompt |
| Invalid API key | Clear error message + exit |
| Tool permission denied | Show error with hint, continue session |
| Tool timeout | Show timeout error + hint |
| Rate limit | Wait and retry with message |
| Unknown error | Show error + stack trace (if DEBUG=true) |

### Error Output Format

```
[ERROR] Tool 'file:read' failed: path is required
```

Authentication errors:
```
[ERROR] NIM API authentication failed (HTTP 401). Check NIM_API_KEY in .env
```

---

## Performance Characteristics

### Expected Metrics

| Metric | Target |
|--------|--------|
| Startup time | <2 seconds |
| LLM latency | 100-500ms per token |
| UI responsiveness | <50ms for typing input |
| File operations | <100ms for typical files |
| Memory usage | <200MB |

### Optimization Strategies

- Lazy load agent prompts (only when needed)
- Stream LLM responses as they arrive
- Batch file operations where possible
- Use incremental parsing for large files
- Cache directory listings

---

## Testing Strategy

### Unit Tests (vitest)

- Agent prompt parsing
- Tool implementations
- Config management
- Utility functions

### Integration Tests

- LLM client with mock server
- File system operations
- Memory/timeline persistence

### Manual Testing

- Full CLI interaction test
- Terminal rendering test
- Cross-platform test (Windows, macOS, Linux)

### Current Test Status

| File | Coverage | Status |
|------|----------|--------|
| tests/integration/basic.test.ts | file:read, file:glob, bash:execute, git:status, unknown tool | 10/10 PASS |

---

## Development Workflow

### Phase 1: CLI Foundation (Days 1-3)

1. Set up project scaffold with TypeScript
2. Implement blessed TUI with basic layout
3. Add chalk styling and marked markdown
4. Create simple readline input
5. Test basic "Hello World" interaction

### Phase 2: LLM Integration (Days 4-6)

1. Integrate OpenAI SDK with NIM endpoint
2. Implement streaming responses
3. Create basic conversation loop
4. Add system prompt from CLAUDE.md

### Phase 3: Agent System (Days 7-14)

1. Load agent prompts from .claude/agents/
2. Implement tool-based actions
3. Build agent registry
4. Test single agent invocation
5. Test multi-agent orchestration

### Phase 4: Full Implementation (Days 15-28)

1. Implement all 12 agents
2. Build tool system (file IO, bash, git)
3. Implement memory/timeline runtime
4. Add error handling and recovery
5. Polish TUI (dark theme, syntax highlighting)

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| `docs/TECH_STACK.md` | Complete technology decisions and rationale |
| `docs/DESIGN_SYSTEM.md` | Visual design specification for TUI |
| `docs/BACKEND_ARCHITECTURE.md` | Backend/API specification and tool definitions |
| `docs/FRONTEND_ARCHITECTURE.md` | CLI/TUI behavior specification |
| `docs/ROUTE_MAP.md` | CLI command reference |
| `docs/DEV_SETUP.md` | Developer setup guide |
| `docs/MEMORY.md` | Project memory and context |
| `docs/TIMELINE.md` | Chronological project history |
| `docs/PROJECT_PROGRESS.md` | Implementation roadmap and status |
| `CLAUDE.md` | Full agent system specification |

---

*Architecture Document v1.1 — Agent-Termo Terminal AI Coding Agent*