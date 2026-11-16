# Agent-Termo

Terminal-based AI coding agent that replicates Claude Code experience.

## Overview

Agent-Termo is a CLI tool that uses Nvidia NIM APIs to provide AI-assisted coding capabilities directly in your terminal. It implements the 12-agent workflow system for autonomous software development.

## Features

- **Interactive Terminal UI**: Beautiful dark-themed interface with markdown rendering
- **12-Agent System**: Complete workflow from planning to deployment
- **Streaming Responses**: Real-time AI output as tokens arrive
- **Tool Execution**: File operations, bash commands, git integration
- **Memory & Timeline**: Persistent project context across sessions

## Installation

### From npm (once published)

```bash
npm install -g agent-termo
agent-termo
```

### From source

```bash
git clone <repository>
cd agent-termo
npm install
npm run dev
```

## Prerequisites

- Node.js 20.x or higher
- Nvidia NIM API key (free tier available at https://build.nvidia.com/)

## Configuration

On the first launch, Agent-Termo prompts you to enter your NVIDIA NIM API key. The input is hidden, and the key is saved in your user configuration at `~/.agent-termo/config.json` so you are not prompted again.

Get a free API key from [https://build.nvidia.com/](https://build.nvidia.com/).

You can also provide `NIM_API_KEY` through your shell environment or a project `.env` file. Existing environment variables take precedence over the saved key.

## Usage

### Start the tool

```bash
agent-termo
```

### The terminal UI

Like Claude Code, the input box stays pinned to the bottom of the terminal while the conversation scrolls above it. The status line under the box shows the active model and project.

| Key | Action |
|-----|--------|
| `Enter` | Send |
| `↑` / `↓` | Input history |
| `Tab` | Complete a `/command` (matching commands show on the status line as you type) |
| `←` `→`, `Ctrl+A` / `Ctrl+E`, `Ctrl+←` / `Ctrl+→` | Move by character, to line start/end, by word |
| `Ctrl+W` / `Ctrl+U` / `Ctrl+K` | Delete word / to line start / to line end |
| `Ctrl+C` | Clear the line; quit when the line is empty |

Pasted text is kept on one line (newlines become spaces). Terminals smaller than 12 rows × 40 columns, and non-interactive input, fall back to a plain `>` prompt.

### Choosing a model

Agent-Termo works with any chat model on NVIDIA NIM.

- `/model` opens a picker with the models your API key can use (fetched live from NIM; embedding and reranking models are hidden). Use `↑`/`↓`, type to filter, `Enter` to select, `Esc` to cancel. Type an `org/name` ID that isn't listed to use it as typed.
- `/model <model-id>` switches directly, e.g. `/model meta/llama-3.3-70b-instruct`.
- `agent-termo --model <model-id>` picks the model for one run.

Your selection is saved in `~/.agent-termo/config.json` and used next time. Order of precedence: `--model` flag, then the saved `/model` choice, then `NIM_MODEL` from `.env`, then the built-in default. If the live list can't be fetched, a built-in list of suggestions is shown instead.

### Tell it what to build

```
> Build a REST API with authentication
```

The tool will:
1. Analyze requirements with project-manager
2. Design architecture with backend-architecture-designer
3. Implement the code with backend-expert
4. Test with test-agent
5. Deploy with deployment-expert

## Architecture

```
agent-termo/
├── src/
│   ├── cli.ts           # Commander entry point
│   ├── main.ts          # Main application
│   ├── ui/              # Terminal UI (output rendering, pinned input box, model picker)
│   ├── agents/          # Agent loader and system prompt builder
│   ├── llm/             # OpenAI/NIM integration, model catalogue
│   ├── tools/           # File, bash, git tools
│   └── memory/          # Project memory, timeline and session log
├── .claude/agents/      # Bundled agent prompts copied into projects
├── tests/               # Test suites
└── docs/                # This repository's project documentation
```

## Project file layout

Agent-Termo keeps two separate areas in every project it runs in:

```
<project>/
├── docs/
│   ├── MEMORY.md        # Shared project memory (agents read and write this)
│   └── TIMELINE.md      # Shared project timeline (agents read and write this)
└── .agent-termo/
    ├── agents/          # Project agent definitions
    ├── commands/        # Project slash commands
    └── logs/            # Private session and runtime logs (not project docs)
```

`docs/MEMORY.md` and `docs/TIMELINE.md` are the only memory/timeline files the
project and its agents use. `.agent-termo/` holds configuration and private
logs; it never contains a second `docs/` folder.

## Technology Stack

- **Language**: TypeScript 5.x
- **Runtime**: Node.js 20.x LTS
- **TUI Framework**: blessed
- **LLM Client**: OpenAI SDK (with Nvidia NIM)
- **Build**: esbuild + pkg
- **Testing**: vitest

See [docs/TECH_STACK.md](docs/TECH_STACK.md) for complete technology decisions.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Test
npm test

# Build
npm run build

# Build binaries (Windows, macOS, Linux)
npm run build:pkg
```

## Project Structure

This project uses the **12-agent system** defined in CLAUDE.md:

1. project-manager - Orchestrates workflows
2. tech-stack-expert - Technology selection (DONE)
3. uiux-designer - Visual design
4. backend-architecture-designer - API/database design
5. frontend-planner - Frontend architecture
6. frontend-expert - Frontend implementation
7. backend-expert - Backend implementation
8. dev-environment-initiator - Development setup
9. security-expert - Security auditing
10. test-agent - Testing strategy
11. git-manager - Version control
12. deployment-expert - Production deployment

## Documentation

- [CLAUDE.md](CLAUDE.md) - Complete agent system specification
- [docs/TECH_STACK.md](docs/TECH_STACK.md) - Technology decisions
- [docs/MEMORY.md](docs/MEMORY.md) - Project memory
- [docs/TIMELINE.md](docs/TIMELINE.md) - Activity log
- [docs/PROJECT_PROGRESS.md](docs/PROJECT_PROGRESS.md) - Implementation roadmap

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT

## Acknowledgments

- Inspired by Claude Code and Anthropic's Claude
- Built with the 12-agent workflow system
- Powered by Nvidia NIM APIs