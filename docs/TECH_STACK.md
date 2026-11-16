# Tech Stack Decision Document

**Project:** Agent-Termo  
**Date:** 2026-07-04  
**Version:** 1.1  
**Status:** FINAL (do not change without consulting all team members)

---

## Executive Summary

Agent-Termo is a terminal-based AI coding agent tool that replicates the Claude Code experience. It runs as an interactive CLI application, uses Nvidia NIM APIs (free tier, OpenAI-compatible) as the LLM backend, and implements a 12-agent system to create complete software autonomously via terminal. The stack is TypeScript-first, Node.js-based, with a `blessed` TUI, `pkg` binary distribution, and filesystem-based memory/timeline persistence.

### Project Profile

| Attribute | Value |
|-----------|-------|
| **Type** | CLI Tool (Internal Developer Tool) |
| **LLM Backend** | Nvidia NIM API (OpenAI-compatible, free tier) |
| **Target Users** | Software developers who want AI-assisted coding in terminal |
| **Expected Users at Launch** | 1 (single developer) |
| **Expected Users at 1 Year** | 10-100 (if open sourced) |
| **Team Size** | 1 developer |
| **Budget** | Bootstrap ($0 infrastructure) |
| **Timeline** | MVP in 2-4 weeks |
| **Geographic Scope** | Global (cross-platform: Windows, macOS, Linux) |
| **Deployment** | npm package + standalone binaries via pkg |

---

## Technology Decisions

### Core Stack Summary

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
| **TypeScript Runner** | tsx | 4.x | DECIDED |
| **Bundler** | esbuild | 0.21.x | DECIDED |
| **Binary Packager** | pkg | 5.x | DECIDED |
| **Testing** | vitest | 1.x | DECIDED |
| **Linting** | eslint + typescript-eslint | 9.x, 8.x | DECIDED |
| **LLM API** | Nvidia NIM (OpenAI-compatible) | — | DECIDED |
| **CI/CD** | GitHub Actions | — | DECIDED |
| **Distribution** | npm + pkg binaries | — | DECIDED |

---

### 1. Programming Language & Runtime

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **Language** | TypeScript | 5.x | Type safety catches bugs at compile time, excellent IDE support (autocomplete, refactoring), self-documenting code through types, matches Claude Code's implementation approach |
| **Runtime** | Node.js | 20.x LTS | Stable LTS release, cross-platform (Windows/macOS/Linux), massive ecosystem, used by Claude Code, excellent TypeScript support, `pkg` binary packaging works natively |
| **Package Manager** | npm | 10.x | Standard for Node.js, works globally with `npm install -g`, largest package registry |

**Why TypeScript over JavaScript:**
- Compile-time type checking prevents runtime errors in agent tool calls
- Better IDE support for navigating the 12-agent codebase
- Types serve as documentation for agent interfaces and tool schemas
- Matches Claude Code's TypeScript foundation

**Why Node.js over Deno/Bun:**
- `blessed` library is Node.js native and battle-tested
- `pkg` binary packaging has first-class Node.js support
- More community support for Node.js CLI tools
- `npm install -g` works natively without additional tooling

---

### 2. CLI / Terminal UI Framework

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **TUI Framework** | blessed | 0.1.10 | Mature (2012-present, 15k+ stars), cross-platform, complex widget system (boxes, text scrolling, cursor control), supports Claude Code-like UI layout |
| **Color Output** | chalk | 5.x | Simple chainable API, great for styled terminal output, well-maintained |
| **Markdown Rendering** | marked | 12.x | Fast, extensible, renders markdown to ANSI for terminal output |

**Why blessed over alternatives:**

| Alternative | Why NOT Selected |
|------------|------------------|
| ink (React for CLI) | Requires React runtime, overkill for a CLI tool, adds bundle weight |
| bubble-tea (Go) | Requires switching to Go, team is TypeScript-focused |
| Custom ANSI escape codes | Too much boilerplate, reinventing the wheel, error-prone |
| blessed-contrib | Depends on blessed, adds nothing we need |
| node-pty | Too low-level, need widgets not raw PTY |

**blessed Selection Justification:**
- Works on Windows, macOS, Linux without modification
- Supports boxes, text scrolling, cursor control, event-driven input
- Excellent for Claude Code-like UI (left panel, streaming output area, bottom input)
- Well-documented with community TypeScript types
- Used in production by Discord, npm, and other CLI tools

---

### 3. LLM API Integration

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **API Client** | OpenAI SDK | 4.x | Official SDK, handles streaming, tool calls, retries, timeouts |
| **API Compatibility** | OpenAI-compatible | N/A | Nvidia NIM uses OpenAI API format, drop-in compatible |
| **Streaming** | Native fetch / SDK streaming | Built-in | Streaming responses for real-time token-by-token output |

**Implementation Notes:**
- Configure `baseURL` to `https://integrate.api.nvidia.com/v1`
- API key authentication from `NIM_API_KEY` environment variable
- Tool use (function calling) for agent actions (read, write, bash, git, glob)
- Support both streaming and non-streaming modes
- System prompts loaded from `.claude/agents/*.md` files at runtime
- Model: `meta/llama-3.1-8b-instruct` (dot notation REQUIRED — underscore returns 404)

**Why not native fetch:**
- OpenAI SDK handles edge cases (retries, timeouts, streaming delimiters, SSE parsing)
- Better error handling for API errors (rate limits, authentication, context length)
- Tool calling support built-in with proper schema validation
- Well-tested by thousands of production applications

---

### 4. Agent System Components

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **Agent Prompts** | Claude.md format | N/A | Loads from `.claude/agents/*.md` at runtime |
| **Memory System** | Markdown files | `docs/MEMORY.md` | Filesystem-based, simple, works cross-platform |
| **Timeline System** | Markdown files | `docs/TIMELINE.md` | Same as memory, append-only for history |
| **Validation** | zod | 3.x | Runtime type checking for tool inputs and agent outputs |

**Why filesystem-based over database:**
- Simpler — no database setup required in target project
- Git-friendly — commits serve as timeline entries
- Cross-platform — Windows filesystems work without issues
- Human-readable — developers can read/edit memory directly
- Matches Claude Code's file-based approach

---

### 5. Build & Distribution

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **TypeScript Runner** | tsx | 4.x | Fast TypeScript execution, no separate compile step for development |
| **Bundler** | esbuild | 0.21.x | Fastest bundler, creates small bundles, excellent TypeScript support |
| **Binary Packager** | pkg | 5.x | Creates standalone `.exe`/`.app` binaries for Windows, macOS, Linux |
| **Testing** | vitest | 1.x | Fast, Vite-based, excellent TypeScript support, built-in coverage |
| **Lint** | eslint + typescript-eslint | 9.x, 8.x | Code quality, catches errors early, TypeScript-aware rules |

**pkg Configuration:**
- Targets: `node20-win-x64`, `node20-macos-x64`, `node20-linux-x64`
- Assets: Include `.claude` directory for agent prompts
- Output: Binary distributed via npm

**Build Pipeline:**
```
tsc (type check) → esbuild (bundle) → pkg (binary) → npm publish
```

---

### 6. Key Dependencies

```json
{
  "dependencies": {
    "blessed": "^0.1.10",
    "chalk": "^5.3.0",
    "commander": "^12.1.0",
    "fs-extra": "^11.2.0",
    "glob": "^14.0.6",
    "marked": "^12.0.0",
    "openai": "^7.57.0",
    "simple-git": "^4.0.2",
    "zod": "^4.6.7"
  },
  "devDependencies": {
    "@types/node": "^22.13.10",
    "@vitest/coverage-v8": "^5.1.0",
    "esbuild": "^0.28.2",
    "eslint": "^9.4.0",
    "pkg": "^5.8.1",
    "tsx": "^4.23.15",
    "typescript": "^5.4.0",
    "typescript-eslint": "^8.73.0",
    "vitest": "^5.1.0"
  }
}
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLI Entry Point                               │
│                 (src/cli.ts, commander)                          │
└──────────────────────────────────────┬───────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │           blessed TUI               │
                    │      (src/ui/index.ts)              │
                    │  • Main screen layout               │
                    │  • Input box (bottom)               │
                    │  • Output log (scrollable)          │
                    │  • Markdown/ANSI renderer           │
                    └──────────────────┬──────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
     ┌────────▼────────┐   ┌──────────▼──────────┐  ┌─────────▼─────────┐
     │   Agent System  │   │      LLM Client     │  │    Tool System    │
     │  (src/agents/)  │   │   (src/llm/client)  │  │   (src/tools/)    │
     │  • 12 agents    │   │  • OpenAI SDK       │  │  • read           │
     │  • Prompt loader│   │  • NIM API          │  │  • write          │
     │  • Memory       │   │  • Streaming        │  │  • bash           │
     │  • Timeline     │   │  • Tool calling     │  │  • git            │
     └─────────────────┘   └─────────────────────┘  │  • glob           │
                                                     └─────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │      Memory & Timeline              │
                    │   (docs/MEMORY.md, TIMELINE.md)     │
                    └─────────────────────────────────────┘
```

### Data Flow

1. User types input in the blessed TUI input box
2. `commander` parses CLI arguments; `main.ts` orchestrates the flow
3. Agent system loads the appropriate agent prompt from `.claude/agents/*.md`
4. LLM client sends request to Nvidia NIM via OpenAI SDK (streaming)
5. LLM responds with tool calls (function calling) or text
6. Tool system executes the requested action (file read/write, bash, git, glob)
7. Results are fed back to the LLM for the next turn
8. Memory and timeline are updated in `docs/MEMORY.md` and `docs/TIMELINE.md`
9. Output is rendered in the TUI via marked → ANSI → blessed

---

## Directory Structure

```
agent-termo/
├── src/
│   ├── cli.ts              # Commander entry point
│   ├── main.ts             # Main application logic / REPL loop
│   ├── ui/
│   │   ├── index.ts        # UI exports
│   │   ├── screen.ts       # Main blessed screen layout
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
│   │   ├── index.ts        # Memory system exports
│   │   ├── memory.ts       # Memory read/write
│   │   └── timeline.ts     # Timeline append
│   ├── types/
│   │   └── index.ts        # Shared TypeScript types
│   └── utils/
│       ├── index.ts        # Utils exports
│       ├── config.ts       # Config management (env vars)
│       └── logger.ts       # Logging utility
├── .claude/
│   └── agents/             # Agent prompts (loaded at runtime)
│       ├── project-manager.md
│       ├── tech-stack-expert.md
│       └── ...
├── tests/
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── e2e/                # E2E tests
├── scripts/
│   └── build.mjs           # Build script (esbuild + pkg)
├── docs/
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

| Integration | Components | Purpose |
|-------------|-----------|---------|
| **blessed + chalk + marked** | `src/ui/` | Terminal output styling — blessed handles layout, chalk handles colors, marked converts markdown to ANSI |
| **OpenAI SDK + Nvidia NIM** | `src/llm/client.ts` | LLM communication — OpenAI SDK configured with NIM baseURL, streaming responses, tool calling |
| **simple-git + fs-extra** | `src/tools/git.ts`, `src/tools/write.ts` | Git operations and file system operations for code generation |
| **zod + OpenAI SDK** | `src/llm/tools.ts` | Runtime validation of tool inputs before execution |
| **commander + blessed** | `src/cli.ts`, `src/ui/screen.ts` | CLI argument parsing and TUI initialization |
| **Memory/Timeline + Filesystem** | `src/memory/` | Persistent state in `docs/MEMORY.md` and `docs/TIMELINE.md` |

### Critical Dependencies

1. **Prisma → PostgreSQL:** Not applicable — filesystem-based memory
2. **Next.js → Clerk:** Not applicable — CLI tool, no web auth
3. **OpenAI SDK → NVIDIA NIM:** API key from `NIM_API_KEY`, baseURL to NIM endpoint, model `meta/llama-3.1-8b-instruct`
4. **Vercel → GitHub:** Not applicable — distributed via npm + pkg binaries
5. **TanStack Query → tRPC:** Not applicable — CLI tool, no frontend-backend split

---

## Security Considerations

### Defensive (Protecting Agent-Termo)

1. **Bash Execution Sandbox:**
   - Whitelist allowed commands (git, npm, node, pnpm, yarn, tsx, tsc)
   - Configurable via `ALLOWED_COMMANDS` environment variable
   - Timeout on long-running commands (default: 5 minutes)

2. **Path Validation:**
   - Prevent path traversal (no `..` in paths)
   - Restrict operations to project directory
   - Validate file paths against `process.cwd()`

3. **Secrets Management:**
   - API key from `NIM_API_KEY` environment variable
   - Never log API keys or sensitive data
   - `.env` file excluded from git (`.gitignore`)

4. **Input Sanitization:**
   - Validate all tool inputs with zod schemas
   - Sanitize file paths before write operations
   - Escape shell arguments in bash tool

### Offensive (Generated Code Awareness)

1. **Dangerous Operation Warnings:**
   - Detect `rm -rf`, `git push --force`, `chmod 777`
   - Warn before destructive operations
   - Require user confirmation for deletions

2. **User Confirmation:**
   - Before executing bash commands
   - Before overwriting existing files
   - Before git push operations

3. **Credential Exposure:**
   - Scan generated code for hardcoded secrets
   - Warn if API keys or passwords appear in output
   - Suggest environment variables instead

---

## Performance Characteristics

### Expected Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| **Startup time** | <2 seconds | From `agent-termo` command to ready TUI |
| **LLM latency** | 100-500ms per token | Depends on NIM rate limits and model |
| **UI responsiveness** | <50ms | For typing input and screen updates |
| **File operations** | <100ms | For typical file read/write |
| **Memory usage** | <200MB | For typical project session |
| **Bundle size** | <5MB | esbuild-bundled output |

### Optimization Strategies

- Lazy load agent prompts (only when agent is invoked)
- Stream LLM responses as they arrive (token-by-token display)
- Batch file operations where possible
- Use incremental parsing for large files
- Cache directory listings and file stats
- Minimize blessed screen redraws (only update changed regions)

---

## Development Workflow

### Phase 1: CLI Foundation (Days 1-3)

1. Set up project scaffold with TypeScript
2. Implement blessed TUI with basic layout
3. Add chalk styling and marked markdown rendering
4. Create simple readline input
5. Test basic "Hello World" interaction

### Phase 2: LLM Integration (Days 4-6)

1. Integrate OpenAI SDK with NIM endpoint
2. Implement streaming responses
3. Create basic conversation loop
4. Add system prompt from `.claude/agents/`

### Phase 3: Agent System (Days 7-14)

1. Load agent prompts from `.claude/agents/` at runtime
2. Implement tool-based actions (read, write, bash, git, glob)
3. Build agent registry and orchestrator
4. Test single agent invocation
5. Test multi-agent orchestration

### Phase 4: Full Implementation (Days 15-28)

1. Implement all 12 agents
2. Build complete tool system (file IO, bash, git, glob)
3. Implement memory/timeline runtime
4. Add error handling and recovery
5. Polish TUI (dark theme, syntax highlighting, spinners)

### Daily Development Commands

```bash
# Start development server with auto-reload
npm run dev

# Type check
npm run typecheck

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Fix lint issues
npm run lint:fix

# Build for production
npm run build

# Build binaries for all platforms
npm run build:pkg
```

---

## Testing Strategy

### Unit Tests (via vitest)

- Agent prompt parsing and loading
- Tool implementations (read, write, bash, git, glob)
- Config management (environment variables)
- Utility functions (path validation, sanitization)
- LLM client mocking and error handling

### Integration Tests

- LLM client with mock NIM server
- File system operations end-to-end
- Memory/timeline persistence
- Tool calling flow (LLM → tool → result → LLM)

### Manual Testing

- Full CLI interaction test (start → input → output → exit)
- Terminal rendering test (blessed layout, colors, markdown)
- Cross-platform test (Windows, macOS, Linux)
- NIM API connectivity test (streaming, tool calls, rate limits)

### Test Coverage Target

- **Unit tests:** >80% coverage
- **Integration tests:** Critical paths (LLM, tools, memory)
- **E2E tests:** Happy path conversation flow

---

## Distribution

### npm Package

```json
{
  "name": "agent-termo",
  "version": "1.0.9",
  "description": "Terminal-based AI coding agent that replicates Claude Code experience",
  "type": "module",
  "main": "dist/main.js",
  "bin": {
    "agent-termo": "./dist/cli.js"
  },
  "keywords": ["cli", "terminal", "ai", "agent", "coding", "llm", "nvidia", "nim"],
  "license": "MIT",
  "publishConfig": {
    "access": "public"
  },
  "files": ["dist", "src", ".claude"],
  "engines": {
    "node": ">=20.0.0"
  },
  "pkg": {
    "targets": ["node20-win-x64", "node20-macos-x64", "node20-linux-x64"],
    "assets": [".claude/agents/**/*", ".claude/commands/**/*", ".claude/skills/**/*"],
    "outputPath": "dist"
  }
}
```

### Installation Methods

```bash
# From npm registry (production)
npm install -g agent-termo
agent-termo

# From source (development)
git clone <repo>
cd agent-termo
npm install
npm link
agent-termo

# Binary distribution (via pkg)
# Windows: agent-termo-win.exe
# macOS: ./agent-termo-macos
# Linux: ./agent-termo-linux
```

### Distribution Channels

- **npm:** Primary distribution channel (`npm install -g agent-termo`)
- **GitHub Releases:** Binary assets for each release tag
- **Direct download:** Standalone binaries from releases page

---

## Explicitly Rejected Options

### Why Not ink (React for CLI)?

- Overkill for our needs (no complex component state management)
- React runtime adds unnecessary weight to a CLI tool
- More complexity than simpler `blessed` + `chalk`
- Team is not React-focused for CLI development

### Why Not bubble-tea (Go)?

- Team is TypeScript-focused; would require learning Go
- CLI tool doesn't need Go's performance characteristics
- Extra language doesn't add value for this use case
- `pkg` binary packaging is Node.js-native

### Why Not TypeScript with Deno?

- Node.js has a more mature ecosystem for CLI tools
- `blessed` and other CLI libraries work better on Node.js
- `pkg` doesn't support Deno
- `npm install -g` works natively on Node.js without additional tooling

### Why Not Rust?

- Steeper learning curve for the team
- Longer development time for MVP
- CLI tool doesn't need Rust's performance characteristics
- Node.js ecosystem is sufficient for file I/O and terminal UI

### Why Not Python?

- Less type safety than TypeScript (especially for tool schemas)
- CLI tools are less common in the Python ecosystem
- TypeScript matches Claude Code's implementation approach
- Package distribution (`pip install`) is less straightforward for global CLI tools

### Why Not SQLite/PostgreSQL for Memory?

- Overkill for a single-developer CLI tool
- Adds operational complexity (database setup, migrations)
- Filesystem-based memory is git-friendly and human-readable
- Matches Claude Code's file-based memory approach

### Why Not Native fetch for LLM API?

- OpenAI SDK handles edge cases (retries, timeouts, streaming delimiters, SSE parsing)
- Better error handling for API errors (rate limits, authentication, context length)
- Tool calling support built-in with proper schema validation
- Well-tested by thousands of production applications

---

## Setup Commands

```bash
# Initialize project
npm init -y

# Install production dependencies
npm install blessed chalk marked openai zod simple-git commander fs-extra glob

# Install development dependencies
npm install -D typescript tsx esbuild pkg vitest eslint @types/node typescript-eslint

# Set up TypeScript configuration
npx tsc --init

# Create directory structure
mkdir -p src/ui src/agents src/llm src/tools src/memory src/types src/utils
mkdir -p tests/unit tests/integration tests/e2e
mkdir -p .claude/agents scripts docs

# Verify setup
npm run typecheck
npm test
npm run build
```

---

## Version History

| Date | Version | Decision | Rationale | Alternative Considered |
|------|---------|----------|-----------|------------------------|
| 2026-07-04 | 1.0 | Use blessed for TUI | Mature, cross-platform, widget support | ink (React), custom ANSI (more work) |
| 2026-07-04 | 1.0 | Use OpenAI SDK | Official, NIM-compatible, handles tool calls | Native fetch (more edge cases) |
| 2026-07-04 | 1.0 | Use TypeScript | Type safety, matches Claude Code approach | Python (less type safety), Rust (slower dev) |
| 2026-07-04 | 1.0 | Use pkg for binaries | Creates standalone executables | nexe (deprecated), vercel (not for CLI) |
| 2026-07-04 | 1.0 | Use filesystem for memory | Simple, git-friendly, human-readable | SQLite (overkill), Redis (not on target) |
| 2026-07-04 | 1.0 | Use vitest for testing | Fast, Vite-based, TypeScript-native | Jest (slower), Mocha (more config) |
| 2026-07-04 | 1.0 | Use esbuild for bundling | Fastest bundler, small bundles | webpack (slower), rollup (more config) |
| 2026-07-04 | 1.1 | Model: meta/llama-3.1-8b-instruct | NIM API verified working (HTTP 200) | meta/llama-3_1-70b-instruct (404 with underscore) |

---

## Next Steps

1. **Backend-architecture-designer** creates runtime architecture
2. **Frontend-planner** creates CLI behavior specification
3. **Dev-environment-initiator** sets up local development environment
4. **Backend-expert** implements LLM integration with NIM
5. **Frontend-expert** implements TUI with blessed
6. **Agent-system-implementer** builds the 12-agent system
7. **Tool-system-implementer** builds file IO, bash, git, glob tools
8. **Testing-expert** implements unit and integration tests
9. **Deployment-expert** sets up npm publishing and binary distribution
