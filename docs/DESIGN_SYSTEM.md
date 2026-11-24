# Agent-Termo Design System

A complete visual design specification for a CLI terminal UI inspired by Claude Code's elegant terminal interactions.

---

## 1. COLOR SYSTEM

### ANSI 256 Color Codes

All terminal colors use ANSI 256 foreground (`\x1b[38;5;Nm`) and background (`\x1b[48;5;Nm`) escape sequences.

| Token | Hex | ANSI Code | Usage |
|-------|-----|------------|-------|
| `primary` | #7C3AED | 93 | Agent messages, highlights, current agent indicator |
| `primaryDim` | #6D28D9 | 57 | Secondary agent accents |
| `success` | #22C55E | 82 | User messages, success confirmations |
| `warning` | #F59E0B | 214 | Warnings, caution states |
| `error` | #EF4444 | 196 | Error messages, destructive indicators |
| `info` | #3B82F6 | 75 | Informational messages, links |
| `background` | #0F172A | 17 | Main terminal background |
| `surface` | #1E293B | 59 | Code blocks, elevated surfaces |
| `surfaceAlt` | #334155 | 60 | Alternate surface, hover states |
| `text` | #F8FAFC | 255 | Primary text |
| `muted` | #94A3B8 | 145 | Secondary text, labels, placeholders |
| `border` | #475569 | 59 | Dividers, borders |

### Text Styles

| Style | Color | ANSI | Usage |
|-------|-------|------|-------|
| `bold` | white | 255 | Prominent labels, titles |
| `dim` | muted | 145 | Timestamps, secondary info |
| `italic` | text | 255 | Emphasis in descriptions |
| `link` | info | 75 | Clickable references |
| `code` | text on surface | - | Inline code background |

### Example Escape Sequences

```bash
# Reset
RESET='\x1b[0m'

# Colors
PRIMARY='\x1b[38;5;93m'
SUCCESS='\x1b[38;5;82m'
WARNING='\x1b[38;5;214m'
ERROR='\x1b[38;5;196m'
INFO='\x1b[38;5;75m'
BG='\x1b[48;5;17m'
SURFACE='\x1b[48;5;59m'
TEXT='\x1b[38;5;255m'
MUTED='\x1b[38;5;145m'

# Formatting
BOLD='\x1b[1m'
DIM='\x1b[2m'
BOLD_DIM='\x1b[1;2m'
```

---

## 2. TYPOGRAPHY SYSTEM

### Font Family

```
Menlo, Monaco, 'Cascadia Code', 'Fira Code', Consolas, monospace
```

### Type Scale (Monospace)

| Name | Display | ANSI | Usage |
|------|---------|------|-------|
| `display` | 20px | Bold (1) | Main header, welcome text |
| `heading` | 16px | Bold (1) | Section titles, agent names |
| `body` | 14px | Normal (0) | Message content, descriptions |
| `caption` | 12px | Dim (2) | Timestamps, metadata, labels |
| `small` | 11px | Dim (2) | Fine print, agent status |

### Line Height

```
line-height: 1.4  (140%)
```

### Spacing Unit

```
base-unit: 1 character width (for alignment)
vertical-spacing: 1 line (for separation)
```

---

## 3. COMPONENT SPECIFICATIONS

### 3.1 MessageBubble

**Purpose:** Display user and AI conversation messages

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ [Role Badge] [Agent Badge] [Timestamp]               [Duration]  │
│                                                                  │
│ Message content here, wrapping at terminal width                  │
│ with proper line breaks and formatting preserved.               │
│                                                                  │
│ Can contain inline code, code blocks, and nested elements.       │
└─────────────────────────────────────────────────────────────────┘
```

**Variants:**

**User Message (Left-aligned, Success color)**
```
┌─────────────────────────────────────────────────────────────────┐
│ YOU                                          10:42:15 AM  2.3s  │
│                                                                  │
│ Create a new API endpoint for user registration                  │
└─────────────────────────────────────────────────────────────────┘
```

**Agent Message (Full width, with sections)**
```
┌─────────────────────────────────────────────────────────────────┐
│ AGENT: [project-manager]                    10:42:18 AM  5.1s  │
│                                                                  │
│ ▸ Analyzing requirements                                         │
│ ▸ Creating project structure                                     │
│ ▸ Implementing core functionality                                │
│                                                                  │
│ I understand you want to build a new API endpoint. Let me        │
│ break this down into the following steps:                        │
│                                                                  │
│ 1. Set up the route handler                                     │
│ 2. Add input validation                                         │
│ 3. Create database schema                                        │
│ 4. Write integration tests                                       │
│                                                                  │
│ Shall I proceed with step 1?                                      │
└─────────────────────────────────────────────────────────────────┘
```

**Styling:**
- User: `success` left border (▌), success `dim` badge
- Agent: `primary` left border (▌), primary badge with agent name
- Content: `text` color, `body` size
- Timestamp: `muted` color, `caption` size, right-aligned
- Duration: `muted` color, shown only for agent messages

**Behavior:**
- Scroll behavior: auto-scroll to bottom on new message
- Selection: Allow text selection for copy
- Maximum width: 100% of terminal width - 4 chars padding

---

### 3.2 CodeBlock

**Purpose:** Display syntax-highlighted code with language identification

**Layout:**
```
┌─[language]──────────────────────────────────────────────────────┐
│ 1 │ const endpoint = async (req, res) => {                       │
│ 2 │   const user = await db.users.create({                      │
│ 3 │     data: req.body                                          │
│ 4 │   });                                                       │
│ 5 │   return res.json(user);                                    │
│ 6 │ };                                                          │
├──────────────────────────────────────────────────────────────────┤
│ [Copy]                                            [javascript]   │
└──────────────────────────────────────────────────────────────────┘
```

**Background:** `surface` (#1E293B)
**Border:** `border` (#475569)
**Radius:** No radius (ASCII borders)

**Syntax Highlighting (ANSI colors):**
```
Keywords:     primary (93)    - const, async, await, return
Strings:      success (82)    - "text", 'single'
Numbers:      warning (214)   - 1, 2, 100
Comments:     muted (145)     - // comment, /* block */
Functions:    info (75)       - functionName()
Properties:   text (255)      - object.property
Punctuation:  muted (145)     - (), {}, []
Errors:       error (196)     - error indicators
```

**Language Label:**
- Position: Top-left corner: `[language]`
- Color: `muted`
- Format: lowercase, max 12 characters

**Footer:**
- Line numbers: Left side, `muted` color
- Code actions: Right-aligned (e.g., "[Copy]")
- Language badge: Right side, `surfaceAlt` background

**States:**
- Default: As shown above
- Copying: Show "[Copied!]" for 2 seconds
- Language unknown: Show `[code]` instead of language name

**Maximum Height:**
```
max-height: 60% of terminal
Overflow: Scroll (vertical)
```

---

### 3.3 InlineCode

**Purpose:** Highlight inline code snippets within text

**Layout:**
```
This is regular text with `const x = 42` inline code.
```

**Styling:**
- Background: `surface` (#1E293B)
- Padding: 2px horizontal
- Text color: `text` (#F8FAFC)
- Border radius: None (monospace alignment)

**Escaping:**
```
Backticks within code: use backslash (\`)
Example: `use \`console.log\` for debugging`
```

---

### 3.4 Spinner

**Purpose:** Indicate ongoing process/loading state

**Character Cycle:**
```
⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏
```

**Animation:**
- Frame rate: 8 FPS (125ms per frame)
- Direction: Left to right

**Layout:**
```
⠋ Loading agent responses...
```

**Variants:**

| State | Characters | Speed | Message Example |
|-------|-----------|-------|-----------------|
| Loading | Full cycle | 125ms | "Analyzing request..." |
| Thinking | ⣀⣄⣤⣦⣇⣧⣸ | 80ms | "Thinking..." |
| Processing | ░▒▓█ | 100ms | "Processing large result..." |
| Transmitting | ◐◓◑◒ | 150ms | "Sending data..." |

**Placement:**
- Show on same line as status message
- Replace with result when complete
- Allow spinner text to be updated dynamically

---

### 3.5 ProgressBar

**Purpose:** Show completion percentage for long operations

**Layout:**
```
████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  40%  [4/10 tasks]
```

**Character Set:**
```
Filled:    █ (U+2588)
Unfilled:  ░ (U+2591)
```

**Width Calculation:**
```
bar-width = terminal-width - 50 chars (for percentage + text)
default-width = 40 chars (minimum 20)
```

**Calculation:**
```
filled-count = round((percentage / 100) * bar-width)
unfilled-count = bar-width - filled-count
```

**Labels:**
- Percentage: Right-aligned, `primary` color
- Counter: `[completed/total]` format, `muted` color

**States:**

| State | Fill Color | Label |
|-------|-----------|-------|
| 0-33% | `muted` (145) | "Starting..." |
| 34-66% | `info` (75) | "In progress..." |
| 67-99% | `warning` (214) | "Almost done..." |
| 100% | `success` (82) | "Complete!" |

**Indeterminate State:**
```
⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```
(Filled portion animates left to right)

---

### 3.6 AgentBadge

**Purpose:** Identify the currently active agent in context

**Layout:**
```
[project-manager]
```

**Styling:**
- Background: `primaryDim` (57) - subtle purple
- Text: `text` (255)
- Padding: 1 char horizontal, 0 vertical
- Border: `primary` (93)

**Agent Types and Colors:**

| Agent | Background | Border | Text |
|-------|-----------|--------|------|
| project-manager | 57 | 93 | 255 |
| tech-stack-expert | 67 | 141 | 255 |
| uiux-designer | 93 | 93 | 255 |
| backend-architecture-designer | 67 | 67 | 255 |
| frontend-planner | 75 | 75 | 255 |
| frontend-expert | 69 | 75 | 255 |
| backend-expert | 72 | 75 | 255 |
| security-expert | 196 | 196 | 255 |
| test-agent | 82 | 82 | 255 |
| git-manager | 215 | 214 | 255 |
| deployment-expert | 65 | 69 | 255 |
| dev-environment-initiator | 71 | 72 | 255 |

**Display Rules:**
- Show when agent changes in conversation
- Show in message header for agent messages
- Can be combined with role: `[AGENT: project-manager]`

---

### 3.7 ErrorBox

**Purpose:** Display error messages with clear visual distinction

**Layout:**
```
╔══════════════════════════════════════════════════════════════════╗
║ ERROR: Request validation failed                                  ║
╠══════════════════════════════════════════════════════════════════╣
║ - Field "email" is required                                       ║
║ - Field "password" must be at least 8 characters                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**Styling:**
- Border: `error` (196) double-line ASCII
- Background: Transparent (or `error` at 10% opacity if supported)
- Error label: `error` (196), `BOLD`
- Error lines: `text` (255)
- Bullet points: `error` (196)

**Header:**
- Format: `ERROR: [brief summary]`
- Always bold
- Single line, truncates with `...` if too long

**Content:**
- Bullet points prefixed with `✗` or `-`
- May include code snippets (use `InlineCode`)
- Include stack traces in `CodeBlock` when relevant

**States:**

| State | Header | Border | Severity |
|-------|--------|--------|----------|
| Error | `ERROR:` red | Red | High |
| Warning | `WARNING:` amber | Amber | Medium |
| Info | `INFO:` blue | Blue | Low |

---

### 3.8 InputPrompt

**Purpose:** Command line input area for user interaction

**Layout:**
```
> _
```

**Components:**
```
Prefix:    "> "  (muted color)
Cursor:    "█"   (text color, blinking)
Text:      "user input here"  (text color)
```

**States:**

| State | Prefix | Text | Cursor |
|-------|--------|------|--------|
| Empty | `>` `muted` | (none) | `█` blinking |
| Typing | `>` `muted` | `input text` `text` | `█` blinking |
| Disabled | `>` `muted` | `Processing...` `muted` | (none) |

**Cursor Behavior:**
- Blinking: 500ms on, 500ms off
- Width: 1 character
- Color: `text` (#F8FAFC)

**History Navigation:**
```
Up Arrow:    Previous command (if history exists)
Down Arrow:  Next command (if not at end)
```

**Styling:**
- Input area: `surface` background
- Padding: 1 line top, 1 line bottom
- Border-bottom: `border` (optional, can be none)

---

### 3.9 Divider

**Purpose:** Visual separation between sections

**Layout:**
```
────────────────────────────────────────────────────────────────────
```

**Character:** `-` (U+2500 BOX DRAWINGS LIGHT HORIZONTAL)

**Variants:**

| Type | Character | Width | Usage |
|------|-----------|-------|-------|
| Thin | - | 100% width | Default separator |
| Thick | - | 100% width | Section breaks |
| Dashed | - - - | 100% width | Subtle breaks |
| Double | = | 100% width | Major sections |
| Empty | (blank line) | 1 line | Minimal separation |

**Styling:**
- Color: `border` (#475569)
- No padding before/after (content handles spacing)

---

### 3.10 Table

**Purpose:** Display structured tabular data

**Layout:**
```
┌──────────────────┬───────────┬────────────┐
│ NAME             │ TYPE      │ REQUIRED   │
├──────────────────┼───────────┼────────────┤
│ email            │ string    │ true       │
│ password         │ string    │ true       │
│ name             │ string    │ false      │
│ role             │ enum      │ false      │
└──────────────────┴───────────┴────────────┘
```

**Borders:**
```
Top:     ┌───┬───┬───┐
Header:  ├───┼───┼───┤
Rows:    ├───┼───┼───┤
Bottom:  └───┴───┴───┘
```

**Styling:**
- Header: Bold, `text` color, `border` background
- Rows: `text` color, alternating `surface` backgrounds (optional)
- Cells: Left-aligned, padding 1 char
- Column widths: Auto-sized to content (min 1 char)

**Alignment:**
```
Strings:  Left-aligned
Numbers:  Right-aligned
Booleans: Center-aligned
Enums:    Left-aligned
```

**Compact Variant:**
```
NAME             TYPE      REQUIRED
─────────────────────────────────────────
email            string    true
password         string    true
name             string    false
```

---

## 4. LAYOUT STRUCTURE

### Terminal Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌─ Agent-Termo ──────────────────────────────────────────────────┐ │
│ │ [logo] Agent-Termo v1.0.0                      [STATUS: READY] │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │                                                                  │ │
│ │  Welcome to Agent-Termo!                                         │ │
│ │  ─────────────────────────                                       │ │
│ │                                                                  │ │
│ │  A multi-agent AI orchestration system for building software.    │ │
│ │                                                                  │ │
│ │  [Get Started] Type a command or select an agent.               │ │
│ │                                                                  │ │
│ │                     [scrollable message area]                    │ │
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

### Region Definitions

| Region | Position | Height | Purpose |
|--------|----------|--------|---------|
| Header | Top, fixed | 2 lines | App title, version, global status |
| Main | Center, flex | Remaining | Scrollable content area |
| Input | Bottom, fixed | 2-4 lines | User command input |
| Status | Bottom, fixed | 1 line | Footer stats |

### Responsive Behavior

| Terminal Width | Layout Behavior |
|----------------|-----------------|
| < 60 chars | Disable some decorative elements |
| 60-80 chars | Standard layout, compressed spacing |
| 80-120 chars | Comfortable padding |
| > 120 chars | Max-width for readability |

---

## 5. EXAMPLE OUTPUTS

### 5.1 Welcome Screen

```
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ███████╗██╗  ██╗██╗   ██╗     ██████╗ ██████╗  █████╗ ███╗   ██╗║
║   ██╔════╝██║ ██╔╝╚██╗ ██╔╝    ██╔════╝ ██╔══██╗██╔══██╗████╗  ██║║
║   ███████╗█████╔╝  ╚████╔╝     ██║  ███╗██████╔╝███████║██╔██╗ ██║║
║   ╚════██║██╔══██╗   ╚██╔╝      ██║   ██║██╔══██╗██╔══██║██║╚██╗██║║
║   ███████║██║  ██║    ██║       ╚██████╔╝██║  ██║██║  ██║██║ ╚████║║
║   ╚══════╝╚═╝  ╚═╝    ╚═╝        ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝║
║                                                                   ║
║   Multi-Agent AI Orchestration System v1.0.0                      ║
║   ──────────────────────────────────────────                      ║
║                                                                   ║
║   Type a command or invoke an agent.                              ║
║                                                                   ║
║   Available agents: project-manager, backend-expert,             ║
║   frontend-expert, security-expert, and 8 more.                  ║
║                                                                   ║
║   > █                                                             ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

### 5.2 User Message

```
╌╌─────────────────────────────────────────────────────────────────────┐
│ YOU                                                   2:34:15 PM     │
│                                                                     │
│ Create a task management endpoint that allows users to create,     │
│ read, update, and delete tasks within their workspace.            │
│                                                                     │
│ Requirements:                                                       │
│ - JWT authentication required                                      │
│ - Rate limited to 100 requests per minute                          │
│ - Return task ID and timestamps                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Agent Response

```
┌─[AGENT: backend-architecture-designer]────────────────────────────────┐
│ Creating API specification for: /api/tasks                           │
│                                                                       │
│ I will design a RESTful task management API with full CRUD            │
│ operations. Here's my implementation plan:                           │
│                                                                       │
│                                                                       │
│ ┌─ ENDPOINTS ─────────────────────────────────────────────────────┐  │
│ │ POST   /api/tasks        Create a new task                       │  │
│ │ GET    /api/tasks        List all tasks (with filters)           │  │
│ │ GET    /api/tasks/:id    Get single task                         │  │
│ │ PUT    /api/tasks/:id    Update task                             │  │
│ │ DELETE /api/tasks/:id    Delete task (soft delete)               │  │
│ └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│ ┌─ DATABASE SCHEMA ────────────────────────────────────────────────┐  │
│ │ Table: tasks                                                     │  │
│ │ ────────────────────────────────────────────────────────────────│  │
│ │ Column       │ Type         │ Constraints                        │  │
│ ├──────────────┼──────────────┼────────────────────────────────────┤  │
│ │ id           │ UUID         │ PRIMARY KEY, DEFAULT uuid_generate │  │
│ │ title        │ VARCHAR(200) │ NOT NULL                           │  │
│ │ description  │ TEXT         │ NULLABLE                           │  │
│ │ status       │ ENUM         │ DEFAULT 'pending'                  │  │
│ │ priority     │ ENUM         │ DEFAULT 'medium'                   │  │
│ │ assignee_id  │ UUID         │ FK -> users.id, NULLABLE            │  │
│ │ workspace_id │ UUID         │ NOT NULL, FK -> workspaces.id      │  │
│ │ due_date     │ TIMESTAMP    │ NULLABLE                           │  │
│ │ created_at   │ TIMESTAMP    │ DEFAULT NOW()                      │  │
│ │ updated_at   │ TIMESTAMP    │ DEFAULT NOW()                      │  │
│ │ deleted_at   │ TIMESTAMP    │ NULLABLE (soft delete)              │  │
│ └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│ ┌─ SECURITY ──────────────────────────────────────────────────────┐  │
│ │ - JWT Bearer token required for all endpoints                    │  │
│ │ - Workspace membership verified on every request                  │  │
│ │ - Rate limit: 100 req/min per user                               │  │
│ │ - Input validation using Zod schemas                             │  │
│ └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│ Should I proceed with creating the full implementation?              │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.4 Error State

```
╔═══════════════════════════════════════════════════════════════════╗
║ ERROR: Authentication failed                                       ║
╠═══════════════════════════════════════════════════════════════════╣
║ - Invalid or expired JWT token                                      ║
║ - Token may have been revoked                                       ║
║ - Please log in again to continue                                   ║
║                                                                       ║
║ Reference: docs/AUTH.md#token-refresh                              ║
╚═══════════════════════════════════════════════════════════════════╝

> █
```

### 5.5 Success State

```
┌─ SUCCESS ───────────────────────────────────────────────────────────┐
│                                                                       │
│   OK POST /api/tasks          Created task "Design API endpoints"     │
│   OK GET  /api/tasks          Retrieved 42 tasks                      │
│   OK Updated Redis cache       156 keys set                          │
│                                                                       │
│   Completed in 234ms                                                  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.6 Mixed Content Example

```
┌─[AGENT: frontend-expert]────────────────────────────────────────────┐
│ Implementing the task list component...                             │
│                                                                       │
│ I created the following files:                                      │
│                                                                       │
│   src/components/TaskList.tsx                                       │
│   src/components/TaskCard.tsx                                       │
│   src/hooks/useTasks.ts                                              │
│   src/types/task.ts                                                  │
│                                                                       │
│ Key implementation:                                                   │
│                                                                       │
│ ```typescript                                                        │
│ export function useTasks(workspaceId: string) {                     │
│   return useQuery({                                                 │
│     queryKey: ['tasks', workspaceId],                                │
│     queryFn: () => api.get<Task[]>(`/workspaces/${workspaceId}/tasks`), │
│     staleTime: 5 * 60 * 1000,  // 5 minutes                         │
│   });                                                                │
│ }                                                                   │
│ ```                                                                  │
│                                                                       │
│ Next steps:                                                         │
│   - Add drag-and-drop reordering                                     │
│   - Implement filter sidebar                                         │
│   - Add keyboard shortcuts                                          │
│                                                                       │
└────────────────────────────────────────────────────────────────────┘
```

---

## 6. ANIMATIONS

### 6.1 Spinner Animation

**Character Sequence:** `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`
**Frame Duration:** 125ms
**Total Cycle:** 1.25 seconds

```typescript
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function renderSpinner(frame: number): string {
  return spinnerFrames[frame % spinnerFrames.length];
}

// Usage in render loop:
// setInterval(() => { frame = (frame + 1) % 10; render(); }, 125);
```

### 6.2 Progress Update

**Format String:**
```
{█ repeated}{░ repeated}  {percentage}%  [{completed}/{total}]
```

**Fill Calculation:**
```typescript
function formatProgress(percentage: number, completed: number, total: number, width: number): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) +
         `  ${percentage.toString().padStart(3)}%` +
         `  [${completed}/${total}]`;
}

// Example: 40% with bar width 50
// "████████████████████░░░░░░░░░░░░░░░░░░░░░░░  40%  [4/10]"
```

### 6.3 Typing Indicator

**Pattern:** Three dots cycling with position
**Frame Duration:** 300ms per cycle

```
Stage 0: .
Stage 1: ..
Stage 2: ...
Stage 3: (reset to Stage 0)
```

```typescript
const typingStates = ['.  ', '.. ', '...'];

function renderTypingIndicator(frame: number): string {
  return typingStates[frame % 3];
}
```

### 6.4 Blinking Cursor

**On Duration:** 500ms
**Off Duration:** 500ms

```typescript
function shouldShowCursor(frame: number): boolean {
  return frame % 2 === 0;
}

// Cursor character: █
// Render: shouldShowCursor ? '█' : ' '
// Frame interval: 500ms
```

### 6.5 Indeterminate Progress

**Pattern:** Animated bar fill moving left to right
**Frame Duration:** 100ms
**Bar Width:** 40 characters (default)

```typescript
function renderIndeterminateProgress(frame: number, width: number): string {
  const filledCount = Math.floor(width / 4);
  const startPos = frame % width;
  const endPos = (startPos + filledCount) % width;

  if (endPos > startPos) {
    // Normal case: no wrap
    return '░'.repeat(startPos) + '█'.repeat(filledCount) + '░'.repeat(width - endPos);
  } else {
    // Wrap case
    const part1 = '█'.repeat(endPos);
    const part2 = '░'.repeat(startPos - endPos);
    const part3 = '█'.repeat(filledCount - (width - startPos));
    return part1 + part2 + part3 + '░'.repeat(width - filledCount);
  }
}
```

---

## 7. ACCESSIBILITY CONSIDERATIONS

### Color Independence

All information conveyed by color must also be conveyed through:
- Text labels
- Icons/symbols
- Position
- Pattern

Example:
```
Error: [X] Cannot connect to database (color + symbol + text)
Success: [OK] Connection established (symbol + text)
```

### Contrast Ratio

- Primary text on background: 15:1 (passes AAA)
- Muted text on background: 7:1 (passes AA)
- Minimum acceptable: 4.5:1 for any text

### Motion Safety

Support reduced-motion preference:
```bash
# Check environment
if [ "$REDUCED_MOTION" = "true" ] || [ "$TERM_FEATURES" = "basic" ]; then
  # Disable animations
  # Use static progress or "Processing..." without animation
fi
```

**Fallbacks when animations disabled:**
- Spinner: Static `[+]` or `(...)`
- Progress: `[████████████░░░░░░░░░░░░░░]` 40% (no animation)
- Typing: `[...]` (no cycling)
- Cursor: Static `█` (no blinking)

### Screen Reader Compatibility

Structure output for screen readers:
```
[USER MESSAGE] Start: What's your first task?
[AGENT MESSAGE] Start: I'll help you build a React app...
[ERROR] Start: File not found
[SUCCESS] File created successfully
```

---

## 8. FORMATTING UTILITIES

### Text Wrapping

```typescript
function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).length <= maxWidth) {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines;
}
```

### Table Formatting

```typescript
function formatTable(headers: string[], rows: string[][], columnWidths?: number[]): string {
  const widths = columnWidths || headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] || '').length)) + 2
  );

  const separator = widths.map(w => '-'.repeat(w)).join('+');
  const topBorder = '+' + separator.split('+').map(s => s.replace(/-/g, '-')).join('+') + '+';
  const midBorder = '+' + separator.replace(/-/g, '-').split('+').map(s => s.replace(/-/g, '-')).join('+') + '+';
  const botBorder = '+' + separator.split('+').map(s => s.replace(/-/g, '-')).join('+') + '+';

  const formatRow = (cells: string[]) =>
    '+' + cells.map((c, i) => c.padEnd(widths[i] - 1)).join(' ') + '+';

  return [
    topBorder,
    formatRow(headers),
    midBorder,
    ...rows.map(formatRow),
    botBorder
  ].join('\n');
}

// Usage: formatTable(['Name', 'Type'], [['email', 'string'], ['id', 'uuid']])
```

### ANSI Code Helpers

```typescript
const ANSI = {
  // Reset
  reset:   '\x1b[0m',

  // Styles
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',

  // Foreground colors (38;5;N)
  fg: (n: number) => `\x1b[38;5;${n}m`,

  // Background colors (48;5;N)
  bg: (n: number) => `\x1b[48;5;${n}m`,

  // Color shortcuts
  primary: '\x1b[38;5;93m',
  primaryBg: '\x1b[48;5;57m',
  success: '\x1b[38;5;82m',
  successBg: '\x1b[48;5;22m',
  warning: '\x1b[38;5;214m',
  warningBg: '\x1b[48;5;220m',
  error: '\x1b[38;5;196m',
  errorBg: '\x1b[48;5;52m',
  info: '\x1b[38;5;75m',
  infoBg: '\x1b[48;5;25m',
  text: '\x1b[38;5;255m',
  muted: '\x1b[38;5;145m',
  surface: '\x1b[48;5;59m',
  surfaceAlt: '\x1b[48;5;60m',
  border: '\x1b[38;5;59m',
};

// Helper function for styled text
function styled(text: string, ...styles: string[]): string {
  return styles.join('') + text + ANSI.reset;
}

// Usage examples:
// styled('Hello', ANSI.primary, ANSI.bold)  -> purple bold "Hello"
// styled('[OK]', ANSI.success, ANSI.bold)    -> green bold "[OK]"
```

---

## 9. QUICK REFERENCE

### Common Patterns

| Pattern | Syntax |
|---------|--------|
| Red text | `\x1b[38;5;196m{text}\x1b[0m` |
| Bold label | `\x1b[1m{label}\x1b[0m` |
| Highlighted | `\x1b[38;5;93m{text}\x1b[0m` |
| Code inline | `\x1b[48;5;59m {text} \x1b[0m` |
| Muted | `\x1b[2m{text}\x1b[0m` |

### Component Quick Use

```bash
# Error box
echo -e "${ERROR}╔═══════════════════╗${RESET}"

# Success indicator
echo -e "${SUCCESS}OK${RESET} Task created"

# Agent badge
echo -e "[${PRIMARY}project-manager${RESET}]"

# Code block header
echo -e "${SURFACE}┌─[${MUTED}typescript${SURFACE}]${RESET}"
```

### Color Values Reference

| Name | Hex | Code | Description |
|------|-----|------|-------------|
| primary | #7C3AED | 93 | Main brand purple |
| primaryDim | #6D28D9 | 57 | Darker purple |
| success | #22C55E | 82 | Green for user msg |
| warning | #F59E0B | 214 | Amber warnings |
| error | #EF4444 | 196 | Red errors |
| info | #3B82F6 | 75 | Blue info |
| background | #0F172A | 17 | Dark slate bg |
| surface | #1E293B | 59 | Code block bg |
| text | #F8FAFC | 255 | White text |
| muted | #94A3B8 | 145 | Gray text |

---

*Design System v1.0.0 - Agent-Termo Terminal UI*

---

## 10. MULTI-AGENT WORKSPACE (LIVE TUI)

**Status:** visual specification for the workspace contract in `docs/architecture.md` §21. The architecture is authoritative for behavior, data flow, selection, routing, retention, and keyboard dispatch; this section covers only what the user sees. Workspace product code landed on `feat/subagent-workspace`; the live renderer is `src/ui/tui.tsx` (`@opentui/solid` 0.9.7). **The live colors are Warm Terminal — the restored pre-Carbon-Forge palette.** Carbon Forge was applied on 2026-11-23 and reverted at the user's request; `src/ui/theme.ts` is the single source of truth and §11 is the current visual authority. The palette in 10.1 is the restored live palette (role assignments are superseded by §11); 10.3–10.9 use the Warm Terminal roles.

### 10.1 Palette reality, live tokens, and constraints (superseded by §11)

> **Superseded by §11 (Warm Terminal, restored 2026-11-23).** Carbon Forge briefly replaced this palette and was reverted at the user's request; the pre-Carbon-Forge warm values below are live again. The authoritative palette, derivation, contrast ratios, and semantic rules are in §11. The live TUI must consume `COLORS`/`ROLES` from `src/ui/theme.ts`; do not use a raw hex value from this 10.1 table at a call site.

**Historical state:** at the workspace build there was no theme/token module and no light mode. Colors were hardcoded hex literals at call sites in `src/ui/tui.tsx`; the root box set `backgroundColor="#11100F"`. There was no `ThemeProvider`, no `createTheme`, no theme preference, and no light variant. **Current state:** a flat, dependency-free token module exists (`src/ui/theme.ts`, export `COLORS` and `ROLES`) and now holds the restored Warm Terminal palette. There is still no provider and no light mode, by design.

**The legacy ANSI table above is historical.** Sections 1–9 describe the retired blessed/ANSI 256 renderer (purple `#7C3AED`, slate `#0F172A`, ANSI 93/75, boxed message bubbles). That is not the live UI. For the live TUI, Warm Terminal (§11) **supersedes** both the legacy ANSI table and every Carbon Forge color reference below. Do not use legacy `primary`/`info` purple/blue tokens or ANSI 93/75 for the workspace.

#### Warm Terminal live tokens (restored; §11.1 is authoritative)

| Token | Hex | Verified live usage | Contrast on `#11100F` |
|---|---|---|---|
| `background` | `#11100F` | root page background | — |
| `accent` | `#D99168` | header title, composer prefix, terminal title, selected picker border | 7.4:1 (AAA) |
| `accentSelected` | `#F0B38D` | selected picker/completion item; navigator selected marker/name | 10.4:1 (AAA) |
| `border` | `#6D625A` | single panel/terminal/composer border in ask mode, header border, structural separators, existing main assistant label | 3.2:1 (passes 3:1 non-text; not a small body-text color) |
| `textPrimary` | `#E6E1DC` | body and markdown | 14.6:1 (AAA) |
| `textSecondary` | `#C9C1BA` | terminal output; navigator activity text | 10.7:1 (AAA) |
| `textSecondaryAlt` | `#D0C9C2` | picker rows, secret bullets | 11.6:1 (AAA) |
| `muted` | `#8D857D` | header version, bottom status line, hint row, terminal command | 5.2:1 (AA) |
| `mutedHeader` | `#89827C` | header model/project | 5.0:1 (AA) |
| `dim` | `#88827C` | dim log entries; navigator metadata; stopped status | 5.0:1 (AA) |
| `mutedPicker` | `#8F8982` | picker filter/headers/hints | 5.5:1 (AA) |
| `mutedCompletion` | `#8EAAA8` | unselected completion suggestion | 7.7:1 (AAA) |
| `userSuccess` | `#8FCB9B` | user entries, success, completed status | 10.1:1 (AAA) |
| `info` | `#8BB7D8` | info lines | 8.9:1 (AAA) |
| `toolWaiting` | `#79B8D1` | tool lines, waiting status, links, owner banner | 8.7:1 (AAA) |
| `running` | `#E2A078` | running status, markdown heading 1 | 8.6:1 (AAA) |
| `error` | `#E47D76` | errors, failed status | 6.8:1 (AA) |
| `autoPermission` | `#FF5555` | existing auto-permission composer border | 6.1:1 as text; border is paired with the `auto` text label |

Ratios are WCAG 2.x relative-luminance ratios against `#11100F`, rounded to one decimal. `#6D625A` is a divider/label token, not a body-text token. Diff colors (`#B7E4C7` on `#17351F`, `#F0B4AE` on `#3A1D1D`, `#BDB6AE` context) are live again; see §11.1 and §11.3. This table is the restored palette; still never add a raw call-site hex from it. The left-hand names are the pre-theme source token names kept for provenance; §11.3 lists the semantic role names the implementation consumes.

#### Type, spacing, and chrome tokens

| Token | Value |
|---|---|
| font | terminal monospace; no font family or size change |
| horizontal unit | 1 cell; page `paddingX=1`; content entries `paddingX=1` |
| vertical rhythm | 1 line; no blank spacer rows inside the workspace |
| content separator | one `─` row in `border` (`#6D625A`) |
| borders | `single` for panels/composer/terminal; `rounded` only for the header and picker; the navigator has no border. Structural borders use `border`; the picker border uses `brand` (`#D99168`) (§11.3) |
| radius/shadow | none (terminal) |
| motion | existing spinner/streaming only; no new animation |
| focus fill | none; focus is the permission-colored composer border (active `ask` `#6D625A`, `files` `#D99168`, `auto` `#FF5555`) + native cursor + footer text + `▸` marker (§11.4) |

### 10.2 Layout and density

Top to bottom, one column, `gap=0`:

| # | Region | Height / flex | Notes |
|---|---|---|---|
| 1 | Existing header | existing, `flexShrink=0` | keep the existing rounded border in `border` (`#6D625A`) on the page background; no workspace changes |
| 2 | Selected-agent content | `flexGrow=1`, `minHeight=0` | contains the status row, separator, and scrollbox below |
| 2a | Content status row | 1 line, non-scrolling | selected agent's real status, never boxed |
| 2b | Thin separator | 1 line | `─` in `border` (`#6D625A`), spans the content inner width |
| 2c | Scrollbox | remainder | existing entry rendering; per-agent scroll (10.6) |
| 3 | Terminal panel | existing, `flexShrink=0` | existing position and 8-row compact / ~60% expanded heights; no fill, the `#11100F` page background shows through |
| 4 | Picker / completion overlays | existing, `flexShrink=0` | existing order above the composer; picker remains rounded `brand` (`#D99168`) |
| 5 | Composer | existing single-border box; 3–8 textarea rows, `flexShrink=0` | 10.3 |
| 6 | Agent navigator | `flexShrink=0`; up to 7 agent rows + up to 2 overflow lines (no hint row) | directly below the composer; no border, no box |
| 7 | Warm Terminal footer | 1 line, `flexShrink=0` | the only shortcut/status surface; replaces the old navigator hint row and bottom status line (§11.5) |

Density rules:

- The navigator sits directly below the composer and above the Warm Terminal footer. It is never a sidebar, float, or boxed panel.
- No blank spacer rows. The only new separator is the one-line rule under the content status row; the composer's existing border remains the divider above the navigator.
- The navigator never squeezes the content area; content shrinks first, then overlays/textarea budgets. `overlayAvailableRows` and `promptInputHeight` must subtract the navigator's rendered rows per §21.6 (plus any approval banner/notice row, 10.3) and the fixed 1-row footer.
- The agent list region is at most 7 agent rows plus at most 2 overflow indicator lines (absolute maximum 9 navigator lines). The selected row is always present. On short terminals reduce the visible agent rows first so the content area keeps usable height.
- Minimum supported terminal is the existing 40 columns × 12 rows (`layoutSupported`). At 80 × 24 the two-sub-agent example shows header (3) + content status row (2) + content (10) + composer (5) + navigator (3: main + two agents) + footer (1) = 24.
- Every row is exactly one line. No row wraps and no horizontal scrolling is introduced; overflow is clipped with `…` (10.4).

### 10.3 Composer

Structure (existing single border, unchanged chrome):

```
┌────────────────────────────────────────────────────┐
│ @<name> ❯ <draft or placeholder>                   │
└────────────────────────────────────────────────────┘
```

- Prefix: exactly `@<name> ❯` followed by one space before the textarea, in `brand` (`#D99168`). The target updates immediately on selection; the prefix and placeholder never lag the selected row.
- Placeholder: exactly `Message @<name>…` (U+2026), only while the draft is empty.
- Prefix budget is the visible `@<name> ❯` (excluding the single trailing space before the textarea):

| Terminal width | Max prefix cells |
|---|---|
| >= 80 | 24 |
| 60–79 | 20 |
| 40–59 | 14 |

  If the name is longer, clip only the name with `…`; `@` and ` ❯` always remain. Example at 24 cells: `@backend-architecture… ❯` (the real 29-character agent name is clipped, the target is still identifiable).
- Textarea keeps `flexGrow=1`, `flexBasis=0`, `minWidth=0`; no horizontal overflow.
- Multiline: existing `promptInputHeight` behavior, 3–8 rows, grows upward; the navigator stays fixed and content shrinks. Drafts are per-agent; switching saves the old draft and loads the target's draft.
- Border style stays `single`. **Warm Terminal border rule:** an inactive composer (navigator focus, modal-owned input) uses `composerBorder` `#6D625A`; an active composer uses the permission color — `ask` `#6D625A`, `files` `#D99168`, `auto` `#FF5555` (§11.4). The bright red accept-all/auto border is intentionally restored (it is not banned), and `ask`/`files`/`auto` is also stated as text in the footer (§11.5), so permission is never color-only.

#### Composer states

| State | Border | Prefix / body | Cursor | Banner / notice | Footer (§11.5) |
|---|---|---|---|---|---|
| Composer focused (default) | permission color: `ask` `#6D625A`, `files` `#D99168`, `auto` `#FF5555` | `@<name> ❯`; placeholder or draft | visible (native textarea cursor) | none | canonical shortcut cluster |
| Navigator focused | `composerBorder` `#6D625A` (input inactive) | same; draft preserved | absent | none | navigator shortcut cluster |
| Modal-owned: approval | `composerBorder` `#6D625A` | same; draft preserved, unfocused | absent | `◔ Approval required from @<name>` above composer | paused cluster |
| Modal-owned: picker | `composerBorder` `#6D625A`; textarea unfocused because the picker owns keys | same; draft preserved | absent | no extra banner; the picker title is the owner indicator | paused cluster |
| Modal-owned: secret | permission color (the composer itself owns keys) | prefix + masked `•` bullets in `textAlt` `#D0C9C2`; no placeholder | absent (masked input) | no extra banner; the masked field is the owner indicator | paused cluster |
| Rejected notice | permission color (focused) | same; **draft retained**, nothing sent | visible | `✗ <message>` in `error` `#E47D76`, auto-clears after 4,000 ms | canonical cluster |
| Empty submit | permission color | placeholder remains | visible | none (empty is suppressed by the UI) | canonical cluster |
| Multiline | permission color | 2+ draft lines | visible | none | canonical cluster |

Banner/notice rules:

- The approval banner is one line, no box, directly above the composer: `◔ Approval required from @<name>` in `approval` (`#79B8D1`). The name is the requesting agent, not necessarily the composer target.
- A rejection notice replaces the banner slot: `✗ <message>` in `error` (`#E47D76`), auto-clears after 4,000 ms. A new rejection restarts the timer. The draft is never cleared or redirected on rejection.
- At most one banner/notice row is visible. The modal banner wins over a stale notice; a notice never appears while a modal owns the keyboard.
- The banner/notice row is outside the composer border, consumes 1 line, and must be included in the height budgets mentioned in 10.2.

Focus indication never relies on color alone:

- The native textarea cursor is present only when the composer owns keys; the composer border switches from `composerBorder` `#6D625A` to the active permission color.
- The footer shortcut cluster changes between composer, navigator, and paused states (§11.5); the context cluster stays.
- Approval has an explicit owner banner; rejection has an explicit notice.
- The `@<name> ❯` prefix identifies the dispatch target at all times; it is not a focus indicator.

Approval/picker/secret all freeze the navigator per §21.2 D4. Approval suspends the composer via `suspend`/`resume` and preserves the draft; picker/secret keep their existing input ownership. No workspace change clears a draft behind the user's back.

### 10.4 Navigator row anatomy

One line per row; never wrap; no horizontal overflow:

```
[marker 2][tree prefix][glyph 1][space 1][name][metadata]
```

- Marker: `▸ ` in `selection` (`#F0B38D`) when selected; `  ` (two spaces) otherwise. Selection is independent of keyboard focus and persists when the composer is focused.
- Tree prefix: depth 0 has none. Depth `d > 0` uses `(d - 1) × 2` spaces followed by `├ ` when a later sibling exists in DFS order, or `└ ` for the last sibling. No vertical `│` guides are used (not in the contract). Depth 1 therefore starts at the connector; depth 2 indents by two spaces before its connector.
- Status glyph: exactly `○` idle, `◐` running, `◔` waiting, `✓` completed, `✗` failed, `!` stopped, followed by one space.
- Name: `main` for the main row; the sub-agent display name otherwise. No `@` in the navigator. Append `#<first 6 id chars>` with no space, only when the runtime marks `duplicateName` (for example `review-agent#a1b2c3`).
- Metadata: segments separated by ` · ` (space, U+00B7, space). Never render an absent segment, a placeholder dash, or a fabricated value.
- Selected styling: marker `▸` and the name are bold `selection` `#F0B38D`; the glyph keeps its status color; metadata uses its normal color. No row background, inversion, or rounded box.
- Normal name color: `text` (`#E6E1DC`) for every unselected row, main and sub-agent alike; the selected name is bold `selection` (`#F0B38D`). Navigator names are uniform — there is no muted or teal per-kind sub-agent name, and the selected row is the only row in `selection`.

Layout examples:

```
  ○ main · Idle · project-manager · 12k tok
  ├ ◐ frontend-expert · Running · editing src/ui/App.tsx
  └ ✓ test-agent · Completed · auth tests · 1.2k tok
```

```
▸ ├ ◐ frontend-expert · Running · editing src/ui/App.tsx · since 14:03
    ├ ✓ frontend-expert#a1b2c3 · Completed · 1.2k tok
    └ ◐ frontend-expert#d4e5f6 · Running · writing tests
  └ ✓ test-agent · Completed · auth tests
```

#### Row widths and truncation

| Terminal width | Max name cells | Behavior |
|---|---|---|
| >= 80 | 32 | full names fit (`backend-architecture-designer` = 29) |
| 60–79 | 22 | clip name only if needed, with `…` |
| 40–59 | 14 | clip name and detail earlier, minimum 8 visible name cells |

- Name clipping keeps at least 8 visible characters plus `…`. If the row is a duplicate name, the `#id6` suffix is part of the retained identity whenever the field is at least 8 cells.
- After the optional metadata is dropped (below), if a row still overflows: clip the activity/detail to at least 8 cells plus `…`, then clip the name to at least 8 cells plus `…`. Never clip the glyph, the status label, or the selected marker.
- Metadata is never allowed to push the row past the terminal width. Overflow is always an ellipsis, never a wrap or a second line.

#### Metadata order and narrow-terminal priority

Main row metadata, in display order:

1. status label (`Idle`, `Running`, `Waiting`)
2. `activeAgentName` when `/agent` is active, as a plain name (no `@`)
3. clipped goal when present
4. `waiting on N subagent` / `waiting on N subagents` when direct active children exist
5. `since HH:MM` while running/waiting (session start)
6. `N tok` when usage exists
7. `N queued` when greater than 0

Sub-agent row metadata, in display order:

1. status label (`Idle`, `Running`, `Waiting`, `Completed`, `Failed`, `Stopped`)
2. live detail: `activity` while running/waiting
3. completed detail: clipped task
4. failed detail: first error line, in `error` (`#E47D76`)
5. stopped: no detail segment (the status label already says `Stopped`; see 10.10 item 3)
6. `since HH:MM` while live, or the existing `formatDuration(endedAt - startedAt)` when terminal
7. `N tok` when usage exists
8. `N queued` when greater than 0

Drop order when narrow — first dropped first:

1. `N tok`
2. `since HH:MM` / terminal duration
3. goal (main) or completed task (sub-agent)
4. active-agent name (main)

Always kept: marker, tree prefix, glyph, name, status label, live activity, failed error line, `waiting on N`, and `N queued`. Times use local `toLocaleTimeString` with hour and minute only; elapsed is wall-clock, not compute time, and is labelled `since` while live. The 1,000 ms `now` tick updates only duration text; it does not reorder rows or trigger transcript re-renders.

Status text color: the label uses its status color (10.5 / §11.3); the detail segment (live activity and `waiting on N`) uses `detailText` (`#C9C1BA`); the failed error line uses `error` (`#E47D76`); all other metadata uses `dimText` (`#88827C`), including the ` · ` separators. Navigator names use `text` (`#E6E1DC`) for every unselected row, main and sub-agent alike; the selected name uses `selection` `#F0B38D`.

#### Window and overflow

- List region: at most 7 agent rows, plus up to two overflow lines when agents are hidden. The hint row is removed; the footer is a separate fixed row. Absolute navigator maximum is 9 lines. The window always contains the selected row and slides to keep it visible; there is no scrollbar and no mouse scrolling.
- Hidden agents are represented by dim overflow rows, aligned in the marker column:
  `… 3 above` / `… 2 below`, `dimText` (`#88827C`), one line each, not selectable.
- Overflow lines appear only when needed; with 7 or fewer agents there are none.
- With no sub-agents the navigator is exactly one `main` row; the footer is separate and always present.
- New sub-agents append a row without changing selection. Completed, failed, and stopped rows remain for the session; no fading, strike-through, or auto-removal.
- Rows keep the tree builder's DFS order `(startedAt, id)`; live status changes update in place and never reorder.

### 10.5 Status and semantic colors

Every state uses **glyph + label + color**. Color is never the only carrier of meaning.

| Status | Glyph | Label | Warm Terminal role | Contrast on `#11100F` | Additional signal |
|---|---|---|---|---|---|
| idle | `○` | `Idle` | `statusIdle` = `mutedText` `#8D857D` | 5.2:1 | glyph + label |
| running | `◐` | `Running` | `statusRunning` = `running` `#E2A078` | 8.6:1 | glyph + label + live activity |
| waiting | `◔` | `Waiting` | `statusWaiting` = `toolWaiting` `#79B8D1` | 8.7:1 | glyph + label + approval banner/`waiting` detail |
| completed | `✓` | `Completed` | `statusCompleted` = `success` `#8FCB9B` | 10.1:1 | glyph + label + task |
| failed | `✗` | `Failed` | `statusFailed` = `error` `#E47D76` | 6.8:1 | glyph + label + error line |
| stopped | `!` | `Stopped` | `statusStopped` = `dimText` `#88827C` | 5.0:1 | glyph + label |

Row and content semantics:

| Element | Warm Terminal role | Notes |
|---|---|---|
| selected marker + name | `selection` `#F0B38D`, bold | 10.4:1; `▸` also marks selection |
| normal main row name | `text` `#E6E1DC` | 14.6:1 |
| normal sub-agent row name | `text` `#E6E1DC` | 14.6:1; identical to the main row — navigator names are uniform and only the selected row uses `selection` |
| status label/glyph | status role above | glyph + word always present |
| live activity / `waiting on N` detail | `detailText` `#C9C1BA` | 10.7:1 |
| failed error detail | `error` `#E47D76` | 6.8:1 |
| other metadata | `dimText` `#88827C` | 5.0:1 |
| structural separators (the `─` content rule) / panel border | `border` `#6D625A` | 3.2:1; passes the 3:1 non-text threshold; focus never relies on it. Navigator metadata ` · ` separators are `dimText`, not `border` (10.4) |
| footer / hint text | `mutedText` `#8D857D` | 5.2:1 |
| content status `@name` (main and sub-agent) | `brand` `#D99168` | 7.4:1; the pre-theme status accent is `brand` for both kinds — the old code passed no subagent flag |
| content status ` · ` separators | `border` `#6D625A` | 3.2:1 (non-text) |
| content status detail (activity/task) | `detailText` `#C9C1BA` | 10.7:1 |
| content status elapsed/tokens | `dimText` `#88827C` | 5.0:1 |

- Running and waiting differ by glyph (`◐`/`◔`), word, and color; no spinner or "Thinking" state is invented.
- The selected row's status glyph keeps the status color so status remains readable even when the row is selected.
- The warm palette supersedes the legacy ANSI table for the live TUI. Do not use `#7C3AED`, `#6D28D9`, `#3B82F6`, `#22C55E`, or ANSI 93/75 here. `info` `#8BB7D8` and `toolWaiting` `#79B8D1` are distinct live roles: tool lines, waiting, links, and the approval banner use `#79B8D1`; informational `info` lines use `#8BB7D8`.
- **Permission semantics use border plus text.** `ask`/`files`/`auto` are displayed as text in the footer (§11.5). When the composer owns keys, its border again encodes the mode: `ask` `#6D625A`, `files` `#D99168`, `auto` `#FF5555`; an inactive composer is `composerBorder` `#6D625A`. The bright red accept-all/auto border is intentionally restored and is not banned.

### 10.6 Content area

#### Status row

Exactly one non-scrolling line at the top of the content area, followed by the one-line `─` separator:

```
@<name> · <Status> · <activity|task|error> · <elapsed> · <N> tok
```

- `@<name>` in `brand` `#D99168` for every selected agent, main and sub-agent alike (`contentStatusColor(role="accent")`; the old code passed no subagent flag); separators ` · ` in `border` `#6D625A`; status label in its status color; detail in `detailText` `#C9C1BA`, failed detail in `error` `#E47D76`; elapsed/tokens and fallback text in `dimText` `#88827C`.
- Only real values are shown. Omit absent segments without leaving double or trailing separators. Tokens are cumulative per agent (§21.10) and are omitted until the runtime reports usage.
- Main: detail is the real `activity` (`ready`, `working`, `waiting for your approval`); elapsed is shown only while running/waiting and means session-start elapsed.
- Sub-agent: live detail is `activity`; completed detail is the clipped task; failed detail is the first error line; stopped has no detail. Elapsed is `since HH:MM` while live and the existing duration format when terminal.
- On narrow terminals the same drop order as 10.4 applies to the optional segments; the row always keeps `@<name>` and the status label. It never wraps.
- The status row and separator are never boxed and never scroll with the transcript.

#### Main selected

Render the existing `entries` exactly as today:

- `❯ You` label in `userLabel` `#8FCB9B`; user body text in `userText` `#8FCB9B`
- `⏺ Agent-Termo` in `assistantLabel` `#6D625A` (3.2:1; the restored pre-theme label, paired with the `⏺` glyph and body text)
- tool calls/results in the existing grammar and colors (`● tool(args)` `tool` `#79B8D1`; `⎿ ✓ …` `success` `#8FCB9B`; `⎿ ✗ …` `error` `#E47D76`; bash output `dimText` `#88827C`)
- markdown via the existing `<markdown>` component; streaming via its existing `streaming` prop; markdown roles per §11.3
- info `#8BB7D8`, success `#8FCB9B`, error `#E47D76`, dim `#88827C`
- diffs with the restored source pairs: add text `#B7E4C7` on `#17351F`; remove text `#F0B4AE` on `#3A1D1D`; context text `#BDB6AE` on the page background

#### Sub-agent selected

Render only the selected agent's stored transcript (`transcriptToUiEntries`), never the main `entries` and never another agent's transcript:

- User entry: `❯ You` in `userLabel` `#8FCB9B`, followed by `→ @<name>` also in `userLabel` `#8FCB9B` (the pre-theme line rendered the whole `❯ You → @<name>` line in one `#8FCB9B` text node; there is no separate target color). The first such entry is the delegated task plus optional context; it is not a duplicate of the parent's user message.
- Assistant entry: `⏺ <name>` in `subagentLabel` muted (`#8D857D`; the main label is `assistantLabel` `#6D625A`), followed by streamed markdown in `text` via the existing component.
- Tool call: `● <name>(<args summary>)` in `tool` `#79B8D1`.
- Tool result: `⎿ ✓ <summary>` in `success` `#8FCB9B`; failure `⎿ ✗ <summary>` in `error` `#E47D76`; multi-line bash output indented and `dimText` `#88827C`.
- Lifecycle/status entry: `— <Status>` plus an optional ` · <detail>` when the transcript provides one, in `dimText` `#88827C`. Do not invent a status line for every iteration.
- Error entry: `✗ <first line>` in `error` `#E47D76`; the full capped text stays in the transcript.
- Streaming: the existing `<markdown streaming>` output is the only streaming visual. The navigator's `◐` + activity and the content status row's `Running` are the working indicators. There is no "Thinking" state, spinner, or fabricated progress.
- Empty transcript: exactly `No activity yet for @<name>.` in `dimText` `#88827C`, one line at the top of the content area, no box. The composer remains enabled.
- Parent/child separation: the main transcript's `agent:delegate` call/result and the original parent user message stay in main only. The sub-agent sees its delegated task and its own work only. No duplicated parent history.

#### Scroll behavior

- One scrollbox for the selected transcript. Save `scrollTop` per agent on switch and restore it after layout (`scrollTo`); the first view of an agent starts at the bottom.
- Tail-follow only when the view was measured at the bottom before the update (`scrollTop + viewport.height >= scrollHeight - 2` in `afterLayout`). No unconditional `stickyScroll`.
- Background agents keep receiving entries; they do not touch the selected scrollbox, force a re-render, or move the scroll position.
- No new scrollbar, "jump to bottom" control, or "new activity" badge is added. Scroll preservation is the only new visual behavior. (A new-activity indicator would be a new behavior beyond §21.6; see 10.10 item 7.)

### 10.7 States and edge cases

| Case | Visual result |
|---|---|
| No sub-agents | navigator is one `main` row (plus the separate footer); no overflow lines |
| New sub-agent | row appears in DFS order; `▸` does not jump; no toast or flash; content is unchanged |
| Completed | `✓` row retained; detail task + terminal duration; transcript retained; composer enabled |
| Failed | `✗` row with first error line; `error` `#E47D76` at transcript end; conversation retained; composer enabled for follow-up |
| Stopped | `!` row in dim; status label only; transcript retained; composer enabled for follow-up |
| Main waiting on children | main row `Waiting · waiting on N subagents`; each child keeps its own status; no fake parent node |
| Multiple active | each row shows its own `◐`/`◔`; selection is independent; only the selected transcript renders |
| Nested | indentation is generic; runtime exposes one level today; no `│` guides invented |
| Selected agent finishes | stays selected; id remains valid; status updates in place; no selection jump |
| Long name | clipped with `…`; duplicate `#id6` retained; composer prefix also clips the name |
| Long task/error | row detail clipped with `…`; the transcript holds the full capped text |
| Narrow < 80 | drop usage, then since, then goal/task, then active-agent name; the footer drops whole segments per §11.5 (never wraps) |
| Narrow < 60 | names/details clip to the minimum 8 cells; composer prefix max 14 cells; every row stays one line |
| Resize | recompute row widths and overlay budgets; selected row stays visible; saved scroll position restored; order unchanged |
| Dark palette reality | Warm Terminal dark-only (`background` `#11100F`); no light mode; terminal theme changes are not an app light mode |
| Streaming | existing markdown streaming; navigator `◐` + activity; no "Thinking" |

Illustrative mockups are plain text and are not drawn to exact column width; the clipping and color rules above are authoritative. Color is described beneath each block.

**A. Main with two sub-agents, composer focused**

```
╭─ Agent-Termo ────────────────────────────────────────╮
│ ✻ Agent-Termo v2.0.6     nemotron · agent-termo      │
╰──────────────────────────────────────────────────────╯
@main · Idle · ready · 12k tok
──────────────────────────────────────────────────────
❯ You
Review the auth changes.

⏺ Agent-Termo
Delegating the review to frontend-expert.
● agent:delegate(agent="frontend-expert", task="Review auth")
⎿ ✓ delegated

┌────────────────────────────────────────────────────┐
│ @main ❯ Message @main…                             │
└────────────────────────────────────────────────────┘
▸ ○ main · Idle · project-manager · 12k tok
  ├ ◐ frontend-expert · Running · editing src/ui/App.tsx
  └ ✓ test-agent · Completed · auth tests · 1.2k tok
Ctrl+X navigate · ↑/↓ select · Enter send · Esc parent · Ctrl+X Ctrl+K stop all · context ▰▰▱▱▱▱▱ 28% · 12k/43k · low · auto · session ~34,000
```

Colors: selected `▸ main` in `selection` `#F0B38D` bold; every unselected navigator name (main and sub-agent alike) in `text` `#E6E1DC`; `◐` `statusRunning` `#E2A078`; `✓` `statusCompleted` `#8FCB9B`; metadata `dimText` `#88827C`; footer `mutedText` `#8D857D`; composer prefix `brand` `#D99168`. The frontend row's usage and since were dropped by the narrow-row priority (illustrative), not omitted by the runtime.

**B. Failed sub-agent selected**

```
@review-agent · Failed · typecheck failed: TS2345 · since 14:02 · 3.1k tok
──────────────────────────────────────────────────────
❯ You → @review-agent
Review the auth changes.
⏺ review-agent
● bash:execute(command="bun run typecheck")
⎿ ✗ terminal output
     src/auth.ts(42,7): error TS2345: Argument of type ...
— Failed · verification gate
✗ typecheck failed: 1 error

┌────────────────────────────────────────────────────┐
│ @review-agent ❯ Message @review-agent…             │
└────────────────────────────────────────────────────┘
  ○ main · Idle · 12k tok
▸ ├ ✗ review-agent · Failed · typecheck failed: TS2345 · 2m 14s
  └ ✓ test-agent · Completed · auth tests · 1.2k tok
Ctrl+X navigate · ↑/↓ select · Enter send · Esc parent · Ctrl+X Ctrl+K stop all · context ▰▱▱▱▱▱▱ 7% · 3.1k/43k · low · auto · session ~51,000
```

Colors: `✗` and error lines `error` `#E47D76`; assistant `⏺ review-agent` label `subagentLabel` muted `#8D857D`; tool line `tool` `#79B8D1`; dim status `dimText` `#88827C`; selected name `selection` `#F0B38D`. The failed row remains selected and the composer still targets `@review-agent`.

**C. Empty sub-agent selected**

```
@frontend-expert · Running · starting · since 14:05
──────────────────────────────────────────────────────
No activity yet for @frontend-expert.

┌────────────────────────────────────────────────────┐
│ @frontend-expert ❯ Message @frontend-expert…       │
└────────────────────────────────────────────────────┘
  ○ main · Idle · 12k tok
▸ ├ ◐ frontend-expert · Running · starting · since 14:05
  └ ✓ test-agent · Completed · auth tests · 1.2k tok
Ctrl+X navigate · ↑/↓ select · Enter send · Esc parent · Ctrl+X Ctrl+K stop all · context ▰▱▱▱▱▱▱ 7% · 3.1k/43k · low · auto · session ~35,000
```

The empty state is one dim line, not a box; the composer placeholder and prefix update immediately to `@frontend-expert`.

**D. Composer focused vs navigator focused**

Composer focused:

```
┌────────────────────────────────────────────────────┐
│ @main ❯ Message @main…                             │
└────────────────────────────────────────────────────┘
▸ ○ main · Idle · 12k tok
  ├ ◐ frontend-expert · Running · editing App.tsx
  └ ✓ test-agent · Completed
Ctrl+X navigate · ↑/↓ select · Enter send · Esc parent · Ctrl+X Ctrl+K stop all · context ▰▰▱▱▱▱▱ 28% · 12k/43k · low · auto · session ~34,000
```

Navigator focused:

```
┌────────────────────────────────────────────────────┐
│ @main ❯ unsent draft kept here                     │
└────────────────────────────────────────────────────┘
▸ ○ main · Idle · 12k tok
  ├ ◐ frontend-expert · Running · editing App.tsx
  └ ✓ test-agent · Completed
↑/↓ select · Enter focus composer · Esc parent · Ctrl+K stop terminal · Ctrl+X Ctrl+K stop all · context ▰▰▱▱▱▱▱ 28% · 12k/43k · low · auto · session ~34,000
```

Focus cues are non-color: the native cursor disappears, the footer shortcut cluster changes to the navigator variant, and the composer border returns to `composerBorder` `#6D625A` because input is inactive. The `▸` selection marker is present in both states; selection is not focus.

**E. Modal-owned composer (background sub-agent approval)**

```
@main · Idle · ready · 12k tok
──────────────────────────────────────────────────────
...selected main transcript...

◔ Approval required from @frontend-expert
┌────────────────────────────────────────────────────┐
│ @main ❯ unsent draft preserved                     │
└────────────────────────────────────────────────────┘
▸ ○ main · Idle · 12k tok
  ├ ◔ frontend-expert · Waiting · waiting for your approval
  └ ✓ test-agent · Completed
Navigator paused · finish the prompt to continue · context ▰▰▱▱▱▱▱ 28% · 12k/43k · low · auto · session ~34,000
```

The banner names the requester even though the composer targets `@main`. The banner uses `approval` `#79B8D1`; the composer border is `composerBorder` `#6D625A` because input is inactive. The draft is preserved; the navigator is frozen.

**F. Narrow terminal (under 60 columns, navigator focused)**

```
╭─ Agent-Termo ──────────────────────────╮
│ ✻ Agent-Termo v2.0.6   nemotron · repo │
╰────────────────────────────────────────╯
@frontend-expert · Running · editing…
──────────────────────────────────────
Editing src/ui/App.tsx.

┌──────────────────────────────────────┐
│ @frontend… ❯ Message @fron…         │
└──────────────────────────────────────┘
  ○ main · Idle · 12k
▸ ├ ◐ frontend-expe… · Running · editing…
  └ ✓ test-… · Completed
Ctrl+X Ctrl+K stop all · 12k/43k · auto
```

Usage, thinking, the meter, and the least-critical shortcut hints are dropped whole by the footer priority; names and details clip with `…`; no row wraps and no second shortcut row appears.

**G. Nested indentation (visual only; runtime depth is 1 today)**

```
  ○ main · Idle
  ├ ◐ project-manager · Running
    ├ ✓ frontend-expert · Completed
    └ ◐ backend-expert · Running
  └ ✓ test-agent · Completed
```

Depth is conveyed by two spaces per level plus `├ `/`└ `; no vertical guides.

### 10.8 Keyboard hint (Warm Terminal footer)

The navigator no longer has a hint row, and the old bottom status line is gone. Both are replaced by **one** footer row below the navigator (§11.5). The footer is always exactly one line, not selectable, no border, `mutedText` `#8D857D` with `dimText` `#88827C` separators; key chords may be bold. It never wraps and never adds a row.

Default (composer focused) shortcut cluster, in order:

`Ctrl+X navigate · ↑/↓ select · Enter send · Esc parent · Ctrl+X Ctrl+K stop all`

| State | Shortcut cluster (context cluster appended unchanged) |
|---|---|
| Composer focused (default) | `Ctrl+X navigate · ↑/↓ select · Enter send · Esc parent · Ctrl+X Ctrl+K stop all` |
| Navigator focused | `↑/↓ select · Enter focus composer · Esc parent · Ctrl+K stop terminal · Ctrl+X Ctrl+K stop all` |
| Modal open | `Navigator paused · finish the prompt to continue` |
| Transient status active | `status()` replaces the shortcut cluster until it clears (max 4,000 ms) |

- The context cluster from left to right is `context <meter> <pct> · <used>/<budget> · <thinking> · <permissionMode> · session <usage>`, populated from `ScreenState` as specified in §11.5.
- The default order is deliberate: `Ctrl+X navigate` precedes the arrow actions, so the footer does not imply that arrows navigate while the composer is typing.
- **The old composer bottom-right hint (`Enter send · Shift+Enter newline · Tab complete · Select text to copy · Ctrl+C quit`) is removed.** Its contents move into the footer and `/help`; do not keep a second hint line.
- All existing shortcuts are preserved per §21.2 D4 (`Ctrl+O`, `Ctrl+T`, `Tab`, `Shift+Enter`, history, completion, picker, secret, approval, `/subagents`); this section changes no binding.

### 10.9 Accessibility

- **Keyboard-only.** Every workspace action is reachable from the keyboard per the §21.2 D4 table. This is a terminal UI; the 44 px touch-target rule does not apply. Rows are full-width keyboard targets, and the composer remains the single text-entry surface.
- **Visible focus.** Focus is indicated by the native cursor, the permission-colored composer border (`ask` `#6D625A`, `files` `#D99168`, `auto` `#FF5555`), the footer shortcut-cluster variant, the `▸` selection marker, and bold selected name. Border color alone is never the only focus cue.
- **No color-only meaning.** Every status carries a glyph and a word (`○ Idle`, `◐ Running`, `◔ Waiting`, `✓ Completed`, `✗ Failed`, `! Stopped`). Failed rows carry an error line; queued and waiting states are stated in words. Permission mode is always text (`ask`/`files`/`auto`); its border color is a redundant secondary cue.
- **Contrast.** Functional body and metadata text is at least 5.0:1 against `#11100F` (5.0:1 is `dimText` idle/stopped/metadata; `mutedText` 5.2:1; body text 14.6:1; status colors 5.0–10.1:1; selected `#F0B38D` 10.4:1). `border` `#6D625A` is 3.2:1, passing the 3:1 non-text threshold; it is also the restored main assistant label at 3.2:1, which is below AA for small text — a deliberate restoration of the pre-theme value, paired with the `⏺` glyph and body text and never the sole carrier of meaning. `#FF5555` is 6.1:1 as text and is always paired with the `auto` label.
- **Theme reality.** Warm Terminal is dark-only; contrast is validated against `#11100F`. There is no light mode by design. Carbon Forge was reverted at the user's request.
- **Many agents.** The 7-agent-row window keeps the selected row visible, shows hidden counts above/below, and never shrinks text or introduces horizontal scrolling.
- **Truncation.** Only `…` is used; no mid-character cuts, no misleading placeholder values, and no fabricated usage, elapsed time, or "Thinking" state. Absent metrics are omitted.
- **Motion.** No new animation is introduced. Duration text updates on a 1,000 ms interval only while an agent is live; streaming uses the existing markdown component. Reduced-motion handling of the existing spinner is unchanged.

### 10.10 Open items for project-manager

1. **Light-mode acceptance criterion conflict (partially resolved).** §21.8 says "Dark/light themes work". Warm Terminal (the restored pre-Carbon-Forge palette; Carbon Forge was reverted) delivers a real theme module and a validated dark palette, but still no light mode. Amend the acceptance criterion to "Warm Terminal dark palette applied; no light mode required" or schedule a separate light variant with its own contrast validation.
2. **Navigator height cap.** This spec allows 7 agent rows + up to 2 overflow lines (max 9 navigator lines; the hint row is removed) and a fixed 1-row footer. On short terminals reduce the visible agent rows first to preserve content height; confirm the cap if a stricter 7-line navigator block was intended.
3. **Stopped metadata duplication.** §21.6 lists a `· stopped` detail segment in addition to the `Stopped` status label. This spec omits the duplicate segment; the `!` glyph + `Stopped` label carry the state. Confirm or require the literal duplicate.
4. **Naming/case decisions.** Status labels are Title case (`Idle`, `Running`, ...), `@main` is used in the composer and content status row while the navigator name is `main`, and the navigator omits `@` for all names per §21.6. Confirm these display conventions.
5. **Banner row budget.** The approval banner / rejection notice consumes one row above the composer. `overlayAvailableRows` and `promptInputHeight` must subtract the navigator rows (§21.6), this extra row, and the fixed 1-row footer. This is a UI height requirement, not a runtime behavior change.
6. **Assistant-label contrast (reopened by the revert).** The restored pre-theme main label is `assistantLabel` `#6D625A` (3.2:1), below AA for small text; sub-agent `⏺ <name>` assistant labels use `subagentLabel` muted `#8D857D` (5.2:1, AA). The main label is paired with the `⏺` glyph and body text and is not the sole carrier of meaning. Flag if AA is required for that label.
7. **No scroll "new activity" indicator.** When the user is scrolled up, background activity continues without a visual cue. Adding one would be a new behavior beyond §21.6; this spec intentionally does not add it. Flag if product wants it.
8. **Theme/config file (resolved).** `src/ui/theme.ts` now exists and exports `COLORS` and `ROLES`; §11 is the authoritative Warm Terminal spec. It is a flat token module, not a ThemeProvider, and it is dark-only.

---

## 11. WARM TERMINAL (LIVE TUI THEME; CARBON FORGE REVERTED)

**Status:** current visual authority for the live TUI (2026-11-23). Warm Terminal is the restored pre-Carbon-Forge palette. Carbon Forge briefly replaced it, was merged as the live theme, and was then **reverted at the user's request**; its palette is not live and its hexes are forbidden under `src/`. Warm Terminal supersedes the Carbon Forge color references once present in §10.2–§10.9; §10.1 records the same restored tokens. Sections 1–9 remain the historical design of the retired ANSI renderer; they are intentionally not rewritten. The theme source of truth is `src/ui/theme.ts` (`COLORS`, `ROLES`). No ThemeProvider, light mode, runtime theme switching, or new dependency is introduced.

### 11.1 Token table

These values are the exact pre-Carbon-Forge hexes from `a9f0892:src/ui/tui.tsx`, cross-checked against the verified pre-theme table in §10.1, and must not be adjusted at call sites. Contrast ratios are WCAG 2.x relative-luminance ratios against `#11100F`, rounded to one decimal, reused from that verified table.

| Token | Hex | Contrast on `#11100F` | Primary use |
|---|---|---|---|
| `background` | `#11100F` | — | root/page/composer background; unfilled panels show it through |
| `border` | `#6D625A` | 3.2:1 | structural borders, the `─` content rule, inactive composer, `permissionAsk`, main assistant label, terminal hint |
| `brand` | `#D99168` | 7.4:1 | header title, composer prefix, picker border/title, `permissionFiles` |
| `selection` | `#F0B38D` | 10.4:1 | selected navigator marker/name, selected picker/completion row |
| `text` | `#E6E1DC` | 14.6:1 | primary body text, default markdown, unselected navigator names (main and sub-agent alike) |
| `detail` | `#C9C1BA` | 10.7:1 | terminal output, navigator activity, content-status detail |
| `textAlt` | `#D0C9C2` | 11.6:1 | picker rows, secret bullets |
| `muted` | `#8D857D` | 5.2:1 | header version, footer/hint text, terminal command, idle status, `⏺ <name>` sub-agent assistant label |
| `mutedHeader` | `#89827C` | 5.0:1 | header model/project |
| `dim` | `#88827C` | 5.0:1 | dim log entries, metadata, stopped status |
| `mutedPicker` | `#8F8982` | 5.5:1 | picker filter/headers/hints |
| `mutedCompletion` | `#8EAAA8` | 7.7:1 | unselected completion suggestion |
| `userSuccess` | `#8FCB9B` | 10.1:1 | user entries/labels (including `→ @<name>` targets), success, completed status |
| `info` | `#8BB7D8` | 8.9:1 | informational `info` lines (distinct from `toolWaiting`) |
| `toolWaiting` | `#79B8D1` | 8.7:1 | tool lines, waiting status, markdown links, approval banner |
| `running` | `#E2A078` | 8.6:1 | running status, markdown heading 1 |
| `error` | `#E47D76` | 6.8:1 | errors, failed status, rejection notices |
| `permissionAuto` | `#FF5555` | 6.1:1 as text | active accept-all/auto composer border; always paired with the `auto` label |
| `diffAddText` | `#B7E4C7` | — | diff add text, on `diffAddSurface` |
| `diffAddSurface` | `#17351F` | — | diff add row fill |
| `diffRemoveText` | `#F0B4AE` | — | diff remove text, on `diffRemoveSurface` |
| `diffRemoveSurface` | `#3A1D1D` | — | diff remove row fill |
| `diffContextText` | `#BDB6AE` | — | diff context text, on the page background |
| `markdownHeading2` | `#D7A27C` | — | markdown heading 2 and list markers |
| `markdownRaw` | `#9CCB9C` | — | inline code / raw markdown |

The diff and markdown rows are exact source hexes; the verified pre-theme table did not record standalone contrast ratios for them, so `—` is honest rather than a fabricated number. Diff text is always paired with its row fill.

### 11.2 Genuine derivations

There is exactly one documented derivation: **`panelSurface` = `background` `#11100F`.** Pre-theme panels had no background fill; the root `#11100F` showed through. Mapping the role to `background` reproduces that rendering faithfully and is not a new color. There is no elevated surface token and no derived text color: every other value in §11.1 is an exact source hex. The diff surfaces (`#17351F`, `#3A1D1D`) are source literals, not channel-mix derivations.

### 11.3 Semantic roles

| Meaning | Role | Rule |
|---|---|---|
| Page/root | `pageBackground` = `background` `#11100F` | root background |
| Panel fill | `panelSurface` = `background` `#11100F` | header/terminal/picker surfaces are unfilled; the root shows through (§11.2) |
| Structural | `border` `#6D625A` | panel borders, the `─` content rule, inactive composer border, main assistant label, terminal hint |
| Branding | `brand` `#D99168` | header title, composer `@name ❯` prefix, terminal title, picker border/title, content-status `@name` accent (main and sub-agent alike) |
| Tool execution | `tool` = `toolWaiting` `#79B8D1` | `● tool(...)` call lines, tool labels |
| Informational | `info` `#8BB7D8` | informational `info` lines (distinct from tool/waiting) |
| Approval | `approval` = `toolWaiting` `#79B8D1` | approval banner and approval panel |
| Sub-agent label | `subagentLabel` = `muted` `#8D857D` | `⏺ <name>` labels in sub-agent assistant/markdown entries; the only use of this role |
| Navigator name (unselected) | `text` `#E6E1DC` | every navigator row, main and sub-agent alike (uniform; no per-kind muted/teal sub-agent name) |
| User target | `userLabel` = `userSuccess` `#8FCB9B` | the `→ @<name>` target in a sub-agent user entry; same color as `❯ You` (the pre-theme line was one `#8FCB9B` text node) |
| Content status accent | `brand` `#D99168` | the selected agent's `@<name>` in `formatContentStatus`, main and sub-agent alike (`contentStatusColor(role="accent")`; no subagent flag) |
| Active selection | `selection` `#F0B38D` | selected navigator marker/name, selected picker/completion row |
| Success/completed | `success` = `userSuccess` `#8FCB9B` | completed status, `✓` results, success entries |
| Errors/failed | `error` `#E47D76` | error entries, failed status, rejection notices |
| Permission ask | `permissionAsk` `#6D625A` | active composer border in ask mode |
| Permission files | `permissionFiles` `#D99168` | active composer border in files mode |
| Permission auto | `permissionAuto` `#FF5555` | active composer border in accept-all auto; paired with the `auto` footer label |

Content status row (`formatContentStatus`) accents: `@<name>` `brand` `#D99168` for main and sub-agent alike; ` · ` separators `border` `#6D625A`; detail `detailText` `#C9C1BA`; failed detail `error` `#E47D76`; fallback text `dimText` `#88827C`. The old code passed no subagent flag and had no per-kind name color.

**Not a ban:** `#FF5555` is intentionally restored for accept-all auto mode. It is a border color that is always paired with the `auto` text label. Do not remove it or reinterpret it as an error color.

Text and label roles:

| Role | Hex | Use |
|---|---|---|
| `text` | `#E6E1DC` | primary body text; unselected navigator names (main and sub-agent alike) |
| `mutedText` | `#8D857D` | header version, footer/hint, terminal command, idle, `⏺ <name>` sub-agent assistant label |
| `dimText` | `#88827C` | dim log entries, metadata, stopped |
| `detailText` | `#C9C1BA` | terminal output, navigator activity, content-status detail |
| `textAlt` | `#D0C9C2` | picker rows, secret bullets |
| `mutedHeader` | `#89827C` | header model/project |
| `mutedPicker` | `#8F8982` | picker filter/headers/hints |
| `mutedCompletion` | `#8EAAA8` | unselected completion |
| `userLabel` | `#8FCB9B` | `❯ You` marker and `→ @<name>` user target |
| `userText` | `#8FCB9B` | user body text |
| `assistantLabel` | `#6D625A` | `⏺ Agent-Termo` main label (3.2:1; restored pre-theme value) |
| `subagentLabel` | `#8D857D` | `⏺ <name>` sub-agent assistant/markdown label only — not navigator names, user targets, or content-status names |
| `pickerText` | `#D0C9C2` | picker row text |
| `pickerMuted` | `#8F8982` | picker filter/headers/hints |
| `completionText` | `#8EAAA8` | unselected completion text |
| `terminalCommand` | `#8D857D` | terminal command line |
| `terminalHint` | `#6D625A` | terminal hint text |
| `terminalOutput` | `#C9C1BA` | terminal output body |

Status colors (glyph + word always present):

| Status | Glyph/label | Role |
|---|---|---|
| idle | `○ Idle` | `statusIdle` = `muted` `#8D857D` |
| running | `◐ Running` | `statusRunning` = `running` `#E2A078` |
| waiting | `◔ Waiting` | `statusWaiting` = `toolWaiting` `#79B8D1` |
| completed | `✓ Completed` | `statusCompleted` = `userSuccess` `#8FCB9B` |
| failed | `✗ Failed` | `statusFailed` = `error` `#E47D76` |
| stopped | `! Stopped` | `statusStopped` = `dim` `#88827C` |

Markdown / `SyntaxStyle` roles:

| Scope | Role |
|---|---|
| default text | `markdownText` = `text` `#E6E1DC` |
| heading 1 | `markdownHeading1` = `running` `#E2A078`, bold |
| heading 2 | `markdownHeading2` `#D7A27C`, bold |
| links | `markdownLink` = `toolWaiting` `#79B8D1` |
| inline code / raw | `markdownRaw` `#9CCB9C` |
| list markers | `markdownList` = `markdownHeading2` `#D7A27C` |

The live `<markdown>` `SyntaxStyle` is what colors the live transcript and `/help`; ANSI is stripped in the live renderer. The non-TUI Chalk fallback no longer imports the theme and is restored to the pre-theme named Chalk colors (§11.7).

`UiKind` mapping (the live transcript `colors` record):

| `UiKind` | Role |
|---|---|
| `user` | `userText` `#8FCB9B`; the `❯ You` marker and `→ @<name>` target use `userLabel` `#8FCB9B` |
| `assistant` | `text` `#E6E1DC`; the `⏺` label uses `assistantLabel` `#6D625A` |
| `tool` | `tool` `#79B8D1` |
| `info` | `info` `#8BB7D8` |
| `success` | `success` `#8FCB9B` |
| `error` | `error` `#E47D76` |
| `dim` | `dimText` `#88827C` |
| `markdown` | `markdownText` `#E6E1DC` (syntax scopes above) |
| `diff-add` | `diffAddText` `#B7E4C7` on `diffAddSurface` `#17351F` |
| `diff-remove` | `diffRemoveText` `#F0B4AE` on `diffRemoveSurface` `#3A1D1D` |
| `diff-context` | `diffContextText` `#BDB6AE` on the page background |

Surface usage: `background` for the root/content/composer and for the header box, terminal panel, picker, and approval panel (no fill). No navigator row backgrounds, shadows, gradients, or new animation.

Role coverage: every value in `ROLES` resolves to a `COLORS` value. The two transitional aliases — `subagent` (`text` `#E6E1DC`; navigator names, uniform for main and sub-agents) and `composerBorderFocused` (`border` `#6D625A`) — exist only until the callsite stage removes them; they are not semantic contracts.

### 11.4 Composer border

| Composer state | Border |
|---|---|
| Inactive (navigator focus, approval, picker) | `composerBorder` `#6D625A` |
| Active, permission `ask` | `permissionAsk` `#6D625A` |
| Active, permission `files` | `permissionFiles` `#D99168` |
| Active, permission `auto` (accept-all) | `permissionAuto` `#FF5555` |

- `single` border, 1 cell, unchanged layout.
- The bright red accept-all/auto border is intentionally restored at the user's request. It is not banned; it is always paired with the `auto` footer label and the `/help` text.
- Focus is never indicated by color alone: the native cursor is present only when the composer owns keys, the footer shortcut cluster changes, and the selected navigator row uses `▸`. In `ask` mode the active border equals the inactive border, so the cursor and footer are the primary focus cues.
- Approval banner: `approval` `#79B8D1`; rejection notice: `error` `#E47D76`. Approval/picker keep the composer inactive at `composerBorder` `#6D625A`.

### 11.5 The one-line footer

The footer is the **last row of the screen**, below the navigator (which is below the composer). It replaces the old navigator hint row and the old two-part bottom status line. It is exactly one row (`height=1`, `flexShrink=0`, `wrapMode="none"`), never wraps, never scrolls, and never adds a second shortcut row. The footer replaces the old one-row bottom status line at the same one-row cost, and removing the now-gone navigator hint row returns one row to the `flexGrow` content area — net one row less chrome, matching the 80 × 24 example in §10.2.

**Canonical default (composer focused), exact:**

```
Ctrl+X navigate · ↑/↓ select · Enter send · Esc parent · Ctrl+X Ctrl+K stop all · context ▰▰▰▰▱▱▱ 51% · 12k/23k · low · auto · session ~130,851
```

Segment order is fixed; the separator is exactly ` · ` (U+00B7 with one space each side), with no leading or trailing separator and no other punctuation. The numbers in the canonical line are illustrative; every numeric segment is computed from runtime state (the meter/percent and `12k/23k` must agree for real state).

| # | Segment | Dynamic source / format |
|---|---|---|
| 1 | `Ctrl+X navigate` | literal keyboard hint |
| 2 | `↑/↓ select` | literal |
| 3 | `Enter send` | literal |
| 4 | `Esc parent` | literal |
| 5 | `Ctrl+X Ctrl+K stop all` | literal |
| 6 | `context ▰▰▰▰▱▱▱ 51%` | `"context " + formatContextMeter(ScreenState.context.usedTokens, .budgetTokens)`; 7 cells, rounded percent |
| 7 | `12k/23k` | `formatTokenCount(usedTokens) + "/" + formatTokenCount(budgetTokens)` |
| 8 | `low` | `ScreenState.thinking` verbatim (`off`/`auto`/`low`/`medium`/`high`) |
| 9 | `auto` | `ScreenState.permissionMode` verbatim (`ask`/`files`/`auto`), always text |
| 10 | `session ~130,851` | `"session " + ScreenState.usage` with one trailing ` tokens` removed; `~` (in-flight) is retained |

- If `ScreenState.context` is absent, omit segments 6 and 7 (no placeholder). If `thinking` is empty, omit segment 8. If `usage` is empty, omit segment 10. Segment 9 is always present. Show only real values; never fabricate a meter, percent, or token count. Render `thinking` and `permissionMode` verbatim; do not merge equal values (for example `auto · auto`) or add labels.
- Styling: base `mutedText` `#8D857D`; separators `dimText` `#88827C`; key chords may be `text` `#E6E1DC` bold; the permission value uses `text` (not color-coded; when the composer is active, the permission mode is also indicated by its border, §11.4); meter filled `▰` uses `mutedText`, empty `▱` uses `dimText`. No color-only meaning.
- **Width:** available cells = `max(1, terminalColumns - 2)` (page `paddingX=1`). If the joined line exceeds it, drop whole segments in this exact order, recomputing separators after each drop, until it fits:
  1. `session …`
  2. `thinking`
  3. `↑/↓ select`
  4. `context <meter> <pct>` (keep `12k/23k`)
  5. `Esc parent`
  6. `Enter send`
  7. `Ctrl+X navigate`
  8. `Ctrl+X Ctrl+K stop all`
  9. `12k/23k`
  - `permissionMode` is never dropped. If an unsupported-width line still overflows, clip the remaining text with `…`; never wrap, never move a segment to a new row.
  - Never abbreviate segment text; drop whole segments only.
- **State variants** keep the context cluster and swap only the shortcut cluster:
  - Navigator focused: `↑/↓ select · Enter focus composer · Esc parent · Ctrl+K stop terminal · Ctrl+X Ctrl+K stop all`.
  - Modal owns keys: `Navigator paused · finish the prompt to continue`.
  - The drop order applies to the analogous slots; `Ctrl+K stop terminal` drops before `Ctrl+X Ctrl+K stop all`.
- **Transient status:** when `status()` is non-empty (spinner, "Stopped N agents.", "Stopping terminal…", copied/notice messages), it replaces the entire shortcut cluster; the context cluster remains. It is shown until the existing code clears or overwrites it (4,000 ms for transient/notice messages, spinner until stopped); do not add a new timer. If the line still overflows, the status text is clipped with `…` after `12k/23k` is dropped, and never causes a second row. The permission value is never displaced by a transient message.
- No additional shortcut rows anywhere: remove the current `navigatorHint()` row and the right-hand `status() || "Enter send · ..."` hint. `/help` is the complete reference.

### 11.6 `/help` reference

`/help` (and its `/` alias) renders **one** transcript entry of kind `markdown` through `appendLog`, so the existing transcript scrollbox scrolls it. Do not add a pager, modal, or separate screen. The existing `/clear` behavior still clears it.

**Structure (two separate top-level sections, in this order):**

1. `Commands` — every live registered command with its aliases and description.
   - Source of truth: the same registry used by command completion at runtime, i.e. `COMMANDS` + `/mcp` + project commands loaded from `.agent-termo/commands`. Do not maintain a second hand-written command list. Suggested seam: expose the live list already held by the TUI (`getCommands()`) and have `printHelp()` consume it. `/mcp` is currently appended by `refreshCommandCompletion`; keep that behavior. Adding `/mcp` to `COMMANDS` and removing the ad-hoc append is acceptable if the implementer prefers one constant, but it is not required.
   - Aliases displayed beside the canonical name: `/help` (`/`), `/clear` (`/cls`), `/timeline` (`/tl`), `/history` (`/hist`), `/exit` (`/quit`). These mirror the real dispatch branches; do not invent aliases.
   - Correct stale descriptions while touching help: `/help` = "show commands and keyboard shortcuts"; `/agents` = "list agents and choose one"; `/history` = "list recent conversation messages (default 12, max 50)" (not "show message count"); `/context` = "show estimated context usage and budget" (not "runtime paths"); `/mcp` = "list MCP servers and available tools" (missing from `COMMANDS` today).
   - Project commands are included and marked with a `project` hint. Plain `exit` / `quit` also quit; state this once under Commands.
   - Render each row as a markdown list item: command + aliases in inline code (`markdownRaw` `#9CCB9C`), description in `mutedText` `#8D857D`. Descriptions may wrap in the scrollbox; command names are not clipped.
2. `Shortcuts` — every implemented binding, grouped by context. This is content derived from the real handlers, not from the old hand-written "Keys" list. It must include:
   - Composer: `Enter` send (accepts a highlighted completion first); `Shift+Enter` (also `Ctrl+Enter`/`Alt+Enter`) newline; `Tab` complete `/command` or `@mention`; `Esc` dismiss completion; `↑/↓` completion selection, otherwise cursor movement, otherwise history at the first/last line; `Ctrl+A`/`Ctrl+E` line start/end; `Ctrl+W`/`Ctrl+U` delete word / to line start; `Ctrl+K` delete to line end while typing (and stop the terminal when the composer is empty/navigator-focused/prompt inactive); `Ctrl+O` show/hide the terminal panel; `Ctrl+T` expand/shrink the terminal panel (both when a terminal command exists); `Ctrl+C` copy selection, clear the draft, or quit when empty and no agent is live.
   - Workspace: `Ctrl+X` focus the navigator and arm stop-all; `↑/↓` select an agent; `Enter` focus the composer; `Esc` select the parent (composer at main); `Ctrl+X` then `Ctrl+K` within 1.5 s stops all agents.
   - Response: `Esc` or `Ctrl+C` cancels an in-flight model response while no modal owns the keys.
   - Approval: `Y`/`Enter` allow once; `A` allow always for this exact terminal command; `N`/`Esc`/`Ctrl+C` reject.
   - Picker: `↑/↓` move, type to filter, `Backspace` edit the filter, `Enter` select, `Esc`/`Ctrl+C` cancel.
   - Secret input: `Enter` submit, `Esc`/`Ctrl+C` cancel, `Backspace` delete, bracketed paste supported.
   - The navigator hint row is gone; these shortcuts are documented here and in the footer, never in a second row.
- **Theming:** section headings use markdown heading 1 (`markdownHeading1` `#E2A078`, bold); context group headings use heading 2 (`markdownHeading2` `#D7A27C`, bold); command/key tokens use inline code (`markdownRaw` `#9CCB9C`); descriptions use `mutedText` `#8D857D`; aliases use `dimText` `#88827C`. The live `<markdown>` `SyntaxStyle` applies these roles. The non-TUI fallback is restored to the pre-theme named Chalk colors and does not import the theme (§11.7). Content, sections, and order are unchanged by the revert.
- **Accuracy check:** every `CommandInfo` in the live registry appears exactly once (canonical name; aliases on the same row), and every binding above is backed by an existing handler. Do not list speculative or removed features.

### 11.7 Verification and implementation notes

- `src/ui/theme.ts` is the only color source for the live TUI and the only file under `src/` where the restored warm hexes may appear. Replace every hex in `src/ui/tui.tsx` with `ROLES`/`COLORS`; do not edit runtime behavior, agent execution, tool calling, model communication, or session logic.
- Restore `permissionBarColor()` in `src/ui/tui.tsx`; it returns theme roles: `auto` → `ROLES.permissionAuto` `#FF5555`, `files` → `ROLES.permissionFiles` `#D99168`, `ask` → `ROLES.permissionAsk` `#6D625A`. At the composer call site use `inputActive() ? permissionBarColor(permissionMode) : ROLES.composerBorder`. The bright red accept-all/auto border is intentional.
- Specific call sites frontend-expert must not miss: root background; header border/title/version/model; content status row; separator; user/assistant/subagent labels; tool/success/error/dim/info kinds; diff fills/text/context; terminal panel border/title/command/hint/output; picker border/title/filter/headers/rows/hint; completion rows; approval banner/panel; rejection notice; composer border/prefix/secret bullets; navigator marker/connector/glyph/name/segments/overflow; markdown `SyntaxStyle`; footer.
- Restore the non-TUI Chalk fallbacks in `src/ui/index.ts` and `src/ui/subagent-view.ts` to their pre-theme named Chalk colors (the named colors used before Carbon Forge) and remove their `theme.ts` imports. Do not keep `Chalk.hex(COLORS...)` there.
- `src/ui/terminal-title.ts` is untouched by the revert.
- Transitional `ROLES.subagent` (`COLORS.text` `#E6E1DC`) and `ROLES.composerBorderFocused` (`COLORS.border` `#6D625A`) exist only so `bun run typecheck` stays green until the callsite stage; remove both from `theme.ts` after `tui.tsx` stops referencing them. They are not part of the final design. `COLORS.accent`, `COLORS.copper`, `COLORS.teal`, and `COLORS.textDim` are likewise temporary aliases (`#D99168`, `#D99168`, `#8EAAA8`, `#88827C`) kept only for the untouched non-TUI fallback imports; remove them when `index.ts` and `subagent-view.ts` drop their theme imports.
- Update `tests/unit/theme.test.ts` to assert the Warm Terminal palette/roles and `tests/unit/permission-colors.test.ts` to assert the restored `permissionBarColor("auto") === "#FF5555"`.
- `src/utils/ansi.ts` remains pre-existing unused legacy ANSI code (nothing imports it); do not refactor or delete it as part of the revert.
- Grep gate: `#101512`, `#19211D`, `#27332C`, `#E5EDE6`, `#B5D98A`, `#D69B69`, `#83B9A2`, `#E17D75`, `#A5ACA6`, `#858C87`, `#293224`, `#2F2521` must be absent from every file under `src/`. Restored warm hexes live only in `src/ui/theme.ts`; all other `src/` files consume roles. Historical docs are exempt.
- Visual checks at 40/80/120 columns: the footer stays one line, drops in the specified order, never wraps; the composer border is `#6D625A` when inactive or in ask mode, `#D99168` in files, and bright `#FF5555` in auto; the footer still states the mode; `/help` scrolls in the transcript and shows Commands and Shortcuts separately with the warm markdown colors.
- Suggested automated coverage (for test-agent): pure footer formatter at 40/60/80/120 with all values present, absent context/thinking/usage, transient status, and the invariant that permission is never dropped; `/help` includes every live registry command, `/mcp`, project commands, and all five aliases; Warm Terminal token/role completeness; no Carbon Forge hex under `src/` except in historical docs.
- Expected verification after the callsite stage: `bun run typecheck`, `bun run test`, `bun run build`. This design change does not alter keyboard behavior or runtime/session semantics.