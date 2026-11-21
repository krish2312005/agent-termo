# Frontend Architecture — Agent-Termo

**Project:** Agent-Termo CLI Tool  
**Type:** Terminal-based AI coding agent with REPL interface  
**TUI Framework:** blessed  
**LLM Backend:** Nvidia NIM API (OpenAI-compatible)  
**Model:** meta/llama-3.1-8b-instruct  
**Status:** FINAL  
**Date:** 2026-11-16

---

## 1. Project Overview

Agent-Termo is a command-line AI coding agent that runs entirely in the terminal. It provides a full-screen REPL interface built with `blessed`, streams responses from the Nvidia NIM API, and executes tools (file operations, bash, git) on behalf of the user through OpenAI function calling. The interface is inspired by Claude Code's terminal interactions — dark theme, monospace typography, streaming output, agent badges, and inline tool execution display.

---

## 2. Route Map (CLI Commands)

| Command | File | Purpose | Auth |
|---------|------|---------|------|
| `agent-termo` | `src/cli.ts` | Start interactive REPL | No |
| `agent-termo --help` / `-h` | `src/cli.ts` | Show command reference | No |
| `agent-termo --version` / `-v` | `src/cli.ts` | Show version | No |
| `agent-termo --info` | `src/cli.ts` | Show environment diagnostics | No |

See `docs/ROUTE_MAP.md` for complete command reference.

---

## 3. REPL Event Loop

The core interaction loop runs inside `src/main.ts`. Each turn follows this sequence:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Agent-Termo REPL Event Loop                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [1] Display welcome banner (first run only)                       │
│  [2] Load MEMORY.md and TIMELINE.md into context                   │
│  [3] Render prompt ">" in purple                                   │
│  [4] Read user input from stdin (blessed input box)                │
│  [5] Add user message to conversation history                      │
│  [6] Build system prompt (system + memory + timeline + messages)   │
│  [7] Stream LLM response (text arrives chunk-by-chunk)             │
│  [8] If tool_call detected:                                        │
│      ├─ Render tool execution box                                  │
│      ├─ Execute tool (file:read, bash:execute, etc.)               │
│      ├─ Inject tool result back into conversation                  │
│      └─ Return to [7] for continued streaming                      │
│  [9] Render agent badge if active agent switched                   │
│  [10] On completion: save memory/timeline, return to [3]           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Loop Pseudocode

```typescript
async function replLoop(session: Session, systemPrompt: string) {
  while (true) {
    // Render prompt
    renderPrompt(session.currentAgent);

    // Read input
    const input = await readInput();

    // Handle special commands
    if (input === 'exit' || input === 'quit') break;
    if (input === '') continue;

    // Add user message
    session.messages.push({ role: 'user', content: input });

    // Build messages for API
    const messages = buildMessages(systemPrompt, session);

    // Stream response
    const response = await streamLLMResponse(messages, session);

    // Handle tool calls iteratively
    while (response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        const result = await executeTool(toolCall);
        session.messages.push({ role: 'tool', content: result, tool_call_id: toolCall.id });
      }
      const followUp = await streamLLMResponse(session.messages, session);
      response.content += followUp.content;
    }

    // Save state
    await saveMemory(session);
    await saveTimeline(session);
  }
}
```

---

## 4. Startup Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Startup Sequence                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Parse CLI arguments (commander)                                │
│     ├─ --help → print help, exit 0                                 │
│     ├─ --version → print version, exit 0                           │
│     ├─ --info → print diagnostics, exit 0                          │
│     └─ default → start REPL                                        │
│                                                                     │
│  2. Initialize blessed screen                                      │
│     ├─ Create screen with smartCSR                                 │
│     ├─ Set up header, main, input layout                           │
│     └─ Register key listeners (Ctrl+C, Ctrl+D, Ctrl+L, etc.)       │
│                                                                     │
│  3. Validate environment                                           │
│     ├─ Check NIM_API_KEY is set                                    │
│     ├─ If missing: print error, exit 1                             │
│     └─ Log NIM_BASE_URL and NIM_MODEL                              │
│                                                                     │
│  4. Load project memory                                            │
│     ├─ Read docs/MEMORY.md                                         │
│     ├─ Read docs/TIMELINE.md                                       │
│     └─ Inject into system prompt                                   │
│                                                                     │
│  5. Create session                                                 │
│     ├─ Generate UUID session ID                                    │
│     ├─ Set projectRoot = process.cwd()                             │
│     ├─ Set currentAgent = 'project-manager'                        │
│     └─ Initialize messages array                                   │
│                                                                     │
│  6. Display welcome banner                                         │
│     ├─ ASCII logo (see DESIGN_SYSTEM.md §6.1)                      │
│     ├─ Version and model info                                      │
│     └─ Available agents list                                       │
│                                                                     │
│  7. Enter REPL loop                                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Startup Code Structure

```typescript
// src/main.ts
async function main() {
  // 1. CLI argument parsing
  const args = parseArgs();

  if (args.help) { printHelp(); process.exit(0); }
  if (args.version) { printVersion(); process.exit(0); }
  if (args.info) { printInfo(); process.exit(0); }

  // 2. Initialize UI
  const screen = initScreen();

  // 3. Validate env
  if (!process.env.NIM_API_KEY) {
    printError("NIM_API_KEY not set. Get one at https://build.nvidia.com/");
    print("Copy .env.example to .env and fill in your API key.");
    process.exit(1);
  }

  // 4. Load memory and timeline
  const memory = await loadMemory(projectRoot);
  const timeline = await loadTimeline(projectRoot);

  // 5. Build system prompt
  const systemPrompt = buildSystemPrompt(memory, timeline);

  // 6. Create session
  const session: Session = {
    id: uuidv4(),
    projectRoot,
    startedAt: new Date(),
    messages: [],
    currentAgent: 'project-manager',
  };

  // 7. Welcome banner
  renderWelcomeBanner(screen);

  // 8. Start REPL
  await replLoop(session, systemPrompt, screen);
}
```

---

## 5. Screen Layout (blessed)

Full-screen terminal layout with three fixed regions:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌─ Header (2 rows, fixed) ──────────────────────────────────────┐ │
│ │ Agent-Termo v1.0.0          [session: abc123] [Ctrl+C: exit]  │ │
│ │ Model: meta/llama-3.1-8b-instruct    [Agent: project-manager] │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Main (scrollable, flex) ─────────────────────────────────────┐ │ │
│ │                                                                 │ │ │
│ │  [Scrollable message history]                                   │ │ │
│ │  - User messages (left-aligned, green)                          │ │ │
│ │  - Agent messages (full width, purple)                          │ │ │
│ │  - Tool execution boxes (inline)                                │ │ │
│ │  - Error boxes (red)                                            │ │ │
│ │  - Streaming text (character-by-character)                      │ │ │
│ │                                                                 │ │ │
│ └─────────────────────────────────────────────────────────────────┘ │ │
│                                                                     │ │
│ ┌─ Input area (fixed bottom, 2 rows) ───────────────────────────┐ │ │
│ │ > █                                                             │ │ │
│ └─────────────────────────────────────────────────────────────────┘ │ │
│                                                                     │ │
└─────────────────────────────────────────────────────────────────────┘ │
```

### Region Definitions

| Region | Position | Height | Purpose |
|--------|----------|--------|---------|
| Header | Top, fixed | 2 rows | App title, version, session ID, model, active agent |
| Main | Center, flex | Remaining | Scrollable content area for messages, tools, errors |
| Input | Bottom, fixed | 2 rows | User command input with prompt prefix |

### Responsive Behavior

| Terminal Width | Behavior |
|----------------|----------|
| < 60 chars | Disable decorative elements, compact layout |
| 60-80 chars | Standard layout, compressed spacing |
| 80-120 chars | Comfortable padding |
| > 120 chars | Max-width for readability |

---

## 6. Message Rendering

### 6.1 User Message

```
┌─────────────────────────────────────────────────────────────────────┐
│ YOU                                          10:42:15 AM  2.3s      │
│                                                                     │
│ Create a new API endpoint for user registration                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

- Role badge: `YOU` in success color (#22C55E, ANSI 82)
- Timestamp: muted color (#94A3B8, ANSI 145), right-aligned
- Duration: optional, shown for agent processing time
- Content: text color (#F8FAFC, ANSI 255), body size

### 6.2 Assistant Message (Streaming)

```
┌─────────────────────────────────────────────────────────────────────┐
│ AGENT: [project-manager]                    10:42:18 AM  5.1s       │
│                                                                     │
│ I'll help you create that API endpoint. Let me break this           │
│ down into steps:                                                    │
│                                                                     │
│ 1. Set up the route handler                                         │
│ 2. Add input validation                                             │
│ 3. Create database schema                                           │
│                                                                     │
│ Shall I proceed with step 1?                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Streaming behavior:**
- Text arrives chunk-by-chunk from NIM API
- Each chunk is appended to the current message box
- Markdown is rendered per complete paragraph (not per character)
- Auto-scrolls to bottom on new content
- After completion: show tool call list if any

### 6.3 Agent Badge (on agent switch)

```
┌─ [AGENT: project-manager] ● Active ───────────────────────────────┐
│ Status message                                                    │
└───────────────────────────────────────────────────────────────────┘
```

- Displayed when the active agent changes
- Background: primaryDim (#6D28D9, ANSI 57)
- Border: primary (#7C3AED, ANSI 93)
- Text: text color (#F8FAFC, ANSI 255)

### 6.4 Message Header Fields

| Field | Color | Position | Format |
|-------|-------|----------|--------|
| Role badge | success (user) / primary (agent) | Left | `YOU` / `AGENT: [name]` |
| Timestamp | muted | Right | `HH:MM:SS AM/PM` |
| Duration | muted | Right | `X.Xs` (agent only) |
| Agent badge | primary | Left (agent messages) | `[AGENT: name]` |

---

## 7. Tool Execution Display

When the LLM invokes a tool, it is displayed inline in the main content area.

### 7.1 Tool Execution Start

```
┌─ Tool: file:read ─────────────────────────────────────────────────┐
│ executing...                                                       │
│ Path: src/main.ts                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Tool Execution Success

```
┌─ Tool: file:read ─────────────────────────────────────────────────┐
│ ✓ Read 150 lines from src/main.ts                                 │
│ Output: import { ... }                                            │
│         const app = ...                                           │
│         ... (first 200 chars)                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.3 Tool Execution Error

```
┌─ Error ───────────────────────────────────────────────────────────┐
│ ✗ file:read failed: ENOENT: no such file                          │
│ Hint: Check that the path is relative to project root             │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.4 Tool Spinner States

| State | Spinner | Message Example |
|-------|---------|-----------------|
| Loading | ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ | "Analyzing request..." |
| Thinking | ⣀⣄⣤⣦⣇⣧⣸ | "Thinking..." |
| Processing | ░▒▓█ | "Processing large result..." |
| Transmitting | ◐◓◑◒ | "Sending data..." |

### 7.5 Supported Tools

| Tool | Purpose | Display Label |
|------|---------|---------------|
| `file:read` | Read file contents | `file:read` |
| `file:write` | Write/overwrite file | `file:write` |
| `file:edit` | Find-and-replace edit | `file:edit` |
| `file:glob` | List files by pattern | `file:glob` |
| `grep` | Search text in files | `grep` |
| `bash:execute` | Run shell command | `bash:execute` |
| `git:status` | Git working tree status | `git:status` |
| `git:commit` | Commit changes | `git:commit` |
| `git:push` | Push to remote | `git:push` |
| `git:log` | Commit history | `git:log` |

---

## 8. Input Handling

### 8.1 Input Area

```
> █
```

- Prefix: `> ` in muted color
- Cursor: `█` blinking (500ms on, 500ms off)
- Text: text color
- Area: fixed bottom 2 rows, surface background

### 8.2 Key Bindings

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Ctrl+C` | Cancel current operation, return to prompt |
| `Ctrl+D` | Exit (EOF) |
| `Ctrl+L` | Clear screen |
| `Ctrl+R` | Reverse-i-search through history |
| `↑` | Previous command (history) |
| `↓` | Next command (history) |
| `Tab` | No-op (reserved for future autocomplete) |
| `!!` | Repeat last command |

### 8.3 History

- Last 50 messages stored in memory
- Up/down arrows navigate history
- `Ctrl+R` opens reverse search
- Empty input is ignored (re-prompt)

### 8.4 Special Commands (inside REPL)

| Command | Description |
|---------|-------------|
| `exit` | Exit the REPL cleanly |
| `quit` | Alias for `exit` |
| `!!` | Repeat last command |

---

## 9. Response Streaming

### 9.1 Streaming Architecture

```typescript
// src/llm/client.ts
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NIM_API_KEY,
});

async function streamResponse(messages: Message[], tools: Tool[]) {
  const stream = await client.chat.completions.create({
    model: process.env.NIM_MODEL || 'meta/llama-3.1-8b-instruct',
    messages,
    tools,
    stream: true,
    temperature: 0.7,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (delta.content) {
      // Write to blessed output box
      outputBox.append(delta.content);
      screen.render();
    }
    if (delta.tool_calls) {
      // Handle tool calls
      handleToolCalls(delta.tool_calls);
    }
  }
}
```

### 9.2 Streaming Rules

- Text streams character-by-character or line-by-line
- Markdown rendering happens per complete paragraph
- Code blocks are buffered until complete, then syntax-highlighted
- Tool calls interrupt streaming; results are injected, then streaming resumes
- Auto-scroll to bottom on each chunk

### 9.3 Timeout Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_TIMEOUT` | 120000 | API request timeout (ms) |
| `BASH_TIMEOUT` | 300000 | Bash command timeout (ms) |

---

## 10. Markdown Rendering Rules

| Markdown | Terminal Output | ANSI |
|----------|----------------|------|
| `**text**` | Bold | `bold` (1) |
| `*text*` | Dim | `dim` (2) |
| `` `code` `` | Gray background chip | `surface` bg |
| ` ```lang` code ` ``` ` | Syntax-highlighted code box | `surface` bg + border |
| `[link](url)` | `[link]` in blue | `info` (75) |
| `# Heading` | Bright purple, bold | `primary` (93) + `bold` |
| `## Heading` | Purple, bold | `primary` (93) + `bold` |
| `> quote` | Dimmed, prefixed with `│` | `muted` (145) |
| `- item` | Bullet list with `•` | `text` (255) |
| `---` | Divider line | `border` (59) |
| `1. item` | Numbered list | `text` (255) |

### Code Block Syntax Highlighting

| Element | Color | ANSI |
|---------|-------|------|
| Keywords | primary | 93 |
| Strings | success | 82 |
| Numbers | warning | 214 |
| Comments | muted | 145 |
| Functions | info | 75 |
| Properties | text | 255 |
| Punctuation | muted | 145 |
| Errors | error | 196 |

### Code Block Layout

```
┌─[typescript]──────────────────────────────────────────────────────┐
│ 1 │ const endpoint = async (req, res) => {                        │
│ 2 │   const user = await db.users.create({                        │
│ 3 │     data: req.body                                            │
│ 4 │   });                                                         │
│ 5 │   return res.json(user);                                      │
│ 6 │ };                                                            │
├───────────────────────────────────────────────────────────────────┤
│ [Copy]                                                    [ts]    │
└───────────────────────────────────────────────────────────────────┘
```

---

## 11. Loading / Thinking States

### 11.1 Spinner Animation

**Character Sequence:** `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`  
**Frame Rate:** 8 FPS (125ms per frame)

```
⠋ Analyzing...
⠙ Analyzing...
⠹ Analyzing...
```

### 11.2 State Variants

| State | Characters | Speed | Example Message |
|-------|-----------|-------|-----------------|
| Loading | Full cycle | 125ms | "Analyzing request..." |
| Thinking | ⣀⣄⣤⣦⣇⣧⣸ | 80ms | "Thinking..." |
| Processing | ░▒▓█ | 100ms | "Processing large result..." |
| Transmitting | ◐◓◑◒ | 150ms | "Sending data..." |

### 11.3 Display Location

- Same line as status message
- Replaced with result when complete
- Text can be updated dynamically

---

## 12. Exit Flow

### 12.1 Clean Exit

```
┌─────────────────────────────────────────────────────────────────────┐
│ ✓ Session saved. See you next time!                                 │
│ Duration: 00:23:45                                                  │
│ Messages: 42                                                        │
│ Tools executed: 15                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 12.2 Exit Triggers

| Trigger | Behavior | Exit Code |
|---------|----------|-----------|
| `exit` command | Clean shutdown, save state | 0 |
| `quit` command | Alias for exit | 0 |
| `Ctrl+D` | EOF, clean shutdown | 0 |
| `Ctrl+C` | Cancel current operation | 130 |
| Unhandled error | Print error, exit | 1 |
| Invalid arguments | Print help, exit | 2 |

### 12.3 Exit Code Reference

| Code | Meaning |
|------|---------|
| `0` | Clean exit |
| `1` | General error (API failure, unhandled exception) |
| `2` | Invalid arguments / --help |
| `130` | Interrupted (Ctrl+C) |

---

## 13. Error Recovery

| Error | Behavior |
|-------|----------|
| NIM API unreachable | Retry 3x with exponential backoff, then show error + prompt |
| Invalid API key | Clear error message + exit code 1 |
| Tool permission denied | Show error with hint, continue session |
| Tool timeout | Show timeout error + hint |
| Rate limit | Wait and retry with message |
| Unknown error | Show error + stack trace (if DEBUG=true) or generic message |
| File not found | Show error with path hint, continue session |
| Bash command fails | Show stderr output, continue session |

### Error Display Format

```
╔══════════════════════════════════════════════════════════════════╗
║ ERROR: Request validation failed                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ - Field "email" is required                                       ║
║ - Field "password" must be at least 8 characters                  ║
╚══════════════════════════════════════════════════════════════════╝
```

Authentication error:
```
[ERROR] NIM API authentication failed (HTTP 401). Check NIM_API_KEY in .env
```

---

## 14. Key Files

| File | Responsibility |
|------|----------------|
| `src/cli.ts` | Commander argument parsing, entry point |
| `src/main.ts` | REPL loop, session management, main orchestration |
| `src/ui/screen.ts` | blessed screen initialization, layout |
| `src/ui/input.ts` | Input line handling, history, key bindings |
| `src/ui/output.ts` | Message rendering, scrolling, auto-scroll |
| `src/ui/markdown.ts` | Markdown → ANSI conversion |
| `src/llm/client.ts` | OpenAI SDK client, NIM API integration, streaming |
| `src/tools/` | Tool system (file, bash, git operations) |
| `src/agents/` | Agent registry, prompt loading, agent switching |
| `src/memory/` | MEMORY.md and TIMELINE.md persistence |
| `src/utils/config.ts` | Environment variable configuration |
| `docs/MEMORY.md` | Project context (loaded at startup) |
| `docs/TIMELINE.md` | Chronological activity log (append-only) |
| `docs/DESIGN_SYSTEM.md` | Visual design specification |
| `docs/BACKEND_ARCHITECTURE.md` | API contracts and tool definitions |
| `docs/ROUTE_MAP.md` | CLI command reference |

---

## 15. Session State

```typescript
interface Session {
  id: string;           // UUID, generated on startup
  projectRoot: string;  // CWD at startup
  startedAt: Date;
  messages: ConversationMessage[];
  currentAgent: string; // Active agent name (default: project-manager)
}
```

Sessions are ephemeral (in-memory). Conversation history is stored in `messages[]` for context injection. Memory and timeline are persisted to disk after each turn.

---

## 16. Agent System

12 agents are available, each with a prompt loaded from `.claude/agents/*.md`:

| Agent | Purpose |
|-------|---------|
| project-manager | Overall project coordination |
| tech-stack-expert | Technology selection and architecture |
| uiux-designer | User interface and experience design |
| backend-architecture-designer | Backend system design |
| frontend-planner | Frontend architecture and page specs |
| frontend-expert | Frontend implementation |
| backend-expert | Backend implementation |
| security-expert | Security review and hardening |
| test-agent | Test creation and validation |
| git-manager | Git operations and version control |
| deployment-expert | Deployment and CI/CD |
| dev-environment-initiator | Development environment setup |

Agent switching is displayed with an agent badge in the message header.

---

## 17. Security Considerations

1. **Path validation:** All file operations constrained to within `projectRoot`
2. **Bash timeout:** Commands timeout after `BASH_TIMEOUT` ms (default 300000)
3. **Allowed commands:** `ALLOWED_COMMANDS` env var whitelist (comma-separated)
4. **Dangerous command detection:** `rm -rf`, `dd`, `> /dev/sda` → require confirmation
5. **No API key logging:** Never print `NIM_API_KEY` value
6. **Tool result sanitization:** Tool outputs are sanitized before injection into conversation

---

*Generated by frontend-planner — 2026-11-16*

## Current terminal renderer (OpenTUI)

The active CLI path (`src/cli.ts` → `src/main.ts`) now uses one OpenTUI renderer with a persistent SolidJS component tree. The conversation uses a native ScrollBox with sticky-bottom behavior, viewport culling, and list layout. The composer, completion overlay, picker, terminal output panel, and status row are renderables in the same tree.

`src/ui/tui.tsx` owns display state, keyboard events, the transcript, and the persistent render tree. `src/ui/index.ts` remains the presentation facade for the existing REPL. Streamed assistant deltas update the active message renderable instead of writing each delta to stdout. `src/ui/screen.ts` keeps the REPL-facing input, picker, and terminal-panel API while delegating to OpenTUI.

Session persistence, LLM requests, tool execution, permissions, and the run loop remain separate from the renderer. The CLI is built and run with Bun 1.3.14+ because this branch uses OpenTUI's native renderer and Solid runtime.
