# Project Memory System

This document tracks the project's memory and context for all agents to ensure consistency and shared understanding across the entire multi-agent system.

## Project Context

- **Project Name:** Agent-Termo
- **Goal:** Build a terminal-based AI coding agent tool that replicates the Claude Code experience
- **LLM Backend:** Nvidia NIM APIs (free tier, OpenAI-compatible)
- **Purpose:** Enable AI-powered autonomous software development via terminal

## Current Phase

- **Phase:** Post-Tech Stack Selection (Implementation Ready)
- **Status:** Tech stack finalized, ready for implementation
- **Next:** Begin CLI foundation implementation

## Technology Decisions (FINAL)

### Core Stack

| Category | Technology | Version | Status |
|----------|-----------|---------|--------|
| **Language** | TypeScript | 5.x | DECIDED |
| **Runtime** | Node.js | 20.x LTS | DECIDED |
| **CLI/TUI Framework** | blessed | 0.1.10 | DECIDED |
| **Color Output** | chalk | 5.x | DECIDED |
| **Markdown Rendering** | marked | 12.x | DECIDED |
| **LLM Client** | OpenAI SDK | 4.x | DECIDED |
| **Validation** | zod | 3.x | DECIDED |
| **Git Operations** | simple-git | 3.x | DECIDED |
| **CLI Arguments** | commander | 12.x | DECIDED |
| **File Operations** | fs-extra | 11.x | DECIDED |

### Build & Distribution

| Category | Technology | Version | Status |
|----------|-----------|---------|--------|
| **TypeScript Runner** | tsx | 4.x | DECIDED |
| **Bundler** | esbuild | 0.21.x | DECIDED |
| **Binary Packager** | pkg | 5.x | DECIDED |
| **Testing** | vitest | 1.x | DECIDED |
| **Linting** | eslint + typescript-eslint | 9.x, 8.x | DECIDED |

### Infrastructure

| Category | Technology | Status |
|----------|-----------|--------|
| **LLM API** | Nvidia NIM (OpenAI-compatible) | DECIDED |
| **CI/CD** | GitHub Actions | DECIDED |
| **Distribution** | npm + pkg binaries | DECIDED |

## Configuration Files Generated

- `docs/TECH_STACK.md` - Complete technology decisions
- `package.json` - All dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `tsconfig.test.json` - Test TypeScript configuration
- `.env.example` - Environment variables template

## Architecture Decisions

### Core Components

1. **CLI Layer:**
   - Entry: `src/cli.ts` (commander-based)
   - Main: `src/main.ts`
   - Responsibilities: Argument parsing, startup flow, project initialization

2. **Terminal UI Layer:**
   - Location: `src/ui/`
   - blessed-based TUI
   - Components: screen, input, output, markdown renderer
   - Style: Dark theme with chalk colors

3. **LLM Integration:**
   - Location: `src/llm/`
   - OpenAI SDK with NIM baseURL
   - Streaming for real-time responses
   - Tool use (function calling) for agent actions

4. **Agent System (12 agents):**
   - Location: `src/agents/`
   - Prompts loaded from `.claude/agents/*.md` at runtime
   - Memory/timeline persisted to `docs/MEMORY.md`, `docs/TIMELINE.md`

5. **Tool System:**
   - Location: `src/tools/`
   - Tools: read, write, bash, git, glob
   - Sandboxed execution with path validation

## Design Decisions

### Target Aesthetic (Claude Code CLI)

- **Theme:** Dark background with light text
- **Colors:** chalk palette (cyan, green, yellow, red, magenta, blue)
- **Typography:** Monospace throughout (terminal-native)
- **Layout:**
  - Scrollable message history (top/main area)
  - Input box at bottom
  - Optional: side panels for file tree/stats
- **Features:**
  - Streaming output (token-by-token display)
  - Markdown rendering (code blocks, links, headers)
  - Syntax highlighting for code blocks
  - Spinner/loading indicators
  - Error states with red highlighting

### Markdown Rendering Strategy

1. Use `marked` to parse markdown
2. Convert to ANSI escape sequences via custom renderer
3. Output through blessed for proper positioning
4. Support: headers (1-6), bold, italic, code blocks, inline code, links, lists, blockquotes

## Security Considerations

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

## Implementation Priority

1. **CRITICAL:** CLI scaffold and blessed TUI foundation
2. **CRITICAL:** OpenAI SDK integration with NIM
3. **CRITICAL:** Streaming response rendering
4. **HIGH:** Basic conversation loop
5. **HIGH:** Agent system (load prompts, tool calling)
6. **HIGH:** Tool system (file IO, bash, git)
7. **MEDIUM:** Memory/timeline runtime
8. **MEDIUM:** Full 12-agent implementation
9. **LOW:** Polish, testing, error handling

## Deliverables Created

| File | Purpose | Status |
|------|---------|--------|
| `docs/TECH_STACK.md` | Technology decisions | COMPLETE |
| `package.json` | Dependencies | COMPLETE |
| `tsconfig.json` | TypeScript config | COMPLETE |
| `tsconfig.test.json` | Test config | COMPLETE |
| `.env.example` | Environment template | COMPLETE |

## Next Steps for Implementation

1. Set up project directory structure
2. Install dependencies: `npm install`
3. Create src/ui/screen.ts with blessed layout
4. Create src/llm/client.ts with OpenAI SDK
5. Create src/cli.ts with commander
6. Test basic CLI and TUI
7. Proceed to agent system implementation

## Agent Activities Log

### 2026-07-04 - tech-stack-expert

**Type:** Technology Selection and Documentation

- Analyzed project requirements (terminal-based AI agent)
- Evaluated 10+ technology options using decision matrix
- Selected and justified each technology choice
- Created comprehensive `docs/TECH_STACK.md`
- Created `package.json` with all dependencies
- Created `tsconfig.json` and `tsconfig.test.json`
- Created `.env.example` for configuration

**Key Decisions:**
- blessed for TUI (mature, cross-platform, widget support)
- OpenAI SDK for NIM (official, handles tool calls, streaming)
- TypeScript 5.x (type safety, matches Claude Code approach)
- pkg for binary distribution (standalone executables)


## Project State

| Component | Status |
|-----------|--------|
| CLAUDE.md (spec) | Complete |
| Agent definitions (.claude/agents/) | Complete |
| Project plan (PROJECT_PROGRESS.md) | Complete |
| Technology stack decisions | Complete |
| Source code (11 TS files) | Complete |
| Integration tests | Complete |
| TypeScript compilation | Pass |
| esbuild dist/ | Pass (cli.js 656KB, main.js 621KB) |
| docs/ROUTE_MAP.md | NEW — CLI commands |
| docs/DEV_SETUP.md | NEW — developer setup |
| NIM API integration | VERIFIED — HTTP 200 |
| **Source code implementation** | **COMPLETE** |

## NIM API Validation Results (2026-07-04)

**Finding**: The NIM API key in `.env` is REAL and VALID.

**API configuration that works**:
- URL: `https://integrate.api.nvidia.com/v1/chat/completions`
- Model: `meta/llama-3.1-8b-instruct` (dot notation REQUIRED)
- HTTP 200, responds with AI content in real time
- Token usage: 49 prompt / 3 completion

**Critical model name finding**:
- DOT notation works: `meta/llama-3.1-70b-instruct` -> HTTP 200
- UNDERScore returns 404: `meta/llama-3_1-70b-instruct` -> HTTP 404
- Prefix format NOT available: `nvidia_nim/moonshotai/kimi-k2.6` -> HTTP 404

**Configuration updated everywhere**:
- `.env` now uses: `NIM_MODEL=meta/llama-3.1-8b-instruct`
- `.env.example` updated with note about dot notation
- `src/utils/config.ts` defaults to `meta/llama-3.1-70b-instruct`
- `scripts/test-nim.mjs` defaults to `meta/llama-3.1-8b-instruct`

## Files Created in This Session

- `scripts/test-nim.mjs` — NIM API validation script
- `docs/ROUTE_MAP.md` — CLI command reference
- `docs/DEV_SETUP.md` — developer setup guide
- `tests/integration/basic.test.ts` — 10 integration tests (all pass)

## Files Modified in This Session

- `.env` — fixed NIM_MODEL to `meta/llama-3.1-8b-instruct`
- `.env.example` — added dot vs underscore note
- `src/utils/config.ts` — fixed default model to dot notation
- `scripts/test-nim.mjs` — fixed model default, improved error messages
- `scripts/build.mjs` — fixed fs/promises -> fs-extra import
- `tests/integration/basic.test.ts` — created (10 tests)
- `docs/TIMELINE.md` — appended session results
- `docs/PROJECT_PROGRESS.md` — fully updated with accurate state
- `docs/MEMORY.md` — this update

## Access Rules

1. Read MEMORY.md at start of every session
2. Update MEMORY.md after significant work
3. Never delete historical context
4. Use as single source of truth for decisions
5. Model names for NIM: ALWAYS use DOT notation (3.1 not 3_1)

## Related Documentation

- CLAUDE.md: Full agent specification
- docs/TECH_STACK.md: Technology decisions
- docs/MEMORY.md: This file
- docs/TIMELINE.md: Activity log
- docs/PROJECT_PROGRESS.md: Implementation roadmap and status
- docs/ROUTE_MAP.md: CLI command reference
- docs/DEV_SETUP.md: Developer setup guide
