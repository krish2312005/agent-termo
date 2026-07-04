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