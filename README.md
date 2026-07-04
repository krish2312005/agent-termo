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

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Add your Nvidia NIM API key to `.env`:
   ```
   NIM_API_KEY=your_api_key_here
   ```

3. Get your free API key from [https://build.nvidia.com/](https://build.nvidia.com/)

## Usage

### Start the tool

```bash
agent-termo
```

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
│   ├── ui/              # Terminal UI (blessed)
│   ├── agents/          # 12 agent implementations
│   ├── llm/             # OpenAI/NIM integration
│   ├── tools/           # File, bash, git tools
│   └── memory/          # Memory system
├── .claude/agents/      # Agent prompts
├── tests/               # Test suites
└── docs/                # Documentation
```

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