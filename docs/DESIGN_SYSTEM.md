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

**Status:** visual specification for the workspace contract in `docs/architecture.md` §21. The architecture is authoritative for behavior, data flow, selection, routing, retention, and keyboard dispatch; this section covers only what the user sees. No workspace product code exists yet at the time of writing (2026-11-23). Every existing value below was verified in the live renderer (`src/ui/tui.tsx`, `@opentui/solid` 0.9.7), not in the legacy ANSI design.

### 10.1 Palette reality, live tokens, and constraints

**The live TUI has no theme/token module and no light mode.** Colors are hardcoded hex literals at call sites in `src/ui/tui.tsx`; the root box sets `backgroundColor="#11100F"`. There is no `ThemeProvider`, no `createTheme`, no theme preference, and no light variant. This feature must not invent one. A token module or light mode would be a separate refactor with its own contrast validation.

**The legacy ANSI table above is historical.** Sections 1–9 describe the retired blessed/ANSI 256 renderer (purple `#7C3AED`, slate `#0F172A`, ANSI 93/75, boxed message bubbles). That is not the live UI. For the live TUI, the palette below **supersedes** the legacy ANSI table. Do not use legacy `primary`/`info` purple/blue tokens or ANSI 93/75 for the workspace.

#### Live tokens used by the workspace

| Token | Hex | Verified live usage | Contrast on `#11100F` |
|---|---|---|---|
| `background` | `#11100F` | root page background | — |
| `accent` | `#D99168` | header title, composer prefix, terminal title, selected picker border | 7.4:1 (AAA) |
| `accentSelected` | `#F0B38D` | selected picker/completion item; navigator selected marker/name | 10.4:1 (AAA) |
| `border` | `#6D625A` | single panel/terminal/composer border in ask mode, header border, separators, existing main assistant label | 3.2:1 (passes 3:1 non-text; not a small body-text color) |
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

Ratios are WCAG 2.x relative-luminance ratios against `#11100F`, rounded to one decimal. `#6D625A` is a divider/label token, not a body-text token. Existing diff colors (`#B7E4C7` on `#17351F`, `#F0B4AE` on `#3A1D1D`, `#BDB6AE` context) are unchanged.

#### Type, spacing, and chrome tokens

| Token | Value |
|---|---|
| font | terminal monospace; no font family or size change |
| horizontal unit | 1 cell; page `paddingX=1`; content entries `paddingX=1` |
| vertical rhythm | 1 line; no blank spacer rows inside the workspace |
| content separator | one `─` row in `#6D625A` |
| borders | `single` for panels/composer/terminal; `rounded` only for the header and picker; the navigator has no border |
| radius/shadow | none (terminal) |
| motion | existing spinner/streaming only; no new animation |
| focus fill | none; focus is cursor/text/marker based (10.9) |

### 10.2 Layout and density

Top to bottom, one column, `gap=0`:

| # | Region | Height / flex | Notes |
|---|---|---|---|
| 1 | Existing header | existing, `flexShrink=0` | keep the existing rounded `#6D625A` border; no workspace changes |
| 2 | Selected-agent content | `flexGrow=1`, `minHeight=0` | contains the status row, separator, and scrollbox below |
| 2a | Content status row | 1 line, non-scrolling | selected agent's real status, never boxed |
| 2b | Thin separator | 1 line | `─` in `#6D625A`, spans the content inner width |
| 2c | Scrollbox | remainder | existing entry rendering; per-agent scroll (10.6) |
| 3 | Terminal panel | existing, `flexShrink=0` | existing position and 8-row compact / ~60% expanded heights |
| 4 | Picker / completion overlays | existing, `flexShrink=0` | existing order above the composer; picker remains rounded `#D99168` |
| 5 | Composer | existing single-border box; 3–8 textarea rows, `flexShrink=0` | 10.3 |
| 6 | Agent navigator | `flexShrink=0`; up to 7 agent rows + up to 2 overflow lines + 1 hint line | directly below the composer; no border, no box |
| 7 | Existing status line | 1 line, `flexShrink=0` | existing left status and right shortcut hint; unchanged |

Density rules:

- The navigator sits directly below the composer and above the existing status line. It is never a sidebar, float, or boxed panel.
- No blank spacer rows. The only new separator is the one-line rule under the content status row; the composer's existing border remains the divider above the navigator.
- The navigator never squeezes the content area; content shrinks first, then overlays/textarea budgets. `overlayAvailableRows` and `promptInputHeight` must subtract the navigator's rendered rows per §21.6 (plus any approval banner/notice row, 10.3).
- The agent list region is at most 7 agent rows plus at most 2 overflow indicator lines; the hint row is additional (absolute maximum 10 navigator lines). The selected row is always present. On short terminals reduce the visible agent rows first so the content area keeps usable height.
- Minimum supported terminal is the existing 40 columns × 12 rows (`layoutSupported`). At 80 × 24 the two-sub-agent example shows header (3) + content status row (2) + content (9) + composer (5) + navigator (4: main + two agents + hint) + status line (1) = 24.
- Every row is exactly one line. No row wraps and no horizontal scrolling is introduced; overflow is clipped with `…` (10.4).

### 10.3 Composer

Structure (existing single border, unchanged chrome):

```
┌────────────────────────────────────────────────────┐
│ @<name> ❯ <draft or placeholder>                   │
└────────────────────────────────────────────────────┘
```

- Prefix: exactly `@<name> ❯` followed by one space before the textarea, in `#D99168`. The target updates immediately on selection; the prefix and placeholder never lag the selected row.
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
- Border style stays `single`. Border color keeps the existing `permissionBarColor` behavior when input is active (`ask` `#6D625A`, `files` `#D99168`, `auto` `#FF5555`) and `#6D625A` when input is inactive. Do not add a new focus color or permission color.

#### Composer states

| State | Border | Prefix / body | Cursor | Banner / notice | Hint row |
|---|---|---|---|---|---|
| Composer focused (default) | existing permission color above | `@<name> ❯`; placeholder or draft | visible (native textarea cursor) | none | default hint (10.8) |
| Navigator focused | `#6D625A` (input inactive, existing) | same; draft preserved | absent | none | navigator hint (10.8) |
| Modal-owned: approval | `#6D625A` | same; draft preserved, unfocused | absent | `◔ Approval required from @<name>` above composer | paused hint |
| Modal-owned: picker | existing behavior; textarea unfocused because the picker owns keys | same; draft preserved | absent | no extra banner; the picker title is the owner indicator | paused hint |
| Modal-owned: secret | existing permission color (the composer itself owns keys) | prefix + masked `•` bullets in `#D0C9C2`; no placeholder | absent (masked input) | no extra banner; the masked field is the owner indicator | paused hint |
| Rejected notice | focused border | same; **draft retained**, nothing sent | visible | `✗ <message>` in `#E47D76`, auto-clears after 4,000 ms | default hint |
| Empty submit | focused border | placeholder remains | visible | none (empty is suppressed by the UI) | default hint |
| Multiline | focused border | 2+ draft lines | visible | none | default hint |

Banner/notice rules:

- The approval banner is one line, no box, directly above the composer: `◔ Approval required from @<name>` in `#79B8D1`. The name is the requesting agent, not necessarily the composer target.
- A rejection notice replaces the banner slot: `✗ <message>` in `#E47D76`, auto-clears after 4,000 ms. A new rejection restarts the timer. The draft is never cleared or redirected on rejection.
- At most one banner/notice row is visible. The modal banner wins over a stale notice; a notice never appears while a modal owns the keyboard.
- The banner/notice row is outside the composer border, consumes 1 line, and must be included in the height budgets mentioned in 10.2.

Focus indication never relies on color alone:

- The native textarea cursor is present only when the composer owns keys.
- The hint row text changes between composer, navigator, and paused states (10.8).
- Approval has an explicit owner banner; rejection has an explicit notice.
- The `@<name> ❯` prefix identifies the dispatch target at all times; it is not a focus indicator.

Approval/picker/secret all freeze the navigator per §21.2 D4. Approval suspends the composer via `suspend`/`resume` and preserves the draft; picker/secret keep their existing input ownership. No workspace change clears a draft behind the user's back.

### 10.4 Navigator row anatomy

One line per row; never wrap; no horizontal overflow:

```
[marker 2][tree prefix][glyph 1][space 1][name][metadata]
```

- Marker: `▸ ` in `#F0B38D` when selected; `  ` (two spaces) otherwise. Selection is independent of keyboard focus and persists when the composer is focused.
- Tree prefix: depth 0 has none. Depth `d > 0` uses `(d - 1) × 2` spaces followed by `├ ` when a later sibling exists in DFS order, or `└ ` for the last sibling. No vertical `│` guides are used (not in the contract). Depth 1 therefore starts at the connector; depth 2 indents by two spaces before its connector.
- Status glyph: exactly `○` idle, `◐` running, `◔` waiting, `✓` completed, `✗` failed, `!` stopped, followed by one space.
- Name: `main` for the main row; the sub-agent display name otherwise. No `@` in the navigator. Append `#<first 6 id chars>` with no space, only when the runtime marks `duplicateName` (for example `review-agent#a1b2c3`).
- Metadata: segments separated by ` · ` (space, U+00B7, space). Never render an absent segment, a placeholder dash, or a fabricated value.
- Selected styling: marker `▸` and the name are bold `#F0B38D`; the glyph keeps its status color; metadata uses its normal color. No row background, inversion, or rounded box.
- Normal name color: `#E6E1DC`. The selected row is the only accented row.

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
4. failed detail: first error line, in `#E47D76`
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

Status text color: the label uses its status color (10.5); live activity uses `#C9C1BA`; the failed error line uses `#E47D76`; all other metadata uses `#88827C`.

#### Window and overflow

- List region: at most 7 agent rows, plus up to two overflow lines when agents are hidden; the hint row is additional. Absolute navigator maximum is 10 lines. The window always contains the selected row and slides to keep it visible; there is no scrollbar and no mouse scrolling.
- Hidden agents are represented by dim overflow rows, aligned in the marker column:
  `… 3 above` / `… 2 below`, `#88827C`, one line each, not selectable.
- Overflow lines appear only when needed; with 7 or fewer agents there are none.
- With no sub-agents the navigator is exactly two lines: one `main` row and the hint.
- New sub-agents append a row without changing selection. Completed, failed, and stopped rows remain for the session; no fading, strike-through, or auto-removal.
- Rows keep the tree builder's DFS order `(startedAt, id)`; live status changes update in place and never reorder.

### 10.5 Status and semantic colors

Every state uses **glyph + label + color**. Color is never the only carrier of meaning.

| Status | Glyph | Label | Live token | Contrast | Additional signal |
|---|---|---|---|---|---|
| idle | `○` | `Idle` | `#8D857D` | 5.2:1 | glyph + label |
| running | `◐` | `Running` | `#E2A078` | 8.6:1 | glyph + label + live activity |
| waiting | `◔` | `Waiting` | `#79B8D1` | 8.7:1 | glyph + label + approval banner/`waiting` detail |
| completed | `✓` | `Completed` | `#8FCB9B` | 10.1:1 | glyph + label + task |
| failed | `✗` | `Failed` | `#E47D76` | 6.8:1 | glyph + label + error line |
| stopped | `!` | `Stopped` | `#88827C` | 5.0:1 | glyph + label |

Row and content semantics:

| Element | Color | Notes |
|---|---|---|
| selected marker + name | `#F0B38D`, bold | 10.4:1; `▸` also marks selection |
| normal row name | `#E6E1DC` | 14.6:1 |
| status label/glyph | status token above | glyph + word always present |
| live activity | `#C9C1BA` | 10.7:1 |
| failed error detail | `#E47D76` | 6.8:1 |
| other metadata | `#88827C` | 5.0:1 |
| separators / border | `#6D625A` | 3.2:1, passes 3:1 non-text |
| hint row | `#8D857D` | 5.2:1 |
| content status `@name` | `#D99168` | 7.4:1 |
| content status activity | `#C9C1BA` | 10.7:1 |
| content status elapsed/tokens | `#88827C` | 5.0:1 |

- Running and waiting differ by glyph (`◐`/`◔`), word, and color; no spinner or "Thinking" state is invented.
- The selected row's status glyph keeps the status color so status remains readable even when the row is selected.
- The live palette supersedes the legacy ANSI table for the live TUI. Do not use `#7C3AED`, `#6D28D9`, `#3B82F6`, `#22C55E`, or ANSI 93/75 here. `#79B8D1` is the live tool/waiting blue, not the legacy `info` blue.
- The existing permission semantics are untouched: `ask` border `#6D625A`, `files` `#D99168`, `auto` `#FF5555`, always paired with the `ask`/`files`/`auto` text label in the bottom status line.

### 10.6 Content area

#### Status row

Exactly one non-scrolling line at the top of the content area, followed by the one-line `─` separator:

```
@<name> · <Status> · <activity|task|error> · <elapsed> · <N> tok
```

- `@<name>` in `#D99168`; separators ` · ` in `#6D625A`; status label in its status color; detail in `#C9C1BA` (failed detail in `#E47D76`); elapsed/tokens in `#88827C`.
- Only real values are shown. Omit absent segments without leaving double or trailing separators. Tokens are cumulative per agent (§21.10) and are omitted until the runtime reports usage.
- Main: detail is the real `activity` (`ready`, `working`, `waiting for your approval`); elapsed is shown only while running/waiting and means session-start elapsed.
- Sub-agent: live detail is `activity`; completed detail is the clipped task; failed detail is the first error line; stopped has no detail. Elapsed is `since HH:MM` while live and the existing duration format when terminal.
- On narrow terminals the same drop order as 10.4 applies to the optional segments; the row always keeps `@<name>` and the status label. It never wraps.
- The status row and separator are never boxed and never scroll with the transcript.

#### Main selected

Render the existing `entries` exactly as today:

- `❯ You` in `#8FCB9B`
- `⏺ Agent-Termo` in `#6D625A` (existing, unchanged)
- tool calls/results in the existing grammar and colors (`● tool(args)` `#79B8D1`; `⎿ ✓ …` `#8FCB9B`; `⎿ ✗ …` `#E47D76`; bash output dim `#88827C`)
- markdown via the existing `<markdown>` component; streaming via its existing `streaming` prop
- info `#8BB7D8`, success `#8FCB9B`, error `#E47D76`, dim `#88827C`
- diffs exactly as today (`#17351F`/`#3A1D1D` backgrounds, `#B7E4C7`/`#F0B4AE` text)

#### Sub-agent selected

Render only the selected agent's stored transcript (`transcriptToUiEntries`), never the main `entries` and never another agent's transcript:

- User entry: `❯ You → @<name>` in `#8FCB9B`. The first such entry is the delegated task plus optional context; it is not a duplicate of the parent's user message.
- Assistant entry: `⏺ <name>` in `#8D857D` (5.2:1; the main label's existing `#6D625A` is left untouched), followed by streamed markdown in `#E6E1DC` via the existing component.
- Tool call: `● <name>(<args summary>)` in `#79B8D1`.
- Tool result: `⎿ ✓ <summary>` in `#8FCB9B`; failure `⎿ ✗ <summary>` in `#E47D76`; multi-line bash output indented and dim `#88827C`.
- Lifecycle/status entry: `— <Status>` plus an optional ` · <detail>` when the transcript provides one, in `#88827C`. Do not invent a status line for every iteration.
- Error entry: `✗ <first line>` in `#E47D76`; the full capped text stays in the transcript.
- Streaming: the existing `<markdown streaming>` output is the only streaming visual. The navigator's `◐` + activity and the content status row's `Running` are the working indicators. There is no "Thinking" state, spinner, or fabricated progress.
- Empty transcript: exactly `No activity yet for @<name>.` in `#88827C`, one line at the top of the content area, no box. The composer remains enabled.
- Parent/child separation: the main transcript's `agent:delegate` call/result and the original parent user message stay in main only. The sub-agent sees its delegated task and its own work only. No duplicated parent history.

#### Scroll behavior

- One scrollbox for the selected transcript. Save `scrollTop` per agent on switch and restore it after layout (`scrollTo`); the first view of an agent starts at the bottom.
- Tail-follow only when the view was measured at the bottom before the update (`scrollTop + viewport.height >= scrollHeight - 2` in `afterLayout`). No unconditional `stickyScroll`.
- Background agents keep receiving entries; they do not touch the selected scrollbox, force a re-render, or move the scroll position.
- No new scrollbar, "jump to bottom" control, or "new activity" badge is added. Scroll preservation is the only new visual behavior. (A new-activity indicator would be a new behavior beyond §21.6; see 10.10 item 7.)

### 10.7 States and edge cases

| Case | Visual result |
|---|---|
| No sub-agents | navigator is two lines: `main` row + hint; no overflow lines |
| New sub-agent | row appears in DFS order; `▸` does not jump; no toast or flash; content is unchanged |
| Completed | `✓` row retained; detail task + terminal duration; transcript retained; composer enabled |
| Failed | `✗` row with first error line; red error at transcript end; conversation retained; composer enabled for follow-up |
| Stopped | `!` row in dim; status label only; transcript retained; composer enabled for follow-up |
| Main waiting on children | main row `Waiting · waiting on N subagents`; each child keeps its own status; no fake parent node |
| Multiple active | each row shows its own `◐`/`◔`; selection is independent; only the selected transcript renders |
| Nested | indentation is generic; runtime exposes one level today; no `│` guides invented |
| Selected agent finishes | stays selected; id remains valid; status updates in place; no selection jump |
| Long name | clipped with `…`; duplicate `#id6` retained; composer prefix also clips the name |
| Long task/error | row detail clipped with `…`; the transcript holds the full capped text |
| Narrow < 80 | drop usage, then since, then goal/task, then active-agent name; hint clips with `…` |
| Narrow < 60 | names/details clip to the minimum 8 cells; composer prefix max 14 cells; every row stays one line |
| Resize | recompute row widths and overlay budgets; selected row stays visible; saved scroll position restored; order unchanged |
| Dark palette reality | only `#11100F`; no light mode; terminal theme changes are not an app light mode |
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
Ctrl+X navigate · ↑↓ select · Enter message · Esc parent · Ctrl+X Ctrl+K stop all
context ▰▰▱▱▱▱▱ 28% · 12k/43k · auto · ask · session 34k tokens
```

Colors: selected `▸ main` in `#F0B38D` bold; `◐` `#E2A078`; `✓` `#8FCB9B`; metadata `#88827C`; hint and bottom status `#8D857D`; composer prefix `#D99168`. The frontend row's usage and since were dropped by the narrow-row priority (illustrative), not omitted by the runtime.

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
Ctrl+X navigate · ↑↓ select · Enter message · Esc parent · Ctrl+X Ctrl+K stop all
```

Colors: `✗` and error lines `#E47D76`; assistant label `#8D857D`; tool line `#79B8D1`; dim status `#88827C`; selected name `#F0B38D`. The failed row remains selected and the composer still targets `@review-agent`.

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
Ctrl+X navigate · ↑↓ select · Enter message · Esc parent · Ctrl+X Ctrl+K stop all
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
Ctrl+X navigate · ↑↓ select · Enter message · Esc parent · Ctrl+X Ctrl+K stop all
```

Navigator focused:

```
┌────────────────────────────────────────────────────┐
│ @main ❯ unsent draft kept here                     │
└────────────────────────────────────────────────────┘
▸ ○ main · Idle · 12k tok
  ├ ◐ frontend-expert · Running · editing App.tsx
  └ ✓ test-agent · Completed
↑↓ select · Enter message · Esc parent · Ctrl+K stop terminal · Ctrl+X Ctrl+K stop all
```

Focus cues are non-color: the native cursor disappears, the hint text changes to the navigator variant, and the composer border returns to `#6D625A` because input is inactive. The `▸` selection marker is present in both states; selection is not focus.

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
Navigator paused · finish the prompt to continue
```

The banner names the requester even though the composer targets `@main`. The draft is preserved; the navigator is frozen.

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
↑↓ select · Enter message · Esc parent · Ctrl+X Ctrl+K stop…
context ▰▰▱▱▱▱▱ 28% · 12k/43k · auto
```

Usage and since are dropped first; names and details clip with `…`; the hint clips at the terminal edge; no row wraps.

**G. Nested indentation (visual only; runtime depth is 1 today)**

```
  ○ main · Idle
  ├ ◐ project-manager · Running
    ├ ✓ frontend-expert · Completed
    └ ◐ backend-expert · Running
  └ ✓ test-agent · Completed
```

Depth is conveyed by two spaces per level plus `├ `/`└ `; no vertical guides.

### 10.8 Keyboard hint

The hint row is the last line of the navigator, always visible, one line, not selectable, no border.

| State | Exact text |
|---|---|
| Composer focused (default) | `Ctrl+X navigate · ↑↓ select · Enter message · Esc parent · Ctrl+X Ctrl+K stop all` |
| Navigator focused | `↑↓ select · Enter message · Esc parent · Ctrl+K stop terminal · Ctrl+X Ctrl+K stop all` |
| Modal open | `Navigator paused · finish the prompt to continue` |

- Style: `#8D857D`; key names may be bold; no background; clip the right edge with `…`; never wrap.
- The default order is deliberate: `Ctrl+X navigate` precedes the arrow actions, so the hint does not imply that arrows navigate while the composer is typing. The composer's existing bottom-right hint (`Enter send · Shift+Enter newline · Tab complete · Select text to copy · Ctrl+C quit`) remains unchanged and authoritative for text editing.
- The navigator variant removes the now-redundant `Ctrl+X navigate` and adds the truthful navigator-only `Ctrl+K stop terminal`. All existing shortcuts are preserved per §21.2 D4 (`Ctrl+O`, `Ctrl+T`, `Tab`, `Shift+Enter`, history, completion, picker, secret, approval, `/subagents`); this section changes no binding.
- The modal variant prevents the hint from claiming navigation works while a modal owns the keyboard.

### 10.9 Accessibility

- **Keyboard-only.** Every workspace action is reachable from the keyboard per the §21.2 D4 table. This is a terminal UI; the 44 px touch-target rule does not apply. Rows are full-width keyboard targets, and the composer remains the single text-entry surface.
- **Visible focus.** Focus is indicated by the native cursor, the hint-row text variant, the `▸` selection marker, and bold selected name. Border color alone is never the only focus cue.
- **No color-only meaning.** Every status carries a glyph and a word (`○ Idle`, `◐ Running`, `◔ Waiting`, `✓ Completed`, `✗ Failed`, `! Stopped`). Failed rows carry an error line; queued and waiting states are stated in words.
- **Contrast.** All functional workspace text is at least 5.0:1 against `#11100F`, except the pre-existing main assistant label `#6D625A` (3.2:1), which is left unchanged by this feature (10.10 item 6). Status colors range from 6.8:1 to 10.1:1; selected accent is 10.4:1; dim metadata is 5.0:1; the `#6D625A` border/separator is a non-text divider at 3.2:1, passing the 3:1 non-text threshold.
- **Many agents.** The 7-agent-row window keeps the selected row visible, shows hidden counts above/below, and never shrinks text or introduces horizontal scrolling.
- **Truncation.** Only `…` is used; no mid-character cuts, no misleading placeholder values, and no fabricated usage, elapsed time, or "Thinking" state. Absent metrics are omitted.
- **Motion.** No new animation is introduced. Duration text updates on a 1,000 ms interval only while an agent is live; streaming uses the existing markdown component. Reduced-motion handling of the existing spinner is unchanged.
- **Theme reality.** Contrast is validated only against the hardcoded dark background `#11100F`. There is no light mode. If one is added later, every token must be revalidated.

### 10.10 Open items for project-manager

1. **Light-mode acceptance criterion conflict.** §21.8 says "Dark/light themes work", but the live TUI has no theme system and no light mode; `#11100F` is hardcoded. This design follows the real dark-only state. Either amend the acceptance criterion to "dark palette unchanged; no theme regression" or schedule a separate theme refactor. Do not treat this feature as delivering light mode.
2. **Navigator height cap.** This spec allows 7 agent rows + up to 2 overflow lines + 1 hint (max 10 lines), matching §21.6. On short terminals reduce the visible agent rows first to preserve content height; confirm the cap if a stricter 7-line navigator block was intended.
3. **Stopped metadata duplication.** §21.6 lists a `· stopped` detail segment in addition to the `Stopped` status label. This spec omits the duplicate segment; the `!` glyph + `Stopped` label carry the state. Confirm or require the literal duplicate.
4. **Naming/case decisions.** Status labels are Title case (`Idle`, `Running`, ...), `@main` is used in the composer and content status row while the navigator name is `main`, and the navigator omits `@` for all names per §21.6. Confirm these display conventions.
5. **Banner row budget.** The approval banner / rejection notice consumes one row above the composer. `overlayAvailableRows` and `promptInputHeight` must subtract the navigator rows (§21.6) and this extra row. This is a UI height requirement, not a runtime behavior change.
6. **Pre-existing assistant-label contrast.** `#6D625A` is 3.2:1 on `#11100F`, below the 4.5:1 text threshold. It is the existing main label color and is left unchanged for surgical scope; the new sub-agent label uses `#8D857D` (5.2:1). If AA for every label is required, that is a separate change.
7. **No scroll "new activity" indicator.** When the user is scrolled up, background activity continues without a visual cue. Adding one would be a new behavior beyond §21.6; this spec intentionally does not add it. Flag if product wants it.
8. **No theme/config file was written.** Per the live code, no theme/token module exists; this section documents the actual hardcoded tokens instead of creating a new theme system. A future token module should preserve these hex values and contrast notes.