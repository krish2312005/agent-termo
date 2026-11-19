<div align="center">

# Agent-Termo

<p>
  <a href="https://github.com/krish2312005/agent-termo">
    <img src="https://img.shields.io/badge/Agent--Termo-AI%20Coding%20Agent-7C3AED?style=for-the-badge&logo=gnubash&logoColor=white" alt="Agent-Termo" />
  </a>
</p>

<p>
  <a href="https://www.npmjs.com/package/agent-termo">
    <img src="https://img.shields.io/npm/v/agent-termo?style=flat-square&logo=npm" alt="npm version" />
  </a>
  <a href="https://www.npmjs.com/package/agent-termo">
    <img src="https://img.shields.io/npm/dw/agent-termo?style=flat-square&logo=npm" alt="npm downloads" />
  </a>
  <a href="https://github.com/krish2312005/agent-termo/stargazers">
    <img src="https://img.shields.io/github/stars/krish2312005/agent-termo?style=flat-square&logo=github" alt="GitHub stars" />
  </a>
  <a href="https://github.com/krish2312005/agent-termo/blob/master/package.json">
    <img src="https://img.shields.io/node/v/agent-termo?style=flat-square&logo=node.js" alt="Node.js version" />
  </a>
  <a href="https://github.com/krish2312005/agent-termo/blob/master/package.json">
    <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT license" />
  </a>
</p>

**An AI coding agent that works directly in your terminal.**

Build, debug, refactor, and manage software projects with natural language, specialist agents, and tools that operate in your project workspace.

<p>
  <a href="https://github.com/krish2312005/agent-termo"><strong>GitHub Repository</strong></a>
  ·
  <a href="https://www.npmjs.com/package/agent-termo"><strong>npm Package</strong></a>
  ·
  <a href="./docs/ROUTE_MAP.md"><strong>CLI Reference</strong></a>
  ·
  <a href="./docs/architecture.md"><strong>Architecture</strong></a>
</p>

</div>

---

## What is Agent-Termo?

**Agent-Termo** is a terminal-based AI coding agent powered by NVIDIA NIM APIs. It brings AI-assisted software development into your existing project workspace.

Describe a task in plain language and Agent-Termo can inspect your codebase, read and edit files, run terminal commands, work with Git, and coordinate focused tasks through specialist agents. Its interactive terminal interface streams responses and tool activity while keeping the input area available at the bottom of the screen.

Agent-Termo is designed around a reviewable workflow: file changes can be previewed as diffs before they are applied, and permission modes let you choose how much approval is required.

> [!IMPORTANT]
> **Agent-Termo requires an NVIDIA NIM API key.**
>
> Create an API key at [build.nvidia.com](https://build.nvidia.com/). Agent-Termo uses NVIDIA NIM's OpenAI-compatible API endpoint.

## Features

| Feature | Description |
|---|---|
| **Interactive Terminal UI** | Scrollable conversation, pinned multi-line input, streaming output, and command completion. |
| **AI Coding Workflow** | Ask the agent to build, inspect, debug, refactor, test, or explain a project. |
| **NVIDIA NIM Models** | Connect to chat models available to your NVIDIA NIM API key. |
| **Live Model Picker** | Browse the live model catalogue or enter a model ID directly. |
| **Thinking Capacity** | Choose off, auto, low, medium, or high where supported by the model. |
| **File Tools** | Read, create, edit, delete, glob, and search project files. |
| **Diff Review** | Preview proposed file changes and accept or reject them in Ask mode. |
| **Permission Modes** | Choose Ask, Files-auto, or Auto behavior for file and command approvals. |
| **Terminal Execution** | Run shell commands and inspect live command output in the terminal panel. |
| **Git Integration** | Inspect status and history, commit changes, and push the current branch. |
| **Custom Agents** | Define project-specific specialist agents with Markdown files. |
| **Agent Delegation** | Delegate focused work to specialist agents and review their results. |
| **Custom Slash Commands** | Save reusable project workflows as Markdown commands. |
| **Project Memory** | Maintain shared project context and a chronological project timeline. |
| **Task Continuity** | Resume an interrupted task with its conversation and tool history. |
| **Plan Mode** | Analyze a task, inspect likely affected files, review risks and ordered steps, then approve execution and track progress. |
| **Checkpoints & Undo** | Snapshot Agent-Termo-managed file changes, restore a checkpoint safely, and redo an undo when files have not changed independently. |
| **Context Mentions** | Attach discovered project files and activate agents with @ mentions. |
| **Conversation Tools** | Inspect message history and compact older conversation context. |

---

## Quick Start

### Requirements

- Node.js 20.x or higher
- npm
- An NVIDIA NIM API key
- An interactive terminal for the full-screen interface

### 1. Install Agent-Termo

~~~bash
npm install -g agent-termo
~~~

### 2. Move into your project

~~~bash
cd /path/to/your-project
~~~

### 3. Start Agent-Termo

~~~bash
agent-termo
~~~

On first launch, Agent-Termo asks for your NVIDIA NIM API key if one is not already configured. The key prompt hides your input, and the key is saved in your user configuration for subsequent sessions.

### 4. Give it a task

~~~text
Build a REST API with user registration, login, authentication,
and PostgreSQL integration. Inspect the existing project first
and follow its current conventions.
~~~

You can also ask Agent-Termo to understand a codebase before making changes:

~~~text
Analyze this project, explain its architecture, identify potential
problems, and recommend the most important improvements.
~~~

---

## Installation from Source

To work with the repository source:

~~~bash
# Clone the repository
git clone https://github.com/krish2312005/agent-termo.git

# Enter the project
cd agent-termo

# Install dependencies
npm install

# Create your local environment file
cp .env.example .env

# Build the application
npm run build

# Start the CLI in development mode
npm run dev
~~~

### Configure NVIDIA NIM

Open the .env file and set your API key:

~~~env
NIM_API_KEY=nvapi-YOUR_API_KEY
NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NIM_MODEL=meta/llama-3.1-8b-instruct
~~~

Get an API key from [NVIDIA Build](https://build.nvidia.com/).

Model identifiers must match the IDs exposed by NVIDIA NIM. Use the model's actual dotted version notation:

~~~text
Correct:   meta/llama-3.1-8b-instruct
Incorrect: meta/llama-3_1-8b-instruct
~~~

### Environment Variables

| Variable | Purpose | Default / Example |
|---|---|---|
| NIM_API_KEY | NVIDIA NIM API key. | Required unless saved locally. |
| NIM_BASE_URL | OpenAI-compatible API base URL. | https://integrate.api.nvidia.com/v1 |
| NIM_MODEL | Model ID to use. | Set in .env; otherwise the built-in default is used. |
| LOG_LEVEL | Logging verbosity. | info |
| AGENT_TERMO_PERMISSION_MODE | Initial permission mode. | ask, files, or auto |
| LLM_TIMEOUT | LLM request timeout, in milliseconds. | 120000 |
| BASH_TIMEOUT | Shell command timeout, in milliseconds. | 300000 |

Values already present in the process environment are not overwritten by .env loading. A model selected with /model is saved and reused in later sessions; the --model CLI option overrides the saved selection for that run.

### API Key and User Configuration

By default, Agent-Termo stores user-level settings in:

~~~text
~/.agent-termo/config.json
~~~

This file can hold the saved NVIDIA NIM API key, selected model, thinking capacity, and permission mode. The application creates the configuration directory and restricts file permissions on supported Unix systems.

Do not commit your .env file or share your API key.

---

## CLI Usage

### Start in the current directory

~~~bash
agent-termo
~~~

### Start in a specific project directory

~~~bash
agent-termo /path/to/project
~~~

### Select a model for one run

~~~bash
agent-termo --model meta/llama-3.3-70b-instruct
~~~

### Supply an API key for one run

~~~bash
agent-termo --api-key nvapi-YOUR_API_KEY
~~~

### Enable debug logging

~~~bash
agent-termo --debug
~~~

### Automatically approve operations

~~~bash
agent-termo --yes
~~~

> [!WARNING]
> --yes enables Auto permission behavior. File modifications and terminal operations can proceed without the usual interactive approval prompts. Use it only when you trust the task and understand the commands the agent may run.

### CLI Options

| Option | Description |
|---|---|
| -h, --help | Display CLI help. |
| -k, --api-key <key> | Provide an NVIDIA NIM API key. |
| -m, --model <model> | Select the model for the current run. |
| --debug | Enable debug logging. |
| -y, --yes, --auto-approve | Enable Auto permission behavior. |

### Initialize a Project

Initialize Agent-Termo in the current directory:

~~~bash
agent-termo init
~~~

Initialize a specific directory:

~~~bash
agent-termo init ./my-project
~~~

Initialization creates the project memory and timeline files, prepares the .agent-termo/ runtime directories, and installs the bundled default agents, slash commands, workflow, and agent template without overwriting existing project definitions. It also creates a starter TERMO.md (only when one does not already exist) and a src/ directory if needed.

---

## The Terminal Interface

The interface is designed to keep the conversation readable while leaving the input area pinned to the bottom of the terminal.

It includes:

- Scrollable conversation output and streamed assistant responses.
- A multi-line input box that grows as you type.
- Slash-command, agent, and file completion suggestions.
- Model, thinking, usage, project, and permission status.
- Inline tool activity and file-change previews.
- A terminal panel that can be opened to inspect live command output.

### Keyboard Shortcuts

| Key | Action |
|---|---|
| Enter | Submit the current message. |
| Shift + Enter | Insert a new line. |
| Tab | Accept a completion suggestion. |
| Up / Down | Navigate input history or completion suggestions. |
| Escape | Cancel the current AI response. |
| Ctrl + C | Interrupt the current response or operation. |
| Ctrl + D | Exit the session. |
| Ctrl + L | Clear the screen. |
| Ctrl + O | Toggle the terminal output panel. |
| Ctrl + T | Toggle the terminal output panel. |

### Mention Files and Agents

Use @ to attach a discovered project file or invoke a custom agent.

~~~text
Explain @src/main.ts

Review @src/llm/client.ts and identify possible bugs.

@code-reviewer Review the authentication implementation.
~~~

File mentions are resolved against the project files discovered by Agent-Termo. The file content is attached to the current request as context.

---

## Model Selection and Thinking

### Choose a Model

Open the interactive NVIDIA NIM model picker:

~~~text
/model
~~~

Or switch directly to a model ID:

~~~text
/model meta/llama-3.3-70b-instruct
~~~

The model picker fetches available models from NVIDIA NIM, filters out obvious non-chat model categories, and places curated suggestions before the remaining chat models. When the live catalogue cannot be fetched, Agent-Termo displays its built-in suggestions; you can also enter a model ID manually.

Your selected model is saved for future sessions.

### Choose Thinking Capacity

Open the thinking selector:

~~~text
/thinking
~~~

Or set a mode directly:

~~~text
/thinking high
~~~

| Mode | Description |
|---|---|
| off | Request concise / no-thinking behavior where the model supports it. |
| auto | Let the selected model decide. |
| low | Short, focused reasoning capacity. |
| medium | Moderate reasoning capacity. |
| high | Higher reasoning capacity for more involved tasks. |

The effect of these settings depends on the selected model and its support for the corresponding API behavior.

---

## Permission System

Agent-Termo lets you decide how file changes and terminal operations are approved.

Switch permission modes inside the REPL:

~~~text
/permissions
~~~

You can also select a mode explicitly:

~~~text
/permissions ask
/permissions files
/permissions auto
~~~

### Permission Modes

| Mode | File Changes | Terminal and Git Commit / Push |
|---|---|---|
| ask | Show a proposed change and request approval. | Request approval. |
| files | Automatically apply proposed file changes. | Request approval. |
| auto | Automatically apply proposed file changes. | Run without approval prompts. |

**Ask** is the default. When the agent proposes a file write, edit, or deletion, Agent-Termo displays a diff so you can accept or reject the change.

For terminal commands and Git commit/push operations, you can approve an operation once or remember that exact operation for the project. Remembered approvals are stored in:

~~~text
.agent-termo/permissions.json
~~~

> [!WARNING]
> Auto mode removes interactive approval prompts for file changes and terminal operations. Review agent instructions and use this mode only in a workspace where you are comfortable with automated changes and command execution.

---

## Slash Commands

Use /help inside Agent-Termo to display the available commands.

| Command | Description |
|---|---|
| /help | Display available commands. |
| /clear | Clear the conversation and screen. |
| /sessions | List saved conversations for the current project. |
| /resume [id] | Choose or reopen a saved conversation by ID. |
| /fork [id] | Fork the current or a saved conversation into a new session. |
| /plan <task> | Analyze a task and create an execution plan without changing files. |
| /plan | Display the current plan and step progress. |
| /plan approve | Approve the draft plan and start execution. |
| /plan cancel | Cancel the current draft or execution plan. |
| /checkpoint [label] | Create a manual checkpoint for subsequent Agent-Termo file changes. |
| /checkpoints | List automatic, plan, and manual checkpoints. |
| /undo [id] | Preview and restore the latest or selected checkpoint. |
| /redo | Preview and reapply the most recently undone checkpoint. |

| /memory | Display shared project memory. |
| /timeline | Display the shared project timeline. |
| /model | Open the model picker or switch to a specified model. |
| /thinking | Open the thinking-capacity picker or set a mode. |
| /permissions | Cycle permission modes or select ask, files, or auto. |
| /agents | List and select available agents. |
| /skill | Discover, create, import, use, inspect, and delete skills. |
| /agent <name> | Activate a named custom agent. |
| /agent-folder | Create or refresh the project agent and command folders. |
| /goal <text> | Set the current goal; /goal displays it. |
| /status | Show project, model, thinking, permission, token, agent, goal, and message status. |
| /terminal | Show terminal-session status. |
| /terminal list | Show the current or most recent terminal command. |
| /terminal kill | Stop a running terminal command. |
| /context | Show context information and project/runtime paths. |
| /compact | Compact older conversation context. |
| /continue | Resume an interrupted task. |
| /report [path] | Analyze the project and write a Markdown report. |
| /history [count] | Display recent conversation messages. |
| /subagents | Show delegated sub-agent activity. |
| /exit | Exit Agent-Termo. |

### Checkpoints and Rollback

Agent-Termo creates an automatic checkpoint before applying the first file change in a task. Checkpoints preserve the original and resulting contents of files changed through Agent-Termo's file-write, file-edit, and file-delete tools. Manual checkpoints keep collecting those file changes until they are undone. Snapshot data is stored privately in `.agent-termo/checkpoints/`.

Undo and redo first verify that every affected file still matches the expected contents and file mode. If a file was edited independently, the operation stops rather than overwriting that work.

**Scope limitation:** shell commands, scripts, MCP tools, external applications, and other processes that modify files are not captured by this first version. Use Git commits for those changes; an Agent-Termo checkpoint is not a full-project or Git-history backup.

The input completion system also discovers project-defined slash commands from .agent-termo/commands/.

---

## Agents and Delegation

Agent-Termo can load specialist agents from Markdown definitions in the project. Each agent provides focused instructions, a description, and optional tool metadata.

### Agent Directory

Project agents live here:

~~~text
.agent-termo/
└── agents/
    ├── code-reviewer.md
    ├── frontend-specialist.md
    └── backend-specialist.md
~~~

Create the directory and add your own Markdown agent definitions:

~~~bash
mkdir -p .agent-termo/agents
~~~

Example code-reviewer.md:

~~~markdown
---
description: Reviews code for bugs, security issues, and maintainability.
tools: [file:read, file:glob, grep]
---

You are a specialist code reviewer.

Review the requested code for:
1. Correctness and possible bugs.
2. Security concerns.
3. Performance problems.
4. Maintainability and readability.

Provide actionable findings with file references.
Do not modify files unless the user asks you to.
~~~

List and select agents:

~~~text
/agents
~~~

Activate a specific agent:

~~~text
/agent code-reviewer
~~~

Or mention it in a request:

~~~text
@code-reviewer Review the current authentication implementation.
~~~

### Delegate Focused Work

The agent can delegate a focused task to another configured specialist and use the returned findings as part of the overall workflow. Independent delegation requests can run in parallel.

For example, ask Agent-Termo:

~~~text
Review the application. Delegate the frontend review and backend
review to the appropriate specialist agents, then combine the findings.
~~~

A delegated agent receives its own task context and tool access, but cannot recursively delegate to another agent.

---

## MCP Servers

Connect local stdio and remote Streamable HTTP MCP servers. See [MCP setup and CLI commands](./docs/MCP.md).

## Custom Slash Commands

Custom slash commands let you save repeatable instructions for a project.

Create the command directory:

~~~bash
mkdir -p .agent-termo/commands
~~~

Create .agent-termo/commands/review.md:

~~~markdown
---
description: Review the current project for potential issues.
---

Inspect the project and identify:

1. Potential bugs.
2. Code quality issues.
3. Security concerns.
4. Performance improvements.

Provide actionable recommendations.

Additional instructions:
$ARGUMENTS
~~~

Run the custom command inside Agent-Termo:

~~~text
/review
~~~

Arguments supplied after the command name are available through $ARGUMENTS or $ARGS.

---

## Skills

Agent-Termo supports the standard `SKILL.md` folder format. Skills can contain focused instructions and supporting files such as references, examples, or scripts. The full instructions are loaded only when a skill is selected or the model determines that the skill matches the request.

### Skill locations

New skills created by Agent-Termo use these locations:

```text
project/
└── .agent-termo/
    └── skills/
        └── api-review/
            ├── SKILL.md
            └── references/
                └── checklist.md

~/.agent-termo/
└── skills/
    └── personal-workflow/
        └── SKILL.md
```

Agent-Termo also discovers existing skills without moving them from these compatible locations:

| Scope | Agent-Termo | Codex | Claude Code |
|---|---|---|---|
| Project | `.agent-termo/skills/` | `.agents/skills/` | `.claude/skills/` |
| User | `~/.agent-termo/skills/` | `~/.agents/skills/` | `~/.claude/skills/` |

Each skill is a directory containing `SKILL.md`. Its YAML frontmatter should include a name and a concise description. Keep supporting files in the skill folder and refer to them with relative paths.

### Manage skills

Open the interactive manager:

```text
/skill
```

Or use a command directly:

| Command | Description |
|---|---|
| `/skill list` | List installed project and user skills. Add `--project` or `--global` to filter by scope. |
| `/skill add api-review` | Create a project skill with a starter `SKILL.md`. |
| `/skill add personal-workflow --global` | Create a user-level skill available across projects. |
| `/skill import ./path/to/skill` | Import a local skill folder, including supporting files. |
| `/skill install ./path/to/skill --global` | Alias for importing into user-level storage. |
| `/skill show api-review` | Display a skill's `SKILL.md`. |
| `/skill refresh` | Reload the skill catalog after editing skill files during a session. |
| `/skill use api-review Review the current API` | Run a request using the selected skill instructions. |
| `/skill delete api-review` | Delete a selected skill after confirmation. |

Quote import paths that contain spaces. Deletion always asks for confirmation. Imported skills are copied into Agent-Termo's native directory; the original folder is not modified.
Project skills in `.agent-termo/skills/` are intentionally tracked by Git so a project can share them; other `.agent-termo/` runtime state remains ignored.

### Skill frontmatter

```markdown
---
name: api-review
description: Reviews API contracts, validation, and endpoint security.
---

# API Review

Inspect the API before making changes. Check request validation, authorization,
response consistency, and regression tests.

Read supporting references only when they are needed:
- references/security-checklist.md
```

The model receives a compact list of skill names and descriptions. When a skill matches a task, it can load `SKILL.md` or a supporting file through the read-only `skill:read` tool. This avoids adding every skill's full text to every prompt.

Two standard frontmatter options are supported:

- `disable-model-invocation: true` hides a skill from automatic model selection while keeping it visible in the manager.
- `user-invocable: false` prevents the skill from being selected through `/skill use`.

---

## Project Instructions (TERMO.md)

Agent-Termo automatically loads persistent instructions from `TERMO.md` files when a session starts. It checks the user-level `~/.agent-termo/TERMO.md`, then project and ancestor `TERMO.md` files, with `TERMO.local.md` files loaded after the matching project instructions. The project can also keep its main instructions at `.agent-termo/TERMO.md`.

Use Markdown headings and concise, concrete rules. Additional files can be imported with `@relative/path.md` or an absolute path. Imports are resolved relative to the file containing the import, can be nested up to four levels, and are skipped inside inline code and fenced code blocks. For safety, imports are limited to the current project and `~/.agent-termo/`.

Run `agent-termo init` or start Agent-Termo in a project to create a starter `TERMO.md` (without overwriting an existing one). The instructions are added to both the main agent and delegated sub-agent prompts.

## Project Memory and Runtime Files

Agent-Termo separates shared project documentation from private runtime information.

### Shared Project Documentation

~~~text
project/
└── docs/
    ├── MEMORY.md
    └── TIMELINE.md
~~~

| File | Purpose |
|---|---|
| docs/MEMORY.md | Shared project context and important information used by agents. |
| docs/TIMELINE.md | Chronological record of project activity. |

These files are shared project documents and can be read or updated by the agent.

The default specialist workflow is installed at `.agent-termo/workflow.md`. Bundled slash commands use this Agent-Termo workflow file rather than requiring a `.claude/workflow.md` file.

### Agent-Termo Runtime Directory

~~~text
project/
└── .agent-termo/
    ├── agents/
    ├── commands/
    ├── skills/
    ├── sessions/          # private conversation snapshots
    ├── logs/
    │   ├── session.md
    │   └── timeline.md
    └── permissions.json
~~~

| Path | Purpose |
|---|---|
| .agent-termo/agents/ | Project-specific agent definitions. |
| .agent-termo/commands/ | Project-specific slash commands. |
| .agent-termo/skills/ | Project skills and their supporting files. |
| .agent-termo/sessions/ | Private, resumable conversation snapshots including tool calls and results. |
| .agent-termo/logs/session.md | Private session history used for continuity. |
| .agent-termo/logs/timeline.md | Private runtime activity log. |
| .agent-termo/permissions.json | Remembered command approvals. |

The shared project memory and timeline remain in docs/. Private session and runtime logs are kept in .agent-termo/logs/.

### Saved Conversations

Each interactive conversation is saved automatically as a private JSON snapshot under `.agent-termo/sessions/`. Snapshots include the conversation transcript, native tool calls and results, selected model, thinking capacity, active agent, current goal, and resumable task state. The most recently updated session for the project is restored automatically at startup.

~~~text
/sessions
/resume
/resume <session-id>
/fork
/fork <session-id>
~~~

`/resume` without an ID opens a picker. `/fork` creates and switches to an independent copy of the current session; `/fork <session-id>` branches another saved session. Use `/sessions` to find IDs. Sessions remain local to the project and are excluded from Git.

### Resume Interrupted Work

When a task is interrupted, use:

~~~text
/continue
~~~

Agent-Termo retains the conversation and tool results needed to resume from the last completed action. It verifies an action that may have been in progress before continuing, rather than blindly restarting the entire task.

### Manage Conversation Context

~~~text
/history
~~~

Displays recent conversation messages.

~~~text
/compact
~~~

Summarizes older conversation context while preserving recent messages.

~~~text
/context
~~~

Displays context statistics and relevant project paths.

---

## Architecture

Agent-Termo is written in TypeScript and uses a modular CLI architecture.

~~~text
agent-termo/
├── src/
│   ├── cli.ts                 # CLI entry point and arguments
│   ├── main.ts                # REPL and task orchestration
│   ├── agents/
│   │   └── index.ts           # Agent loading and system prompts
│   ├── diff/
│   │   └── index.ts           # Proposed file changes and diffs
│   ├── llm/
│   │   ├── client.ts          # NVIDIA NIM / OpenAI-compatible client
│   │   ├── models.ts          # Curated and live model catalogue
│   │   └── tools.ts           # Model-facing tool definitions
│   ├── memory/
│   │   └── index.ts           # Memory, timeline, and session logs
│   ├── runtime/
│   │   ├── agent-folder.ts    # Project agents and commands
│   │   ├── paths.ts           # Canonical runtime paths
│   │   ├── sessions.ts        # Persistent conversation snapshots
│   │   └── permissions.ts     # Remembered command approvals
│   ├── tools/
│   │   └── index.ts           # File, shell, search, and Git tools
│   ├── ui/
│   │   ├── index.ts           # Terminal output and UI components
│   │   └── screen.ts          # Screen layout and keyboard input
│   ├── types/
│   │   └── index.ts           # Shared TypeScript types
│   └── utils/
│       ├── ansi.ts            # ANSI utilities
│       ├── config.ts          # Environment and user configuration
│       └── shell.ts           # Shell resolution
├── scripts/
│   ├── build.mjs              # esbuild build script
│   └── test-nim.mjs           # NVIDIA NIM API validation
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   ├── architecture.md
│   ├── TECH_STACK.md
│   ├── DESIGN_SYSTEM.md
│   ├── BACKEND_ARCHITECTURE.md
│   ├── FRONTEND_ARCHITECTURE.md
│   ├── ROUTE_MAP.md
│   ├── DEV_SETUP.md
│   ├── MEMORY.md
│   ├── TIMELINE.md
│   └── PROJECT_PROGRESS.md
├── .env.example
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
~~~

### Core Components

| Component | Responsibility |
|---|---|
| cli.ts | Starts Agent-Termo, handles CLI options, and initializes projects. |
| main.ts | Runs the interactive session, processes messages, and coordinates tools and agents. |
| agents/ | Loads agent definitions and builds system prompts. |
| llm/ | Connects to NVIDIA NIM, selects models, and defines model-facing tools. |
| tools/ | Implements file operations, shell execution, search, and Git integration. |
| runtime/ | Manages project directories, agent files, commands, and permissions. |
| memory/ | Reads and writes shared memory, timelines, and private session logs. |
| ui/ | Handles terminal rendering, input, completion, and live command output. |
| diff/ | Builds proposed file changes and applies approved changes. |
| utils/ | Provides configuration and shell utilities. |

---

## Technology Stack

| Technology | Purpose |
|---|---|
| **TypeScript** | Main programming language. |
| **Node.js** | Runtime environment (Node.js 20+). |
| **Chalk** | Terminal colors and styling. |
| **Commander** | CLI argument parsing. |
| **OpenAI SDK** | OpenAI-compatible NVIDIA NIM API client. |
| **simple-git** | Git operations. |
| **glob** | Project file matching. |
| **Zod** | Schema validation. |
| **esbuild** | Application bundling. |
| **Vitest** | Unit and integration testing. |
| **ESLint** | Linting and code quality. |

See [docs/TECH_STACK.md](./docs/TECH_STACK.md) for the technology decisions and [docs/architecture.md](./docs/architecture.md) for the system architecture.

---

## Development

### Install Dependencies

~~~bash
npm install
~~~

### Run in Development Mode

~~~bash
npm run dev
~~~

### Build

~~~bash
npm run build
~~~

### Type Check

~~~bash
npm run typecheck
~~~

### Run Tests

~~~bash
npm test
~~~

### Test Watch Mode

~~~bash
npm run test:watch
~~~

### Test Coverage

~~~bash
npm run test:coverage
~~~

### Lint

~~~bash
npm run lint
~~~

### Available npm Scripts

| Script | Description |
|---|---|
| npm run dev | Run the CLI using tsx watch mode. |
| npm run build | Bundle the CLI and main application into dist/. |
| npm run build:tsc | Run the TypeScript compiler. |
| npm run build:esbuild | Run the esbuild build script directly. |
| npm run build:pkg | Package executable builds using pkg. |
| npm run typecheck | Type-check without emitting output. |
| npm test | Run the test suite once. |
| npm run test:watch | Run tests in watch mode. |
| npm run test:coverage | Run tests with coverage. |
| npm run lint | Run ESLint against the source. |
| npm run lint:fix | Apply supported ESLint fixes. |

### Test the NVIDIA NIM Connection

The repository includes a helper script:

~~~bash
node scripts/test-nim.mjs
~~~

It sends a test request to NVIDIA NIM using the configured environment and reports the response.

---

## Troubleshooting

### NVIDIA NIM Authentication Error

Check that the API key is valid and available to Agent-Termo:

~~~bash
echo "$NIM_API_KEY"
~~~

PowerShell:

~~~powershell
echo $env:NIM_API_KEY
~~~

You can also remove the environment variable and start Agent-Termo interactively to enter a key when prompted.

### HTTP 404 — Model Not Found

The selected model ID may not be available to your NVIDIA NIM account. Open the model picker and choose a model returned by the live catalogue:

~~~text
/model
~~~

Also check the spelling and punctuation in your model ID.

### HTTP 429 — Rate Limit

NVIDIA NIM may reject requests when a model or API key reaches a rate or usage limit. Check your NVIDIA NIM account and model availability, then retry when the limit permits. Agent-Termo retries certain transient provider and network errors automatically, but repeated rate limits may still require waiting or selecting another available model.

### Terminal Interface Does Not Render Correctly

Use a modern terminal emulator that supports ANSI escape sequences. The full-screen interface requires a terminal at least 40 columns wide and 12 rows high; smaller or non-interactive environments fall back to a plain prompt.

### API Key Changes Are Not Picked Up

Environment variables and .env values are loaded at startup. Restart Agent-Termo after changing them.

### npm Installation or Build Problems

Check your runtime version:

~~~bash
node --version
npm --version
~~~

Agent-Termo requires Node.js 20 or higher. For source installations, reinstall dependencies and run the build again:

~~~bash
npm install
npm run build
~~~

---

## Documentation

The repository includes additional technical documentation:

| Document | Description |
|---|---|
| [docs/ROUTE_MAP.md](./docs/ROUTE_MAP.md) | CLI commands, REPL interactions, options, and environment variables. |
| [docs/architecture.md](./docs/architecture.md) | Overall architecture and component responsibilities. |
| [docs/TECH_STACK.md](./docs/TECH_STACK.md) | Technology stack and design decisions. |
| [docs/DESIGN_SYSTEM.md](./docs/DESIGN_SYSTEM.md) | Terminal UI design system. |
| [docs/FRONTEND_ARCHITECTURE.md](./docs/FRONTEND_ARCHITECTURE.md) | Terminal interface architecture. |
| [docs/BACKEND_ARCHITECTURE.md](./docs/BACKEND_ARCHITECTURE.md) | Tooling and backend architecture. |
| [docs/DEV_SETUP.md](./docs/DEV_SETUP.md) | Developer environment and setup guide. |
| [docs/PROJECT_PROGRESS.md](./docs/PROJECT_PROGRESS.md) | Project progress and implementation tracking. |
| [docs/MEMORY.md](./docs/MEMORY.md) | Project memory. |
| [docs/TIMELINE.md](./docs/TIMELINE.md) | Project timeline. |

---

## Contributing

Issues, suggestions, and pull requests are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make focused changes.
4. Run tests, type checking, and linting.
5. Open a pull request with a clear description.

~~~bash
git clone https://github.com/YOUR_USERNAME/agent-termo.git
cd agent-termo
npm install

git checkout -b feature/your-feature

npm test
npm run typecheck
npm run lint
~~~

For bugs and feature requests, [open a GitHub issue](https://github.com/krish2312005/agent-termo/issues).

## License

Agent-Termo's package metadata declares the MIT license.

## Acknowledgments

- Inspired by modern terminal-based AI coding agents, including Claude Code.
- Powered by [NVIDIA NIM](https://build.nvidia.com/).
- Built with TypeScript and the Node.js ecosystem.

Agent-Termo is an independent project. It is not affiliated with, endorsed by, or maintained by Anthropic or NVIDIA.

---

<div align="center">

**Agent-Termo**

Build software. Automate workflows. Stay in your terminal.

[GitHub](https://github.com/krish2312005/agent-termo)
·
[npm](https://www.npmjs.com/package/agent-termo)
·
[Report an issue](https://github.com/krish2312005/agent-termo/issues)

</div>
