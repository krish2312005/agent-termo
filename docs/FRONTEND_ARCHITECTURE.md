# CLI Behavior Specification — Agent-Termo

**Project:** Agent-Termo CLI Tool
**Date:** 2026-07-04
**Status:** FINAL

---

## REPL Event Loop

```
┌─────────────────────────────────────────────────────────┐
│                      Agent-Termo REPL                    │
│                                                          │
│  [1] Display welcome banner (first run only)            │
│  [2] Load MEMORY.md into context                         │
│  [3] Display prompt ">" in purple                        │
│  [4] Read user input from stdin                         │
│  [5] Add user message to conversation                    │
│  [6] Build prompt (system + memory + conversation)       │
│  [7] Stream LLM response (show text as it arrives)       │
│  [8] If tool_call: execute tool → inject result → [7]   │
│  [9] Display agent badge if agent switches               │
│  [10] On completion: display prompt → [4]                │
└─────────────────────────────────────────────────────────┘
```

---

## Startup Flow

```typescript
async function main() {
  // 1. Welcome screen (ASCII logo from DESIGN_SYSTEM.md §6.1)
  printWelcomeScreen();

  // 2. Validate env
  if (!process.env.NIM_API_KEY) {
    printError("NIM_API_KEY not set. Get one at https://build.nvidia.com/");
    print("Copy .env.example to .env and fill in your API key.");
    process.exit(1);
  }

  // 3. Load memory
  const memory = await loadMemory(projectRoot);
  const timeline = await loadTimeline(projectRoot);

  // 4. Build system prompt
  const systemPrompt = buildSystemPrompt(memory, timeline);

  // 5. Start REPL
  const session: Session = { id: uuid(), projectRoot, startedAt: new Date(), messages: [], currentAgent: 'project-manager' };
  await replLoop(session, systemPrompt);
}
```

---

## Screen Layout (blessed)

Full-screen terminal layout — see DESIGN_SYSTEM.md §4:

```
┌──────────────── Header (2 rows) ────────────────────────┐
│ Agent-Termo v1.0.0          [session: abc123] [Ctrl+C]   │
├───────────────── Main (scrollable) ─────────────────────┤
│                                                          │
│  Chat messages appear here, newest at bottom.          │
│  Auto-scrolls. History preserved for context.            │
│                                                          │
├───────── Input area (fixed bottom, 2 rows) ─────────────┤
│ > _                                                      │
└──────────────────────────────────────────────────────────┘
```

---

## Message Rendering

### User Message
```
[HH:MM:SS] You
────────────────────────────────────
<message text>
```

### Assistant Message (streaming)
- Text streams in character-by-character (or line-by-line for speed)
- Markdown rendered: bold, italic, code, links
- Code blocks have syntax highlighting via chalk
- After complete: show tool call list if any

### Agent Badge (on switch)
```
┌─ [AGENT_NAME] ● Active ───────────────────────────────┐
│ Status message                                        │
└───────────────────────────────────────────────────────┘
```

---

## Tool Execution Display

When a tool is called:
```
┌─ Tool: TOOL_NAME ─────────────────────────────────────┐
│ executing...                                           │
│ Path/Args: ...                                         │
└───────────────────────────────────────────────────────┘
```

On completion:
```
┌─ Tool: TOOL_NAME ─────────────────────────────────────┐
│ ✓ <success summary>                                   │
│ Output: <first 200 chars>...                           │
└───────────────────────────────────────────────────────┘
```

On error:
```
┌─ Error ───────────────────────────────────────────────┐
│ ✗ <error message>                                      │
│ Hint: <suggestion>                                      │
└───────────────────────────────────────────────────────┘
```

---

## Input Handling

- `Enter` → send message
- `Ctrl+C` → cancel current operation, return to prompt
- `Ctrl+L` → clear screen
- `↑` / `↓` → message history (last 50 messages)
- `Tab` → no-op (reserved for future autocomplete)
- Empty input → ignore, re-prompt

---

## Response Streaming

```typescript
// Use OpenAI SDK streaming (client.chat.completions.create with stream: true)
// For each chunk, extract content and write to blessed output box
// Markdown rendering happens per complete paragraph (not per char)
```

---

## Markdown Rendering Rules

| Markdown | Terminal Output |
|----------|----------------|
| `**text**` | Bold (chalk.bold) |
| `*text*` | Dim (chalk.dim) |
| `` `code` `` | Gray background chip |
| ` ```lang` code ` ``` ` | Syntax-highlighted code box |
| `[link](url)` | `[link]` in blue (no click) |
| `# Heading` | Bright purple, bold |
| `> quote` | Dimmed, prefixed with `│` |
| `- item` | Bullet list with `•` |
| `---` | Divider line |

---

## Loading / Thinking States

While waiting for LLM:
```
⠋ Analyzing...
```

During tool execution:
```
⠙ Running file:read on src/main.ts...
⠹ Searching for "async function"...
⠸ Committing changes...
⠼ Pushing to origin/main...
⠴ Building project...
```

---

## Exit Flow

On `Ctrl+C` or `exit` command:
```
┌─────────────────────────────────────────────┐
│ ✓ Session saved. See you next time!         │
│ Duration: 00:23:45                          │
└─────────────────────────────────────────────┘
```

---

## Error Recovery

| Error | Behavior |
|-------|----------|
| NIM API unreachable | Retry 3x with backoff, then show error + prompt |
| Invalid API key | Clear error message + exit |
| Tool permission denied | Show error with hint, continue session |
| Tool timeout | Show timeout error + hint |
| Rate limit | Wait and retry with message |
| Unknown error | Show error + stack trace (if DEBUG=true) or generic message |

---

## Key Files

| File | Responsibility |
|------|----------------|
| `src/cli.ts` | Commander argument parsing, entry point |
| `src/main.ts` | REPL loop, session management, main orchestration |
| `src/ui/screen.ts` | blessed screen initialization, layout |
| `src/ui/input.ts` | Input line handling, history |
| `src/ui/output.ts` | Message rendering, scrolling |
| `src/ui/markdown.ts` | Markdown → ANSI conversion |

---

*Generated by frontend-planner — 2026-07-04*