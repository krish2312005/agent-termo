# Tech Stack Decision Document

**Project:** Agent-Termo
**Date:** 2026-07-04
**Version:** 1.0
**Status:** FINAL (do not change without consulting all team members)

---

## Executive Summary

Agent-Termo is a terminal-based AI coding agent tool that replicates the Claude Code experience. It runs as an interactive CLI application, uses Nvidia NIM APIs (free tier) as the LLM backend, and implements the 12-agent system defined in CLAUDE.md to create complete software autonomously.

### Project Profile

- **Type:** CLI Tool (Internal Developer Tool)
- **LLM Backend:** Nvidia NIM API (OpenAI-compatible, free tier)
- **Target Users:** Software developers who want AI-assisted coding in terminal
- **Expected Users at Launch:** 1 (single developer)
- **Expected Users at 1 Year:** 10-100 (if open sourced)
- **Team Size:** 1 developer
- **Budget:** Bootstrap ($0 infrastructure)
- **Timeline:** MVP in 2-4 weeks
- **Geographic Scope:** Global (cross-platform: Windows, macOS, Linux)

---

## Technology Decisions

### Programming Language

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **Language** | TypeScript | 5.x | Type safety, IDE support, mirrors Claude Code approach, minimal runtime overhead |
| **Runtime** | Node.js | 20.x LTS | Stable, cross-platform, massive ecosystem, used by Claude Code, excellent TypeScript support |
| **Package Manager** | npm | 10.x | Standard for Node.js, works globally with npm install -g |

**Why TypeScript over JavaScript:**
- Catch bugs at compile time, not runtime
- Better IDE support (autocomplete, refactoring)
- Code documentation through types
- Matches Claude Code's implementation approach

**Why Node.js over Deno/Bun:**
- More mature ecosystem for CLI tools
- blessed library is Node.js native
- More community support for Node.js CLI tools
- pkg (binary packaging) has better Node.js support

---

### CLI/Terminal UI Framework

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **TUI Framework** | blessed | 0.1.10 | Mature, cross-platform, complex widget system, supports boxes/text/tables like Claude Code |
| **Color Output** | chalk | 5.x | Simple, chainable API, great for styled terminal output |
| **Markdown Rendering** | marked | 12.x | Fast, extensible, renders markdown to ANSI for terminal |

**Why blessed over alternatives:**

| Alternative | Why NOT Selected |
|------------|------------------|
| ink (React for CLI) | Requires React runtime, overkill for CLI tool |
| bubble-tea (Go) | Requires switching to Go, team is TypeScript-focused |
| termini (C#) | Requires .NET runtime, not cross-platform |
| Custom ANSI | Too much boilerplate, reinventing the wheel |
| blessed-contrib | Depends on blessed, adds nothing we need |
| node-pty | Too low-level, need widgets not raw PTY |

**blessed Selection Justification:**
- Mature library (2012-present, 15k+ stars)
- Works on Windows, macOS, Linux
- Supports boxes, text scrolling, cursor control
- Excellent for Claude Code-like UI (left panel, streaming output)
- Well-documented with TypeScript types
- Used in production by Discord, npm, and others

---

### LLM API Integration

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **API Client** | OpenAI SDK | 4.x | Official, handles streaming, tool calls, retries |
| **Runtime Streaming** | Native fetch | Built-in | Streaming responses for real-time output |
| **API Compatibility** | OpenAI-compatible | N/A | Nvidia NIM uses OpenAI API format |

**Implementation Notes:**
- Configure baseURL to Nvidia NIM endpoint
- Use API key authentication from environment
- Tool use (function calling) for agent actions
- Support streaming and non-streaming modes
- System prompt loaded from .claude/agents/*.md files

**Why not native fetch:**
- OpenAI SDK handles edge cases (retries, timeouts, streaming delimiters)
- Better error handling for API errors
- Tool calling support built-in
- Well-tested by thousands of applications

---

### Agent System Components

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **Agent Prompts** | Claude.md format | N/A | Loads from .claude/agents/*.md |
| **Memory System** | Markdown files | docs/MEMORY.md | Filesystem-based, simple, works cross-platform |
| **Timeline System** | Markdown files | docs/TIMELINE.md | Same as memory, append-only for history |
| **Code Templates** | Template literals | TypeScript | Inline templates for generated code |
| **Validation** | zod | 3.x | Runtime type checking, used throughout codebase |

**Why filesystem-based over database:**
- Simpler (no database setup in target project)
- Git-friendly (commits are timeline entries)
- Cross-platform (Windows filesystems work)
- Human-readable (developers can read/edit directly)
- Matches Claude Code's file-based approach

---

### Build & Distribution

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **TypeScript Compiler** | tsx | 4.x | Fast TypeScript execution, no separate compile step |
| **Bundler** | esbuild | 0.21.x | Fastest bundler, creates small bundles |
| **Binary Packager** | pkg | 5.x | Creates standalone .exe/.app binaries |
| **Testing** | vitest | 1.x | Fast, Vite-based, excellent TypeScript support |
| **Lint** | eslint + typescript-eslint | 9.x, 8.x | Code quality, catches errors early |

**pkg Configuration:**
- Target: node20-windows, node20-macos, node20-linux
- Assets: Include .claude directory for agent prompts
- Output: Binary distributed via npm

**Build Pipeline:**
```
tsc (type check) → esbuild (bundle) → pkg (binary) → npm publish
```

---

### Key Dependencies (package.json)

```json
{
  "dependencies": {
    "blessed": "^0.1.10",
    "chalk": "^5.3.0",
    "marked": "^12.0.0",
    "openai": "^4.50.0",
    "zod": "^3.23.0",
    "simple-git": "^3.24.0",
    "commander": "^12.1.0",
    "fs-extra": "^11.2.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.10.0",
    "esbuild": "^0.21.0",
    "pkg": "^5.8.0",
    "vitest": "^1.5.0",
    "@types/node": "^20.12.0",
    "eslint": "^9.4.0",
    "typescript-eslint": "^8.0.0"
  }
}
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI Entry Point                           │
│                  (src/cli.ts, commander)                     │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   blessed TUI   │
                    │  (src/ui.ts)    │
                    │  - Main screen │
                    │  - Input box   │
                    │  - Output log  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐
     │ Agent System  │ │  LLM     │ │   Tool     │
     │ (src/agents/) │ │ (src/llm/)│ │ (src/tools/)│
     │ - 12 agents   │ │ - OpenAI │ │ - Read    │
     │ - Prompts    │ │ - NIM API│ │ - Write   │
     │ - Memory     │ │ - Stream │ │ - Bash    │
     │ - Timeline   │ │          │ │ - Git     │
     └───────────────┘ └──────────┘ └───────────┘
```

---

## Directory Structure

```
agent-termo/
├── src/
│   ├── cli.ts              # Commander entry point
│   ├── main.ts             # Main application logic
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
│   │   ├── bash.ts         # Bash execution tool
│   │   ├── git.ts          # Git operations tool
│   │   └── glob.ts         # File search tool
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
│   └── build.mjs           # build script (esbuild + pkg)
├── docs/                   # Project documentation
│   ├── TECH_STACK.md       # This file
│   ├── MEMORY.md           # Project memory
│   └── TIMELINE.md         # Project timeline
├── package.json
├── tsconfig.json
├── tsconfig.test.json
├── .env.example
├── .gitignore
├── esbuild.config.mjs
├── vitest.config.ts
└── README.md
```

---

## Integration Points

### Key Integrations

1. **blessed + chalk-markdown:** Terminal output styling
   - blessed handles screen layout and input
   - chalk handles colors
   - marked converts markdown to ANSI

2. **OpenAI SDK + Nvidia NIM:**
   - OpenAI SDK configured with NIM baseURL
   - Streaming responses for real-time output
   - Tool use for agent actions

3. **simple-git + fs-extra:**
   - Git operations for version control
   - File operations for code generation

---

## Security Considerations

### For Agent-Termo Itself (Defensive)

1. **Bash execution sandbox:**
   - Whitelist allowed commands
   - Timeout on long-running commands
   - User confirmation for destructive commands

2. **Path validation:**
   - Prevent path traversal attacks
   - Restrict operations to project directory
   - Validate file paths against project root

3. **No hardcoded secrets:**
   - API key from environment variable
   - Never log API keys
   - Use .env files, not hardcoded values

### For Generated Output (Offensive Awareness)

1. **Warn before dangerous operations:**
   - `rm -rf` detection
   - Credential exposure warnings
   - Destructive git operations

2. **User confirmation:**
   - Before executing bash commands
   - Before overwriting files
   - Before git push/push --force

---

## Performance Characteristics

### Expected Metrics

- **Startup time:** <2 seconds
- **LLM latency:** 100-500ms per token (depends on NIM rate limits)
- **UI responsiveness:** <50ms for typing input
- **File operations:** <100ms for typical files
- **Memory usage:** <200MB for typical project

### Optimization Strategies

- Lazy load agent prompts (only when needed)
- Stream LLM responses as they arrive
- Batch file operations where possible
- Use incremental parsing for large files
- Cache directory listings

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

## Testing Strategy

### Unit Tests (via vitest)

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

---

## Distribution

### npm Package

```json
{
  "name": "agent-termo",
  "version": "1.0.0",
  "description": "Terminal-based AI coding agent",
  "bin": {
    "agent-termo": "./dist/cli.js"
  },
  "keywords": ["cli", "ai", "agent", "coding"],
  "author": "Developer",
  "license": "MIT",
  "preferGlobal": true
}
```

### Installation Methods

```bash
# npm install -g (from npm registry)
npm install -g agent-termo
agent-termo

# Development (from source)
git clone <repo>
npm install
npm link
agent-termo

# Binary distribution (via pkg)
# Windows
agent-termo-win.exe

# macOS
./agent-termo-macos

# Linux
./agent-termo-linux
```

---

## Explicitly Rejected Options

### Why Not ink (React for CLI)?

- Overkill for our needs (no complex component state)
- React runtime adds weight to CLI tool
- More complexity than simpler blessed+chalk
- Team not React experts

### Why Not bubble-tea (Go)?

- Team is TypeScript-focused
- Would require learning Go
- CLI tool doesn't need Go's performance
- Extra language doesn't add value here

### Why Not TypeScript with Deno?

- Node.js has better ecosystem for CLI tools
- blessed and other CLI libraries work better on Node
- pkg doesn't support Deno
- npm install -g works natively on Node

### Why Not Rust?

- Steeper learning curve
- Longer development time
- CLI tool doesn't need Rust performance
- Node.js ecosystem is sufficient

### Why Not Python?

- Less type safety than TypeScript
- CLI tools less common in Python ecosystem
- TypeScript matches Claude Code approach
- Package management more complex

---

## Development Setup Commands

```bash
# Initialize project
npm init -y

# Install dependencies
npm install blessed chalk marked openai zod simple-git commander fs-extra
npm install -D typescript tsx esbuild pkg vitest eslint @types/node typescript-eslint

# Set up TypeScript
npx tsc --init

# Verify setup
npm run build
npm test
```

---

## Next Steps

1. Backend-architecture-designer creates runtime architecture
2. Frontend-planner creates CLI behavior spec
3. Dev-environment-initiator sets up local dev
4. Backend-expert implements LLM integration
5. Frontend-expert implements TUI

---

## Version History

| Date | Decision | Rationale | Alternative Considered |
|------|----------|-----------|------------------------|
| 2026-07-04 | Use blessed for TUI | Mature, cross-platform, widget support | ink (React), custom ANSI (more work) |
| 2026-07-04 | Use OpenAI SDK | Official, NIM-compatible, handles tool calls | Native fetch (more edge cases) |
| 2026-07-04 | Use TypeScript | Type safety, matches Claude Code approach | Python (less type safety), Rust (slower dev) |
| 2026-07-04 | Use pkg for binaries | Creates standalone executables | nexe (deprecated), vercel (not for CLI) |
| 2026-07-04 | Use filesystem for memory | Simple, git-friendly, human-readable | SQLite (overkill), Redis (not on target) |