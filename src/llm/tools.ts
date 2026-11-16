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
    name: 'file:write',
    description: 'Write or overwrite a complete file. Use this to create new files or replace existing ones entirely.',
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
    description: 'Execute a shell command and return its stdout/stderr output. Destructive commands (rm, dd) require user confirmation.',
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
      },
      required: ['command'],
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
