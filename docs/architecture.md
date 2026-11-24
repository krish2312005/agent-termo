# Agent-Termo Architecture

**Project:** Agent-Termo — Terminal-Based AI Coding Agent  
**Version:** 1.2  
**Status:** LIVING  
**Date:** 2026-11-23

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
21. [Multi-agent Workspace](#multi-agent-workspace)
22. [Related Documentation](#related-documentation)

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

## Multi-agent Workspace

**Status:** specified 2026-11-23 (Phase 1 investigation + Phase 2 design). No product code exists for this section yet. Verified against working tree at `6a02c44`.

This section is the implementation contract for Claude Code-style sub-agent navigation in the live runtime (`src/main.ts` + `src/ui/tui.tsx`). It is authoritative for backend-expert (runtime) and frontend-expert (UI); test-agent uses §21.9. Do not implement a second agent runtime, and do not treat agent names as identifiers.

### 21.1 Verified current state (what already exists)

| Concern | Current reality (verified) | Consequence for this feature |
|---|---|---|
| Main runtime | `runRepl` in `src/main.ts` owns exactly one `conversation: ConversationMessage[]`, one `NimClient`, one `InputController`, one `session` (`StoredSession`). | "main" is a real single agent session. Its transcript is the TUI `entries` log. |
| Delegation | `runDelegatedAgent` (`src/main.ts`) resolves `.claude/agents/*.md`, calls `spawnSubAgent(toolCall.id, agent.name, task, 0)`, creates a fresh `NimClient`, a local `delegatedMessages` array, runs a 10-minute bounded tool loop, then returns one `ToolResult` to the parent. | Delegation is one-shot. There is no stored session, no follow-up path, and `delegatedMessages` is garbage-collected on return. |
| Nested delegation | `filterAgentTools(..., allowDelegation=false)` removes `agent:delegate` from every sub-agent. | Only `main -> sub-agent` depth exists. The tree must be generic, but nesting must not be enabled by this feature. |
| Registry | `src/runtime/subagents.ts`: in-memory `Map<string, SubAgentActivity>`, stable per-spawn `id`, `runId`, agent name, task, status (`running\|waiting\|completed\|failed\|cancelled`), activity, step/budget, timestamps, last 40 tools, last 40 progress lines, output/error. Listeners are error-isolated. `beginSubAgentRun()` scopes the live monitor to the current user turn. | Reusable lifecycle/observability data source. Missing: parent link, per-agent usage, queue count, resume transition, full transcript. |
| Typed events | `src/runtime/events.ts`: `AgentEventHub` + flat `AgentEvent` union (`turn.*`, `tool.*`, `usage.updated`, `context.updated`). The hub is created per `runToolLoop` and is not reachable by the UI. | It cannot carry cross-agent or background transcript data. It is not extended here. |
| Main transcript | `src/ui/tui.tsx` global `entries` signal; all `print*` helpers append to it. `MarkdownPrinter` streams assistant text into one entry. Tool calls, terminal output, diffs, errors and completion all render here. | This already is main's complete conversation/activity. Keep it and switch it in/out by selection; do not duplicate it. |
| Sub-agent presentation | `runDelegatedAgent` calls `addSubAgentProgress` (one line, 400 chars) and `start/endSubAgentTool` (one line, 240 chars). `executeToolWithReview` prints every sub-agent tool call/result to the global main log. `src/ui/subagent-view.ts` is chalk-based and only used by `/subagents`. | Sub-agents have no complete transcript, and their tool output currently leaks into main's log. Both must change. |
| Input | `createInput().question()` resolves the REPL prompt; it is only pending while the REPL waits for input. During a run the textarea is unfocused (`inputActive=false`). Approval prompts call `input.close()` then take over keys via `listenKeys`, then `input.showPrompt()`; `src/runtime/approval-queue.ts` serializes prompts. | A persistent composer needs: focus during runs, routing by selected agent, suspension (not closing) for approvals. `close()` must not be used for background approvals because it resolves a pending main question with `''`. |
| Keyboard | `useKeyboard` in `src/ui/tui.tsx`: secret -> approval-style pickers -> completion -> history -> `dispatchKey` (cancellation listeners, prompts) -> Ctrl+O/T/K/C. `withEscapeCancellation` registers Escape/Ctrl+C listeners for the duration of a model request. | All existing behavior must be preserved; navigator keys must run before `dispatchKey` so navigation never cancels. |
| Scroll | One `scrollbox` with unconditional `stickyScroll` at the bottom. `ScrollBoxRenderable` exposes `scrollTop`, `scrollHeight`, `viewport.height`, `scrollTo()`, `afterLayout()`. | Per-agent scroll positions and conditional tail-follow are implementable without new dependencies. |
| Baseline | `bun run typecheck` exit 0; `bun run test` 275 passed / 2 skipped (38 files passed, 1 skipped); `bun run build` clean. | Any change must keep these green. |

### 21.2 Decisions

#### D1. Identity and hierarchy

- One identity namespace. `main` has the reserved stable id `"main"` (`MAIN_AGENT_ID`). Every sub-agent instance keeps the id returned by `spawnSubAgent` for its whole life, including follow-up turns. Names are display labels only; the UI must never look up or route by name.
- Represent parent-child edges explicitly: `SubAgentActivity.parentId`. Today every spawn is a direct child of `main`; the tree builder still uses `parentId`/`depth` so a future nesting change needs no UI rewrite.
- **Do not enable nesting.** `filterAgentTools` stays unchanged and sub-agents remain unable to call `agent:delegate`. Depth is 1 below main today.
- **Deviation from the illustrative example:** `main > project-manager > frontend-expert` is not truthful in this runtime. `project-manager` is not a separate runtime parent; it is either the main agent's prompt (selected with `/agent`) or a one-shot delegated agent that cannot delegate. Render `main · project-manager` on the main row when that prompt is active, and render `frontend-expert` as a direct child of main. Do not create a fake `project-manager` node.
- Status vocabulary exposed to the UI: `idle | running | waiting | completed | failed | stopped`. `cancelled` maps to `stopped`. Main is only ever `idle | running | waiting` (after a failed turn the REPL is idle again; the error remains in its transcript). There is no runtime "Thinking" signal, so the UI must not fabricate one; `running` plus the real `activity` text is the working indicator.
- Status source of truth: `SubAgentActivity.status` for sub-agents; `MainAgentState.status` for main. The tree is always derived, never stored.

#### D2. Transcript ownership and event contract

Three owners, one writer each; no duplicated transcript:

1. **Main transcript** = the existing `entries` signal/`appendLog` path in `src/ui/tui.tsx`. It already records user messages, streamed assistant markdown, tool calls/results, terminal output, diffs, errors and completion. It is retained across workspace switches. No new main transcript store.
2. **Sub-agent transcripts** = new `src/runtime/agent-transcript.ts`, keyed by agent id, append-only for the session, bounded. Every sub-agent event is recorded there by the runtime before/after the corresponding action. It supports late subscribers by exposing a snapshot read, so mounting or switching the UI never misses history.
3. **Lifecycle/activity** = `src/runtime/subagents.ts` (extended). Used for navigator status/metadata; it does not store conversation text.

`AgentEventHub` is **not extended**. Rationale: it is run-local (created inside `runToolLoop`), has no replay or late-subscriber snapshot, and carries no transcript text; threading it through every delegated turn would add coupling without giving the UI history when it switches agents. Existing six events and `tests/unit/events.test.ts` stay unchanged.

Transcript content rules (never invented):

- The initial user entry is the delegated `task` plus the optional `context` supplied by the parent; the full system-prompt wrapper is not displayed.
- Follow-up user entries are the exact submitted text.
- Assistant entries are the streamed model text (the same `onChunk` stream), finalized with the authoritative final content.
- Tool entries record name + meaningful args summary and, on completion, the full result/error up to the cap. `bash:execute` records the command and its stdout/stderr; file tools record the path, applied/rejected state and diff stats; other tools record output/error.
- Lifecycle status entries are recorded only for transitions: spawned/running, waiting for approval, resumed, completed, failed, stopped. Per-iteration "waiting for the model" strings stay in the registry `activity`, not the transcript.
- Errors are recorded as `error` entries and also set the failed status.
- Caps: 500 entries and 256 KiB of text per agent; per-entry text cap 8,000 chars; tool result cap 8,000 chars. When a cap is hit, the oldest entries are dropped and a single `truncated` entry is kept stating that older activity was dropped. Transcripts are session-memory only (not persisted across restarts).

#### D3. Follow-up dispatch and lifecycle policy

Public API (single entry point used by the UI):

```ts
// src/runtime/agent-workspace.ts
export type AgentMessageResult =
  | { ok: true; disposition: 'dispatched' | 'queued'; queueLength: number }
  | { ok: false; reason: 'unknown_agent' | 'empty' | 'duplicate' | 'queue_full' | 'unavailable'; message: string };

export function sendAgentMessage(agentId: string, text: string): AgentMessageResult;
```

`sendAgentMessage` is synchronous: it decides and starts/resumes work, then returns; it never waits for a model turn. The UI can therefore update immediately. It routes strictly by stable id. Unknown id is always a rejection; it must never fall back to the parent or to the selected agent.

Disposition matrix (`decideMessageDisposition`, pure, exported for tests):

| Target state | Disposition | Behavior |
|---|---|---|
| `idle` (main only) | dispatch | If the REPL has a pending `question()`, resolve it with the text via `input.submitExternal(text)`; otherwise enqueue and drain at the next REPL loop top. |
| `running` | queue | Append to that agent's FIFO queue (max 10), show `queued N`; drained at the **end of the current turn** (safe point). Never inject into a running conversation mid-turn. |
| `waiting` (approval) | queue | Same queue; the pending approval must be answered first. Queued messages never answer approvals. |
| `completed` | dispatch | Append a user message to the same stored conversation and start a new turn on the same `NimClient`/messages array. No new agent record, no re-spawn. |
| `failed` | dispatch | Same as completed; history (including the failure) is preserved; status returns to running. |
| `stopped` (cancelled) | dispatch | Same as completed. Explicitly allowed by the spec: the conversation is preserved and resumable. |
| queue full (10) | reject | `@name already has 10 queued messages…` |
| duplicate | reject | Exact trimmed text already in this agent's queue, or dispatched to it within the last 2,000 ms. |
| empty | reject | UI normally suppresses; API returns `empty`. |
| unknown id | reject | `No agent with id "…" exists in this session.` Never redirect. |

Queueing waiting until the **turn boundary** is deliberate: it preserves parent semantics (the parent's `agent:delegate` ToolResult reflects only the initial turn), keeps assistant/tool message ordering valid, and avoids injecting user text between an assistant tool-call message and its tool results. The maximum wait is the existing 10-minute per-turn budget.

Main-agent messages while main is running are queued the same way; the REPL drains one queued message per loop iteration after the current turn returns. A queued main message is then processed by the normal turn path (it is echoed and persisted as a user message; it is not interleaved into the turn that was already running).

Follow-up turn mechanics:

- At `runRepl` startup, register main once: `registerMainAgent({ submitExternal: (text) => input.submitExternal(text), cancel: () => nimClient.cancelCurrentRequest() })`; initialize `setMainAgentState({ status: 'idle', activity: 'ready', usage: nimClient.getUsage() })`, then update `status`/`activity`/`goal`/`usage` at the turn boundaries listed in D4. `startedAt` and `queued` are workspace-owned.
- One `DelegatedAgentSession` per spawned sub-agent, stored in `src/main.ts`: `{ id, agent, task, parentId, client, messages, input, permissionMode, allowedCommands, projectRoot, queue, status, running, cancelRequested, startedAt, lastTurnEndedAt }`.
- Initial delegation: create the session, register the handle, run one turn, return the same `ToolResult` to the parent as today. If messages were queued during that turn, start a new turn asynchronously after the result is returned.
- Follow-up: append the user message(s) to `session.messages` (same array), set status running via `resumeSubAgent(id)`, record the user transcript entry, and run `runDelegatedTurn(session)` without blocking the UI. Reuses the same `NimClient`, model, agent definition, permission mode, allowed commands and project root.
- The turn runner has one `finally` drain: after any terminal status, if the session queue is non-empty it immediately starts the next turn on the same session. This closes the "message arrived just as the turn ended" race; the handle's status check plus the finally-drain must never drop or duplicate a queued message.
- Tool-call ids in the stored sub-agent conversation are namespaced per turn (`<turnSeq>-<modelCallId>`) in both the assistant `toolCalls` entry and the matching tool result, so a follow-up cannot collide with ids from an earlier turn. The registry/transcript `callId` uses the same namespaced value.
- The completion/evidence gate (`verifyCompletionWithChecks`) still runs every turn. Per-turn verification text is the original task for the initial turn, or the concatenated follow-up instruction(s) for a follow-up turn.
- `recordTaskAction` for follow-ups writes to a detached local `TaskState` (not the parent's); the parent's task state is never mutated by a follow-up.
- Checkpoints for follow-ups use a per-agent lazily created checkpoint (`createCheckpoint(projectRoot, 'Sub-agent <name>: <task>', 'automatic')`) instead of the parent's `ensureTaskCheckpoint` closure, which may no longer be valid.
- Follow-up results are visible in the sub-agent's workspace and conversation. They are **not** injected into the parent model's conversation automatically; the parent does not receive a new `ToolResult`.

#### D4. UI state boundaries, focus and keyboard

- Runtime state: registry + main state + session records (D1-D3).
- Navigation state: new `src/runtime/agent-selection.ts` holds the selected agent id and notifies subscribers. The UI is the only writer and validates with `reconcileSelection`; the runtime reads it only for cancellation scoping. Selection changes do not touch execution.
- Conversation rendering: main `entries` vs the selected agent's transcript snapshot (D2).
- Composer state: per-agent drafts (`Map<agentId, string>`), focus mode (`composer | navigator`), leader timeout, approval modal state, notices. Never carry a draft across agents silently.
- Focus rules:
  - Default focus is the composer. Typing, cursor keys, Tab completion and history behave exactly as today while the composer is focused.
  - `Ctrl+X` enters navigator focus (and arms the stop-all chord); it does not cancel anything. Entering navigator focus sets `inputActive=false` and blurs the textarea; it highlights the selected row. Enter/`Esc` at main restore `inputActive=true` and focus the composer.
  - Navigator: `↑`/`↓` move selection (clamped, no wrap) and switch the workspace immediately; `Enter` focuses the composer for that agent; `Esc` selects the parent (at main it focuses the composer).
  - `Ctrl+X` then `Ctrl+K` within the leader window (default 1,500 ms) calls `stopAllAgents()`. Any other key disarms the chord and is processed normally. Plain `Ctrl+K` keeps its existing terminal-stop meaning: it stops the running terminal when the navigator has focus, when the composer is focused with an empty draft, or when the prompt is inactive; with a non-empty draft it stays with the textarea (kill-line), exactly as today.
  - Navigator keys are handled and `preventDefault()`ed **before** `dispatchKey`, so navigating can never reach the Escape/Ctrl+C cancellation listeners or stop an agent.
  - Modals own the keyboard: approval prompt, picker, secret prompt. The navigator is frozen and the composer is visible but unfocused with an explicit banner naming the owner (`Approval required from @frontend-expert`). Keys are dispatched to the modal exactly as today.
- `Ctrl+C` while the composer is focused: keep existing copy/clear behavior. When the composer is empty, dispatch to the cancellation listeners if the selected agent is running/waiting; only emit SIGINT (quit) when nothing is running. This preserves cancel semantics that were previously reachable because the composer was unfocused during runs.
- Composer stays live during runs: `submitInput` must not set `inputActive=false` when it dispatches/queues to an agent; it clears the consumed draft and keeps focus. `createInput().question()` must not overwrite the textarea when the selected agent is not main (leave the sub-agent draft untouched and keep the pending main question pending). `createInput` gains three methods: `submitExternal(text): boolean` (resolve a pending `question()`; false when none), `suspend(): void` (blur, preserve draft and pending question), `resume(): void` (restore focus unless a modal is active). The existing minimal `InputController` used by `executeToolWithReview` gets `suspend?`/`resume?` as optional so current test stubs keep compiling.
- Per-agent drafts and `setNextInput`: `setNextInput` applies only when the selected agent is main; if a sub-agent is selected it is retained for the next main selection. Switching saves the current textarea text to the old agent's draft and loads the target's draft.
- Main state updates (all in `src/main.ts`): turn start -> `{ status:'running', activity:'working', goal: taskState.goal, activeAgentName }`; approval prompt -> `{ status:'waiting', activity:'waiting for your approval' }` then back to running; every model response -> `{ usage: nimClient.getUsage() }`; turn end (including failure/cancel) -> `{ status:'idle', activity:'ready', usage }` before the REPL awaits input again.
- Preserved shortcuts: `Ctrl+O`, `Ctrl+T`, `Tab`, `Shift+Enter`, history `↑/↓`, completion menu keys, picker keys, secret-entry keys, `/subagents`, approval Y/A/N, and `Ctrl+K` terminal stop (see nuance above). No existing binding is removed.
- `Ctrl+X Ctrl+K` does not exist today. It is added here as the deliberate stop-all; the example hint therefore becomes truthful. "Stop all" requests cancellation on every registered handle (main `NimClient.cancelCurrentRequest()` plus each live sub-agent), clears all queued messages, sets sub-agent status to stopped when their loops unwind, and reports `Stopped N agents.` It never kills an already-running tool call; that call finishes or hits its own timeout, and the loop stops before the next iteration.

Keyboard table:

| Context | Key | Action |
|---|---|---|
| Any (not modal/secret/picker) | `Ctrl+X` | Enter navigator focus; arm stop-all chord (1,500 ms) |
| Navigator | `↑` / `↓` | Previous/next agent (clamped); switch workspace immediately |
| Navigator | `Enter` | Focus composer for the selected agent |
| Navigator | `Esc` | Select parent; at main, focus composer |
| Navigator | `Ctrl+X`, then `Ctrl+K` | Stop all agents |
| Navigator | `Ctrl+K` (no chord) | Existing terminal-process stop |
| Composer | `Enter` | Route via `routeComposerInput` (below) |
| Composer | `↑` / `↓` / `Tab` / `Shift+Enter` | Existing cursor/history/completion/newline behavior |
| Composer | `Esc` | Existing completion close / request cancellation; not navigation |
| Composer | `Ctrl+K` (empty draft, no chord) | Existing terminal-process stop; with text, textarea kill-line |
| Composer | `Ctrl+C` | Existing copy/clear; cancel if selected agent is running and text is empty; else quit |
| Approval | `Y`/`Enter`, `A`, `N`/`Esc` | Existing command/file approval semantics |

Composer routing is a pure decision (`src/ui/workspace-view.ts`):

```ts
export type ComposerRoute =
  | { kind: 'repl' }
  | { kind: 'agent'; agentId: string }
  | { kind: 'reject'; reason: 'empty' | 'command_while_busy' | 'unknown_agent'; message: string };

export function routeComposerInput(input: {
  text: string;
  selectedAgentId: string;
  knownAgentIds: readonly string[];
  mainAwaitingInput: boolean;
}): ComposerRoute;
```

Rules: empty -> reject; slash commands and `exit`/`quit` always belong to the main REPL (allowed only while main is awaiting input; otherwise explicit `command_while_busy` rejection, never sent to a sub-agent); non-command text goes to the selected agent. When the selected agent is main and the REPL is awaiting input, `repl`; when main is running, `agent(main)` so it is queued. When a sub-agent is selected, `agent(id)` even while the main REPL is awaiting input; the pending main question stays pending. The composer clears on a successful dispatch/queue and stays focused.

#### D5. Concurrency, approvals, cancellation

- The approval queue (`src/runtime/approval-queue.ts`) remains the only serializer for interactive prompts across main and sub-agents. No new mutex.
- `executeToolWithReview` gains an optional `quiet` flag (sub-agent path) and an approval label. Quiet suppresses sub-agent tool/diff prints in main's log; approval prompts are always global and prefixed with `[agent-name]`. UI plumbing: `promptCommandApproval(command, requester?)`, `promptAcceptReject(message, requester?)`, and `setApprovalPrompt(active: boolean, label?: string)` (exported through `src/ui/index.ts` and `src/ui/screen.ts`); the label is the requesting agent's display name, or `'main'`.
- Approvals call `input.suspend()` / `input.resume()` (new optional methods) instead of `close()`/`showPrompt()`. Suspend blurs the composer, preserves the draft and any pending REPL question, and remembers whether the composer was the keyboard owner; resume restores that exact state (composer focus stays composer, navigator focus stays navigator) unless a picker/secret/approval is still active. This is required because a background sub-agent may now request approval while the main REPL is awaiting input; `close()` would resolve that question with `''` and destroy the draft.
- A pending approval sets the requesting agent's status `waiting`; messages to it queue. It does not block other agents except when they also need the FIFO approval prompt.
- No deadlocks: an approval is always answerable once a foreground picker/secret prompt is completed or cancelled; queued messages never answer prompts; stop-all cancels requests but the approval remains answerable.
- `executeToolWithReview` accepts an optional `shouldAbort()` predicate for sub-agent turns. It is checked after approval and before applying/executing, so a stop-all cannot still apply a just-approved file change. It returns a cancelled `ToolResult`.
- Cancellation scoping: main model calls keep the existing global Escape/Ctrl+C cancellation (unchanged). Follow-up sub-agent turns pass `shouldCancel: () => getSelectedAgentId() === session.id`, so Escape in the composer cannot silently cancel a background agent that is not selected. Initial delegated runs keep the existing behavior (global cancellation while the parent run is active). `Ctrl+X Ctrl+K` explicitly cancels everything.
- Provider/model selection is copied at spawn. A later `/model` or provider switch applies to new delegations only; existing sessions keep their client. Documented limitation.
- The terminal panel and `bash:start/read/stop` hooks remain global (one terminal at a time). Concurrent agents' terminal output may interleave there; each agent's own command/output is still recorded in its transcript.

### 21.3 Type contracts

```ts
// src/runtime/subagents.ts — additive changes (existing behavior preserved;
// test fixtures that construct SubAgentActivity gain parentId/queued)
import type { TokenUsage } from '../types/index.js';

export const MAIN_AGENT_ID = 'main';

export interface SubAgentActivity {
  id: string;
  runId: number;
  parentId: string;          // MAIN_AGENT_ID for every spawn today
  agent: string;             // display name only
  task: string;
  status: 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
  activity: string;
  step: number;
  budget: number;
  startedAt: number;         // epoch ms, first spawn; never reset on resume
  endedAt?: number;          // epoch ms of the last finished turn
  tools: SubAgentToolCall[];
  progress: string[];
  output?: string;
  error?: string;
  usage?: TokenUsage;        // cumulative for this agent (NimClient.getUsage())
  queued: number;            // messages waiting for the next turn (0..10)
}

export type SubAgentEventType =
  | 'run' | 'spawned' | 'activity' | 'tool-start' | 'tool-end'
  | 'progress' | 'waiting' | 'finished' | 'resumed' | 'usage' | 'queued';

export function spawnSubAgent(
  requestId: string,
  agent: string,
  task: string,
  budget?: number,
  parentId?: string,         // default MAIN_AGENT_ID; derived id never equals parentId
): string;

export function resumeSubAgent(id: string): boolean; // terminal -> running; clears error/output/endedAt
export function setSubAgentUsage(id: string, usage: TokenUsage): void;
export function setSubAgentQueued(id: string, count: number): void;
export function clearSubAgentActivity(): void; // clears rows, keeps listeners, emits 'run' (/clear)
```

```ts
// src/runtime/agent-tree.ts — pure, no I/O, no UI imports
import type { SubAgentActivity } from './subagents.js';
import type { TokenUsage } from '../types/index.js';

export type WorkspaceStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'failed' | 'stopped';

export interface MainAgentState {
  status: 'idle' | 'running' | 'waiting';
  activity: string;            // single line, e.g. "waiting for your approval"
  activeAgentName?: string;    // the /agent prompt currently active, if any
  goal?: string;               // taskState.goal
  usage?: TokenUsage;          // nimClient.getUsage()
  queued: number;              // queued main messages (0..10)
  startedAt: number;           // session start, epoch ms
}

export interface AgentTreeNode {
  id: string;
  name: string;                // 'main' or the sub-agent display name
  kind: 'main' | 'subagent';
  parentId: string | null;
  depth: number;               // main = 0
  status: WorkspaceStatus;
  activity: string;
  task: string;
  error?: string;              // sub-agent error, first line only
  startedAt: number;
  endedAt?: number;
  usage?: TokenUsage;
  childCount: number;
  activeChildCount: number;    // direct children with status running|waiting
  queued: number;
  duplicateName: boolean;      // a sibling has the same display name
}

export function workspaceStatusOf(status: SubAgentActivity['status']): WorkspaceStatus;

/** DFS pre-order: main, then each child subtree sorted by (startedAt, id). Orphans attach to main. */
export function buildAgentTree(main: MainAgentState, subagents: readonly SubAgentActivity[]): AgentTreeNode[];

/** Clamped, no wrap. Unknown current id -> main. */
export function moveAgentSelection(nodes: readonly AgentTreeNode[], selectedId: string, delta: -1 | 1): string;
export function parentAgentId(nodes: readonly AgentTreeNode[], id: string): string | null;
export function reconcileSelection(nodes: readonly AgentTreeNode[], selectedId: string): string; // id or MAIN_AGENT_ID
export function visibleAgentRows(
  nodes: readonly AgentTreeNode[],
  selectedId: string,
  maxRows: number,
): { rows: AgentTreeNode[]; hiddenAbove: number; hiddenBelow: number };
```

```ts
// src/runtime/agent-transcript.ts — per-agent conversation store
import type { WorkspaceStatus } from './agent-tree.js';

export type AgentTranscriptEvent =
  | { type: 'user'; agentId: string; text: string; at: number }
  | { type: 'assistant.start'; agentId: string; messageId: string; at: number }
  | { type: 'assistant.delta'; agentId: string; messageId: string; text: string; at: number }
  | { type: 'assistant.end'; agentId: string; messageId: string; finalText?: string; at: number }
  | { type: 'tool.start'; agentId: string; callId: string; name: string; args: string; at: number }
  | { type: 'tool.end'; agentId: string; callId: string; ok: boolean; result?: string; at: number }
  | { type: 'status'; agentId: string; status: WorkspaceStatus; detail?: string; at: number }
  | { type: 'error'; agentId: string; message: string; at: number };

export type AgentTranscriptEntryKind = 'user' | 'assistant' | 'tool' | 'status' | 'error' | 'truncated';

export interface AgentTranscriptEntry {
  id: string;                  // unique within the store
  agentId: string;
  kind: AgentTranscriptEntryKind;
  at: number;                  // epoch ms
  text: string;                // user/assistant/status/error text; tool summary
  streaming?: boolean;          // assistant only
  messageId?: string;          // assistant correlation
  tool?: {
    callId: string;
    name: string;
    args: string;              // one-line meaningful args summary
    state: 'running' | 'ok' | 'failed';
    result?: string;           // capped output/error
    startedAt: number;
    endedAt?: number;
  };
}

export const MAX_TRANSCRIPT_ENTRIES = 500;
export const MAX_TRANSCRIPT_TEXT = 8_000;          // chars per entry
export const MAX_TRANSCRIPT_BYTES_PER_AGENT = 256 * 1024;

export function applyTranscriptEvent(
  entries: readonly AgentTranscriptEntry[],
  event: AgentTranscriptEvent,
): AgentTranscriptEntry[];

export function summarizeToolArgs(name: string, args: Record<string, unknown>): string;

export interface AgentTranscriptStore {
  append(event: AgentTranscriptEvent): void;
  get(agentId: string): readonly AgentTranscriptEntry[];
  subscribe(listener: (agentId: string) => void): () => void;
  clearAgent(agentId: string): void;
  clearAll(): void;
}
export function createAgentTranscriptStore(): AgentTranscriptStore;
export const agentTranscripts: AgentTranscriptStore; // default instance used by runtime + UI
```

Invariants: every entry belongs to exactly one `agentId`; assistant deltas only update an entry with the matching `agentId` + `messageId`; `tool.end` only updates the matching `agentId` + `callId`; a store mutation notifies listeners with the affected id; `get()` returns a stable snapshot (never mutates under a reader).

```ts
// src/runtime/agent-selection.ts — navigation state only
export function getSelectedAgentId(): string;
export function setSelectedAgentId(id: string): void;
export function subscribeAgentSelection(listener: (id: string) => void): () => void;
export function resetAgentSelection(): void; // main
```

```ts
// src/runtime/agent-workspace.ts — handles, main state, dispatch, stop-all
import type { MainAgentState, WorkspaceStatus } from './agent-tree.js';

export const MAX_QUEUED_MESSAGES_PER_AGENT = 10;
export { MAIN_AGENT_ID } from './subagents.js';

export interface AgentHandle {
  readonly id: string;
  readonly kind: 'subagent';
  status(): WorkspaceStatus;
  send(text: string): AgentMessageResult; // same semantics as sendAgentMessage
  cancel(): void;
}

/** Main is built in: the workspace owns its state, queue and duplicate window; the REPL supplies only the I/O. */
export interface MainAgentBindings {
  /** Resolve a pending `input.question()` with this text; false when none is pending. */
  submitExternal(text: string): boolean;
  cancel(): void; // nimClient.cancelCurrentRequest()
}

export interface AgentWorkspace {
  registerMainAgent(bindings: MainAgentBindings): () => void;
  registerHandle(handle: AgentHandle): () => void;
  send(agentId: string, text: string): AgentMessageResult;
  getMainState(): MainAgentState;
  setMainState(patch: Partial<Pick<MainAgentState, 'status' | 'activity' | 'activeAgentName' | 'goal' | 'usage'>>): void; // `queued`/`startedAt` are workspace-owned
  takeQueuedMainMessage(): string | undefined; // FIFO; decrements queued
  subscribe(listener: () => void): () => void; // main state + registry events
  stopAll(): number;                            // cancellation requests issued
  reset(): void;                                // cancel + clear registry/transcripts/main queue
}

export function createAgentWorkspace(): AgentWorkspace; // test seam (also subscribes to subagents.ts)
export const agentWorkspace: AgentWorkspace;            // default instance used by runtime + UI

// Convenience wrappers over the default instance:
export function sendAgentMessage(agentId: string, text: string): AgentMessageResult;
export function getMainAgentState(): MainAgentState;
export function setMainAgentState(
  patch: Partial<Pick<MainAgentState, 'status' | 'activity' | 'activeAgentName' | 'goal' | 'usage'>>,
): void;
export function takeQueuedMainMessage(): string | undefined;
export function subscribeWorkspace(listener: () => void): () => void;
export function stopAllAgents(): number;
export function resetAgentWorkspace(): void; // keeps the registered main handle
```

```ts
// src/ui/workspace-view.ts — pure presentation helpers (no OpenTUI imports)
import type { AgentTreeNode, WorkspaceStatus } from '../runtime/agent-tree.js';
import type { AgentTranscriptEntry } from '../runtime/agent-transcript.js';
import type { UiEntry } from './tui.js'; // type-only

export type AgentColorRole = 'idle' | 'running' | 'waiting' | 'completed' | 'failed' | 'stopped';
export function agentStatusGlyph(status: WorkspaceStatus): string;
export function formatAgentRow(
  node: AgentTreeNode,
  opts: { width: number; now: number; selected: boolean },
): { prefix: string; glyph: string; label: string; meta: string; role: AgentColorRole; selected: boolean };
export function transcriptToUiEntries(
  entries: readonly AgentTranscriptEntry[],
  agentName: string,
): UiEntry[]; // sets the new optional UiEntry.agentLabel

// Pure keyboard decision so navigation is testable without a terminal.
export type WorkspaceKey = 'up' | 'down' | 'enter' | 'escape' | 'ctrl+x' | 'ctrl+k' | 'other';
export interface WorkspaceKeyState {
  focus: 'composer' | 'navigator';
  selectedAgentId: string;
  leaderArmedAt?: number; // epoch ms; set by ctrl+x
}
export function reduceWorkspaceKey(
  state: WorkspaceKeyState,
  key: WorkspaceKey,
  ctx: { nodes: readonly AgentTreeNode[]; now: number; leaderWindowMs?: number /* default 1500 */ },
): { state: WorkspaceKeyState; action: 'none' | 'stop_all'; consumed: boolean };
```

`UiEntry` gains one optional field: `agentLabel?: string` (display name of the agent that produced the entry). Existing renderers default to `Agent-Termo`.

### 21.4 Data flow

Spawn -> events -> transcript -> UI:

```
main runToolLoop sees agent:delegate(tc)
  -> resolveDelegation + loadProjectAgents
  -> spawnSubAgent(tc.id, name, task, 0, MAIN_AGENT_ID)          [registry: parentId, status running]
  -> spawnSubAgent emits 'spawned' -> subscribeWorkspace -> UI navigator snapshot bump
  -> create DelegatedAgentSession (client, messages, tools, handle registered)
  -> agentTranscripts.append(user task)
  -> runDelegatedTurn:
       status running -> transcript status
       model onChunk -> assistant.delta -> transcript store notifies UI (only selected agent renders)
       tool.start -> executeToolWithReview(quiet) -> tool.end -> transcript + registry tool events
       finishSubAgent(completed|failed|cancelled) -> transcript status/error -> registry 'finished'
  -> return ToolResult to parent (unchanged)
```

Composer -> dispatch -> resume -> events:

```
composer Enter
  -> routeComposerInput({text, selectedAgentId, knownAgentIds, mainAwaitingInput})
     'repl'  -> existing input.question resolution (main only)
     'agent' -> sendAgentMessage(targetId, text)
     'reject'-> explicit composer notice; nothing is redirected
  -> agentWorkspace.send:
       sub-agent idle/completed/failed/stopped -> append user message to the SAME session messages
                                        + transcript user entry + resume status running
                                        + runDelegatedTurn(session) in background
       sub-agent running/waiting      -> queue + registry queued count
       main idle                      -> MainAgentBindings.submitExternal(text) (or queue if no pending question)
       main running/waiting           -> queue (drained by the REPL at the next loop top)
  -> when the running turn ends: if queue non-empty, start the next turn on the same session
  -> selection change never calls a runtime mutator except setSelectedAgentId
```

### 21.5 Lifecycle and retention

| Agent | States | Transitions |
|---|---|---|
| main | idle, running, waiting | idle -> running on a user turn; running <-> waiting around approvals; running -> idle when the turn returns (including failure/cancel); never completed/stopped |
| sub-agent | running, waiting, completed, failed, stopped | running <-> waiting around approvals; running -> completed/failed/stopped; completed/failed/stopped -> running on a follow-up dispatch |

Retention: sub-agent registry rows and transcripts live for the session. `beginSubAgentRun()` only scopes the legacy live monitor; the workspace navigator uses `listSubAgents()` (all rows) so finished agents stay inspectable. `/clear` cancels agents and calls `resetAgentWorkspace()` (clears registry rows + transcripts + queues, resets main state and selection to main). No sub-agent transcript or registry persistence across process restarts; the main session keeps its existing JSON persistence.

### 21.6 UI specification

Layout order (top to bottom): existing app header; selected agent's content (`flexGrow=1`, `minHeight=0`); terminal panel (when visible, existing position); picker/completion overlays; composer; **agent navigator directly below the composer**; existing status line. The navigator is `flexShrink=0` and never squeezes the content area. Update `overlayAvailableRows` and `promptInputHeight` budgets to subtract the navigator's rendered rows.

Content area:

- One non-scrolling status row at the top of the content area for the selected agent (thin separator; never boxed): `@<name> · <status label> · <activity|task> · <elapsed> · <tokens> tok` using only real values (omit absent segments). It shows the current execution status and working indicator in the main content, not only in the navigator.
- Main selected: render the existing `entries` exactly as today (labels `❯ You` / `⏺ Agent-Termo`).
- Sub-agent selected: render `transcriptToUiEntries(agentTranscripts.get(id), name)` with labels `❯ You → @name`, `⏺ name`, tool lines, dim status lines, red error lines. Markdown and streaming use the existing `<markdown>` component. No parent/user/assistant text from another agent may appear. Empty transcript -> `No activity yet for @name.`
- Scroll: one scrollbox, a `Map<agentId, scrollTop>`; on switch save the current position, load the target's saved position (first view starts at the bottom), restore after layout with `scrollTo()`. Tail-follow only when the agent was measured at the bottom before the update (`scrollTop + viewport.height >= scrollHeight - 2` in `afterLayout`). A non-selected agent's updates never touch the scrollbox. Do not use unconditional `stickyScroll`. The transcript subscription only bumps the render revision when `agentId === selectedAgentId()`; hidden agents are read from the snapshot on switch, so background streaming cannot force a scroll or re-render.
- Composer: placeholder `Message @<name>…`; prefix label `@<name> ❯` (clipped) so the target is always visible with text present; placeholder/prefix update immediately on selection. Per-agent drafts; switching saves/loads the target draft. Successful dispatch clears the draft and keeps focus. Rejections show a composer notice (auto-clears after ~4 s). While a modal owns the keyboard, the composer is visible but unfocused with an explicit owner banner (`Approval required from @frontend-expert`).

Navigator rows (one line each, never wrap):

- Row parts: `▸ ` when selected; tree prefix (2 spaces per depth, `├ ` / `└ ` for children); status glyph; `main` or agent name (append `#<first 6 id chars>` when `duplicateName`); dim metadata.
- Glyphs: idle `○`, running `◐`, waiting `◔`, completed `✓`, failed `✗`, stopped `!`.
- Main metadata: status label; `· <activeAgentName>` if set; `· <goal clipped>`; `· waiting on N subagent(s)` when `activeChildCount > 0`; `· since HH:MM` (session start) while running/waiting; `· <tokens> tok` when usage exists; `· N queued` when queued.
- Sub-agent metadata: status label; live -> `· <activity>`; completed -> `· <task clipped>`; failed -> `· <first error line clipped>`; stopped -> `· stopped`; `· since HH:MM` while live or `· <formatDuration(endedAt - startedAt)>` when terminal; `· <tokens> tok` when usage exists; `· N queued` when queued. Times use local `toLocaleTimeString` with hour/minute only. Elapsed is wall-clock since spawn, not compute time; label it as elapsed, not "runtime".
- Never display a metric that is absent in the runtime. "Thinking" is not a status; show `Running` plus activity.
- Live elapsed updates: while at least one node is running/waiting, a 1,000 ms UI interval bumps a `now` signal used only for duration/since formatting; clear the interval when nothing is live. It must not trigger transcript re-renders (read `now` only in row formatting).
- Rows are derived from `buildAgentTree` + `visibleAgentRows` (at most 7 agent rows; when space is tight, at least the selected agent row). The hint row is always visible and is not counted in the 7. Overflow shows `… N above` / `… N below` dim rows. Hint row: `Ctrl+X navigate · ↑↓ select · Enter message · Esc parent · Ctrl+X Ctrl+K stop all` (clipped; adapt when navigator is focused).
- Responsive priority when narrow: drop usage, then "since", then goal/task, then active agent name; keep glyph, name, status, activity, and the hint. Selected row uses the existing accent (`#D99168`/`#F0B38D`), dim metadata `#88827C`, running/waiting `#E2A078`/`#79B8D1`, success `#8FCB9B`, error `#E47D76`. No new palette; dark/light behavior follows the existing TUI theme tokens. Borders are existing `#6D625A`; no rounded style for the navigator.

Edge states:

1. No sub-agents: navigator shows main + hint.
2. New sub-agent: snapshot event adds the row; selection does not jump.
3. Completed: row remains, transcript retained.
4. Failed: failed glyph, error at the end of the transcript, conversation preserved and resumable.
5. Main waiting on children: main row shows `waiting on N subagent(s)` from real active children.
6. Multiple active agents: switching is UI-only; runs continue.
7. Nested: tree renders any depth generically; runtime exposes one level today.
8. Routing: selected id is the dispatch target; no name lookup, no parent fallback.
9. Streaming during switch: the store keeps receiving; the hidden agent's scroll is untouched.
10. Selected agent finishes/stops/fails: id stays valid; `reconcileSelection` falls back to main only if a node truly disappears.
11. Empty conversation: explicit empty state as above.

### 21.7 File-level change plan

| File | Action | What changes (one line) |
|---|---|---|
| `src/runtime/subagents.ts` | modify | Add `parentId`, `usage`, `queued`, resume/usage/queued mutators and `clearSubAgentActivity`; derive ids so they never equal `parentId`; export `MAIN_AGENT_ID`. |
| `src/runtime/agent-tree.ts` | create | Pure `WorkspaceStatus`, `MainAgentState`, `AgentTreeNode`, tree build, selection movement/parent/reconcile/windowing. |
| `src/runtime/agent-transcript.ts` | create | Per-agent transcript event/entry types, caps, pure reducer, store with snapshot reads/subscriptions, tool-arg summarizer. |
| `src/runtime/agent-selection.ts` | create | Selected agent id getter/setter/subscription/reset (navigation state only). |
| `src/runtime/agent-workspace.ts` | create | Main agent state, handle registry, `sendAgentMessage`, queue policy wrapper, `subscribeWorkspace`, `stopAllAgents`, `resetAgentWorkspace`. |
| `src/main.ts` | modify | Persistent `DelegatedAgentSession` + follow-up turn loop; register main/sub handles; transcript recording; quiet sub-agent tool output; approval labels + suspend/resume; main status/usage/queue drain; `/clear` reset; scoped follow-up cancellation. |
| `src/ui/tui.tsx` | modify | Workspace signals/subscriptions, navigator rendering, content switching, per-agent scroll, composer routing/placeholder/drafts, focus modes, key handling, stop-all chord, approval banner; keep all existing keys. |
| `src/ui/workspace-view.ts` | create | Pure row formatting/glyphs, `routeComposerInput`, transcript-to-`UiEntry` mapping. |
| `src/ui/screen.ts` | modify | Re-export new UI API (`setApprovalPrompt`, workspace helpers used by main). |
| `src/ui/index.ts` | modify | Re-export the new UI API used by `main.ts`; keep print facade behavior. |
| `docs/ARCHITECTURE.md` | modify | This section (contract). |
| `docs/architecture/target-architecture.md` | modify | Add current `not yet implemented` markers for the new modules/capabilities. |
| `tests/unit/agent-tree.test.ts` | create | Hierarchy/selection/parent/window tests. |
| `tests/unit/agent-transcript.test.ts` | create | Reducer isolation/streaming/tool pairing/caps/subscription tests. |
| `tests/unit/agent-workspace.test.ts` | create | Dispatch/queue/dedupe/queue-full/unknown/stop-all/main-state tests with fake handles. |
| `tests/unit/agent-selection.test.ts` | create | Selection subscribe/reset tests. |
| `tests/unit/workspace-view.test.ts` | create | Composer routing, glyphs, row meta, transcript mapping tests. |
| `tests/unit/subagents.test.ts` | modify | Add parentId/usage/queue/resume/clear coverage (existing cases unchanged). |
| `tests/unit/subagent-view.test.ts` | modify | Add the two new required `SubAgentActivity` fields (`parentId`, `queued`) to the fixture; rendering assertions unchanged. |

No new environment variables; `.env.example` is unchanged.

### 21.8 Acceptance criteria -> component mapping

| Acceptance criterion | Implemented by |
|---|---|
| Navigator directly below the composer | `tui.tsx` layout order; `overlayAvailableRows`/`promptInputHeight` budgets |
| Hierarchy shows main/parents/children | `subagents.ts.parentId` + `agent-tree.buildAgentTree` |
| `↑`/`↓` changes selection | `agent-selection` + `tui.tsx` navigator focus branch + `moveAgentSelection` |
| Selection immediately changes the main content | `tui.tsx` selected-agent content switch; `agent-transcript.get` snapshot |
| Each agent shows its own actual conversation/activity | main `entries`; sub-agent `agentTranscripts`; registry fallback metadata |
| Can prompt the selected sub-agent directly | `workspace-view.routeComposerInput` + `sendAgentMessage` |
| Messages delivered to the correct agent id/session | `AgentHandle.send`; `DelegatedAgentSession.messages` reused |
| Switching never interrupts execution | selection module is UI-only; no runtime mutator on selection |
| Background agents keep streaming | transcript store appended regardless of selection; workspace subscription |
| Conversation history + scroll preserved | main `entries` retained; transcript store + `Map<agentId, scrollTop>` |
| Parent/child never mixed | separate stores + `quiet` sub-agent tool output |
| Completed/failed agents inspectable | registry retention + transcript retention |
| Existing shortcuts work; text editing not broken | key table; navigator only when focused; composer key handling unchanged |
| Dark/light themes work; no unrelated UI broken | existing TUI hex tokens; surgical file list |
| Tests/typecheck/build pass | `bun run typecheck`, `bun run test`, `bun run build` (baseline: 0 / 275 passed + 2 skipped / clean) |

### 21.9 Test seams and verification

Automated, no terminal required:

- `buildAgentTree`: order, depth/indent data, multiple children, duplicate names flagged, orphan attach, active child counts, completed retention.
- `moveAgentSelection` / `parentAgentId` / `reconcileSelection` / `visibleAgentRows`: clamping, no wrap, parent escape, missing-id fallback, window bounds.
- `applyTranscriptEvent` / store: per-agent isolation, assistant delta accumulation + final replacement, tool start/end pairing by callId, late `tool.end` ignored, status dedupe, error finalizes streaming, entry/byte caps and truncation marker, unsubscribe.
- `decideMessageDisposition` + `createAgentWorkspace().registerMainAgent`/`registerHandle`/`send`: unknown reject, idle/completed/failed/stopped dispatch, running/waiting queue, queue full, duplicate (queued + 2 s dispatch window), FIFO order, no parent fallback.
- `stopAllAgents`: cancels every handle once, clears queues, returns count.
- `routeComposerInput`: command-while-idle -> repl, command-while-busy reject, main-running -> queued target, sub-agent target while main awaits input, unknown target reject, empty.
- `reduceWorkspaceKey`: Ctrl+X enters navigator and arms; arrows move selection; Enter focuses composer; Escape selects parent then focuses composer at main; Ctrl+X then Ctrl+K yields `stop_all` only inside the leader window (after it, Ctrl+K is not stop_all); composer focus never consumes navigation keys; `other` disarms the leader.
- `transcriptToUiEntries`/`formatAgentRow`: labels, glyphs, status mapping, no fabricated usage, truncation.
- `subagents.ts`: parentId default, id never equals parentId, resume transitions, usage/queued emission, clear keeps listeners.

Manual scenarios (must be run in a real TTY): spawn at least two sub-agents from main, verify both appear, navigate with Ctrl+X + arrows, verify content switches, send different instructions to each and verify the transcripts show exactly those messages, return to main unchanged, switch during streaming, verify background updates, verify completed/failed inspection, arrow-key editing in the composer, stop-all chord, and `/clear` reset.

Required commands and reporting: `bun run typecheck` (expect exit 0), `bun run test` (expect all pass; baseline 275 passed / 2 skipped), `bun run build` (expect clean `dist/cli.js`). Report exact output, not a summary claim.

### 21.10 Limitations and decisions for project-manager

Explicit limitations:

- No nested delegation; the tree is generic but depth is one below main by design.
- Sub-agent registry/transcripts are in-memory; restarting Agent-Termo loses them.
- Follow-up queueing waits for the current turn (up to the 10-minute budget); there is no mid-turn injection.
- Follow-up results do not automatically re-enter the parent model's context.
- Stop-all aborts model requests and prevents the next iteration/approval, but an already-running tool call is not killed; it completes or hits its own timeout.
- The terminal panel is shared; concurrent agents can interleave terminal output there (per-agent command output still lands in the transcript).
- No "Thinking" status exists in the runtime; none is invented.
- Token usage is cumulative per agent, not per turn.
- Provider/model changes apply to newly spawned sessions; existing sessions keep their client.

Items for project-manager to confirm (decisions taken here, reversible but explicit):

1. Illustrative hierarchy deviation: `project-manager` is shown as main's active-prompt label, not a separate parent node. Fake nodes are rejected.
2. `Ctrl+X Ctrl+K` stop-all is **new** (it does not exist today); plain `Ctrl+K` terminal stop is preserved where the composer does not own the key.
3. Composer is always visible, but approval/picker/secret modals own the keyboard; navigation is frozen while they are open.
4. `/clear` now also resets the sub-agent workspace (previously it only cleared main).
5. Follow-up results stay inside the sub-agent session and do not flow back to the parent automatically.

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

*Architecture Document v1.2 — Agent-Termo Terminal AI Coding Agent*