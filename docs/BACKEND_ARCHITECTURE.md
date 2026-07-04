# Backend Architecture — Agent-Termo

**Project:** Agent-Termo CLI Tool
**Date:** 2026-07-04
**Status:** FINAL

---

## Overview

Agent-Termo is a **CLI tool** (no server component). All AI processing runs through the Nvidia NIM API. The "backend" is the tool execution layer that the LLM invokes via function calling.

---

## Component Architecture

```
User Input (stdin/REPL)
        │
        ▼
┌─────────────────┐
│  src/main.ts    │  ← REPL event loop
│  CLI Orchestrator│
└────────┬────────┘
         │
         ├──────────────────────────────────────┐
         │                                       │
         ▼                                       ▼
┌─────────────────┐                   ┌─────────────────┐
│   src/llm/      │◄──── Prompt ────►│   src/ui/       │
│   client.ts     │    (with tools)   │   output.ts    │
│                 │◄──── Stream ─────►│                 │
└────────┬────────┘                   └────────┬────────┘
         │                                       │
         ▼                                       ▼
┌─────────────────────────────────────────────────┐
│              src/tools/ (Tool System)           │
│  FileRead | FileWrite | FileEdit | BashExecute │
│  GitStatus | GitCommit | Glob | Grep           │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│           src/agents/ (Agent Registry)           │
│  Loads prompts from .claude/agents/*.md         │
│  Manages agent switching and context             │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│         src/memory/ (Memory System)             │
│  MEMORY.md (project context)                    │
│  TIMELINE.md (chronological log)                │
└─────────────────────────────────────────────────┘
```

---

## Tool Definitions (OpenAI Function Calling Schema)

These are the tools exposed to the NIM LLM as `tools` in the API request.

### Tool: `file:read`

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
    required: ["path"]
  }
}
```

### Tool: `file:write`

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
    required: ["path", "content"]
  }
}
```

### Tool: `file:edit`

```typescript
{
  name: "file:edit",
  description: "Edit a file by finding a line range and replacing it.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File to edit" },
      old_string: { type: "string", description: "Exact text in the file to replace (must be unique)" },
      new_string: { type: "string", description: "Replacement text" }
    },
    required: ["path", "old_string", "new_string"]
  }
}
```

### Tool: `file:glob`

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
    required: ["pattern"]
  }
}
```

### Tool: `grep`

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
    required: ["pattern", "path"]
  }
}
```

### Tool: `bash:execute`

```typescript
{
  name: "bash:execute",
  description: "Execute a bash/shell command and return its output.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute" },
      cwd: { type: "string", description: "Working directory (default: project root)" },
      timeout: { type: "number", description: "Timeout in ms (default: 300000)" }
    },
    required: ["command"]
  }
}
```

### Tool: `git:status`

```typescript
{
  name: "git:status",
  description: "Show the working tree status of the git repository.",
  parameters: {
    type: "object",
    properties: {
      cwd: { type: "string", description: "Repository root (default: project root)" }
    }
  }
}
```

### Tool: `git:commit`

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
    required: ["message"]
  }
}
```

### Tool: `git:push`

```typescript
{
  name: "git:push",
  description: "Push commits to the remote repository.",
  parameters: {
    type: "object",
    properties: {
      cwd: { type: "string", description: "Repository root" }
    }
  }
}
```

### Tool: `git:log`

```typescript
{
  name: "git:log",
  description: "Show recent git commit history.",
  parameters: {
    type: "object",
    properties: {
      cwd: { type: "string", description: "Repository root" },
      limit: { type: "number", description: "Number of commits (default: 20)", default: 20 }
    }
  }
}
```

---

## Session State

```typescript
interface Session {
  id: string;           // UUID, generated on startup
  projectRoot: string;  // CWD at startup
  startedAt: Date;
  messages: ConversationMessage[];
  currentAgent: string; // Active agent name
}
```

Sessions are ephemeral (in-memory). Conversation history is stored in `messages[]` for context injection.

---

## Memory System

**Location:** `docs/MEMORY.md` (file on disk, loaded at startup)

**Load:** Read file at startup, inject into system prompt as context  
**Update:** Append entries when significant decisions are made  
**Format:** Markdown with dated sections per agent activity

```typescript
async function loadMemory(root: string): Promise<string>
async function appendToMemory(root: string, entry: string): Promise<void>
```

---

## Timeline System

**Location:** `docs/TIMELINE.md` (append-only log)

**Log entries append-only on:**
- Tool execution (brief — tool name, path, status)
- Agent switches
- Major milestones (design complete, build pass, etc.)
- Errors/warnings

```typescript
async function appendToTimeline(root: string, entry: string): Promise<void>
```

---

## Error Handling

All tools return `ToolResult`:
```typescript
interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}
```

The LLM client wraps tool results into the conversation and continues. No tool failure crashes the session.

---

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `NIM_API_KEY` | Yes | — | Nvidia NIM authentication |
| `NIM_BASE_URL` | No | `https://integrate.api.nvidia.com/v1` | API endpoint |
| `NIM_MODEL` | No | `meta/llama-3_1-70b-instruct` | Model selection |
| `AGENT_TERMO_DIR` | No | `.claude` | Agent prompt directory |
| `LOG_LEVEL` | No | `info` | Logging verbosity |

---

## Security

1. **Path validation:** All file operations are constrained to within `projectRoot`
2. **Bash timeout:** Commands timeout after `BASH_TIMEOUT` ms (default 300000)
3. **Allowed commands:** `ALLOWED_COMMANDS` env var whitelist (comma-separated)
4. **Dangerous command detection:** `rm -rf`, `dd`, `> /dev/sda` → require confirmation
5. **No API key logging:** Never print NIM_API_KEY value

---

*Generated by backend-architecture-designer — 2026-07-04*