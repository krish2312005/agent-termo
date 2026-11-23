// =============================================================================
// Tool Definitions (OpenAI function calling schema)
// These are matched to the actual tools implemented in src/tools/
// =============================================================================

import type { ToolDef } from '../types/index.js';

export const TOOL_DEFINITIONS: ToolDef[] = [
  // ── File Operations ──────────────────────────────────────────────────────────
  {
    name: 'file:read',
    description: 'Read the complete contents of a file. Use for examining existing code, config, or documentation.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path (absolute or relative to project root)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read (0 = all)',
          default: 0,
        },
        offset: {
          type: 'number',
          description: 'Line offset to start reading from (0 = start)',
          default: 0,
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'skill:read',
    description: 'Read a skill instruction file or a supporting reference file from an installed skill. Use only when a skill in the Available Skills catalog is relevant to the user request.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Exact skill name from the Available Skills catalog',
        },
        path: {
          type: 'string',
          description: 'Optional relative path inside the skill folder (defaults to SKILL.md)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'memory:remember',
    description: 'Save a stable project fact, architecture decision, or convention to docs/MEMORY.md for future sessions. Never save secrets or private personal information.',
    parameters: {
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'Concise durable project fact or decision to remember.' },
      },
      required: ['entry'],
    },
  },
  {
    name: 'file:write',
    description: 'Write or overwrite a complete file. Requires BOTH path and content as arguments; never call with empty or missing arguments. Use this to create new files or replace existing ones entirely.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to write (relative to project root)',
        },
        content: {
          type: 'string',
          description: 'Complete file content to write',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'file:edit',
    description: 'Edit an existing file by replacing an exact section. The old_string must appear verbatim in the file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File to edit',
        },
        old_string: {
          type: 'string',
          description: 'Exact text to find and replace (must be unique in file)',
        },
        new_string: {
          type: 'string',
          description: 'Replacement text',
        },
        replace_all: {
          type: 'boolean',
          description: 'Replace every occurrence of old_string (default false; otherwise old_string must be unique)',
          default: false,
        },
			},
			required: ['path', 'old_string', 'new_string'],
		},
	},
	{
		name: 'file:delete',
		description: 'Delete a file from the project. Use only when the user explicitly asks to remove it.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'File path to delete (relative to project root)',
				},
			},
			required: ['path'],
		},
	},
	{
		name: 'file:glob',
    description: 'Find all files matching a glob pattern. Use to discover project structure.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern (e.g. "src/**/*.ts", "**/*.json")',
        },
        cwd: {
          type: 'string',
          description: 'Root directory to search in (defaults to project root)',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'grep',
    description: 'Search for text or regex patterns inside files. Use to find function definitions, imports, etc.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Text or regex pattern to search for',
        },
        path: {
          type: 'string',
          description: 'File or directory to search in',
        },
        glob: {
          type: 'string',
          description: 'Only search files matching this glob pattern',
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Case sensitive search (default true)',
          default: true,
        },
      },
      required: ['pattern', 'path'],
    },
  },
  // ── Bash ───────────────────────────────────────────────────────────────────
  {
    name: 'bash:execute',
    description: 'Execute a short-lived shell command and return its stdout/stderr and exit code. Long-running development servers are started in the background automatically; use bash:start for other persistent processes, then use bash:read with wait_ms to wait for log events (do not sleep before polling) and bash:stop to stop them.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (defaults to project root)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default 300000)',
          default: 300000,
        },
        background: {
          type: 'boolean',
          description: 'Start the command as a persistent background process and return a session ID instead of waiting for it to exit.',
          default: false,
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'bash:start',
    description: 'Start a persistent background process such as a worker, API server, frontend dev server, or database service. Returns a session_id, startup output, and next_cursor. Use bash:read with that cursor and wait_ms to receive subsequent stdout/stderr as soon as an event arrives; do not use sleep followed by polling. Use bash:stop to stop it.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to start' },
        cwd: { type: 'string', description: 'Working directory (defaults to project root)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'bash:read',
    description: 'Wait for the next background terminal output/exit event and return new stdout/stderr immediately (or return after wait_ms expires). Pass the session_id and exact next_cursor returned by bash:start or the previous read. Default wait_ms is 10000; maximum is 30000. This is event-driven waiting, not polling.',
    parameters: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Background terminal session ID' },
        cursor: { type: 'number', description: 'Exact next_cursor returned by bash:start or the previous read (defaults to 0)' },
        wait_ms: { type: 'number', description: 'Maximum time to wait for the next output event in milliseconds (default 10000, maximum 30000; 0 returns immediately).' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'bash:stop',
    description: 'Stop a background terminal session started with bash:start.',
    parameters: {
      type: 'object',
      properties: { session_id: { type: 'string', description: 'Background terminal session ID' } },
      required: ['session_id'],
    },
  },
  {
    name: 'browser:verify',
    description: 'Run a real headless Chromium browser check against the running application using Playwright installed in the project. This tool is registered as browser:verify (wire name browser_verify). Captures console errors, uncaught page errors, failed network requests, HTTP 4xx/5xx responses, and can exercise user actions/assertions. If Playwright or Chromium is missing, install them in the project and retry.',
    parameters: {
      type: 'object',
      properties: {
        base_url: { type: 'string', description: 'HTTP or HTTPS URL of the running frontend, for example http://localhost:3000' },
        actions: { type: 'string', description: 'Optional JSON array of actions: click/fill/select/check/uncheck/press/wait_for with selector; expect_text with selector and text; expect_url with url substring; goto with url. Maximum 30 actions.' },
        timeout_ms: { type: 'number', description: 'Overall verification budget in milliseconds, 60000 by default and capped at 120000.' },
        viewport: { type: 'string', description: 'Viewport preset: desktop (1440x900), tablet (768x1024), or mobile (390x844). Run each preset for responsive work.' },
        screenshot: { type: 'boolean', description: 'Save a full-page screenshot under .agent-termo/browser-artifacts (default true).' },
      },
      required: ['base_url'],
    },
  },
  // ── Git ────────────────────────────────────────────────────────────────────
  {
    name: 'git:status',
    description: 'Show the git working tree status (modified, staged, untracked files).',
    parameters: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Repository root (default: project root)',
        },
      },
    },
  },
  {
    name: 'git:commit',
    description: 'Stage and commit all changes with a conventional commit message.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Conventional commit message (e.g. "feat: add login page")',
        },
        cwd: {
          type: 'string',
          description: 'Repository root (default: project root)',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'git:push',
    description: 'Push the current branch to the remote repository.',
    parameters: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Repository root (default: project root)',
        },
      },
    },
  },
  {
    name: 'git:log',
    description: 'Show recent git commit history.',
    parameters: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Repository root (default: project root)',
        },
        limit: {
          type: 'number',
          description: 'Number of commits to show (default: 20)',
          default: 20,
        },
      },
    },
  },
  {
    name: 'agent:delegate',
    description: 'Spawn a specialist sub-agent for a focused task. The parent agent receives the result and coordinates it with other delegated agents. Use an agent name from /agents.',
    parameters: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Custom agent name to run' },
        task: { type: 'string', description: 'Focused task and expected deliverable for the sub-agent' },
        context: { type: 'string', description: 'Relevant findings or constraints from the parent agent' },
      },
      required: ['agent', 'task'],
    },
  },
];
