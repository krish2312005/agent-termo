// =============================================================================
// Tool Registry — Typed tool definitions with lifecycle management
// =============================================================================

import {
  ToolRegistryEntry,
  ToolExecutionContext,
  ToolResult,
  ProviderToolDef,
  ToolOutputDelta,
} from './types.js';
import { EventBus } from './events.js';
import { randomUUID } from 'node:crypto';

// Tool Registry
export class ToolRegistry {
  private tools = new Map<string, ToolRegistryEntry>();
  private eventBus: EventBus;
  private sessionId: string;
  
  constructor(eventBus: EventBus, sessionId: string) {
    this.eventBus = eventBus;
    this.sessionId = sessionId;
  }
  
  register(entry: ToolRegistryEntry): void {
    this.tools.set(entry.name, entry);
  }
  
  get(name: string): ToolRegistryEntry | undefined {
    return this.tools.get(name);
  }
  
  getAll(): ToolRegistryEntry[] {
    return Array.from(this.tools.values());
  }
  
  getProviderDefinitions(): ProviderToolDef[] {
    return this.getAll().map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
  
  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const entry = this.tools.get(name);
    if (!entry) {
      return {
        success: false,
        error: `Unknown tool: ${name}`,
        durationMs: 0,
      };
    }
    
    const toolCallId = context.toolCallId;
    const startTime = Date.now();
    
    // Emit tool.started event
    await this.eventBus.publish({
      id: randomUUID(),
      type: 'tool.started',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      payload: { toolCallId, name },
    });
    
    // Create abort signal for cancellation
    const abortController = new AbortController();
    const signal = abortController.signal;
    
    // Wrap context with output streaming
    const executionContext: ToolExecutionContext = {
      ...context,
      signal,
      onOutput: (delta: ToolOutputDelta) => {
        this.eventBus.publish({
          id: randomUUID(),
          type: 'tool.output.delta',
          timestamp: new Date().toISOString(),
          sessionId: this.sessionId,
          payload: { toolCallId, ...delta },
        });
      },
    };
    
    try {
      const result = await entry.execute(args, executionContext);
      
      // Emit completion event
      await this.eventBus.publish({
        id: randomUUID(),
        type: result.success ? 'tool.completed' : 'tool.failed',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        payload: {
          toolCallId,
          name,
          result,
          error: result.error,
          metadata: {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            durationMs: Date.now() - startTime,
            command: result.command,
            cwd: result.cwd,
          },
        },
      });
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      await this.eventBus.publish({
        id: randomUUID(),
        type: 'tool.failed',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        payload: {
          toolCallId,
          name,
          error: errorMessage,
          metadata: {
            durationMs: Date.now() - startTime,
          },
        },
      });
      
      return {
        success: false,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };
    }
  }
}

// Permission Checker
export class PermissionChecker {
  private allowedCommands: Set<string>;
  private mode: 'ask' | 'files' | 'auto';
  private eventBus: EventBus;
  private sessionId: string;
  private pendingRequests = new Map<string, Promise<'allow' | 'deny' | 'always'>>();
  
  constructor(
    eventBus: EventBus,
    sessionId: string,
    allowedCommands: Set<string>,
    mode: 'ask' | 'files' | 'auto'
  ) {
    this.eventBus = eventBus;
    this.sessionId = sessionId;
    this.allowedCommands = allowedCommands;
    this.mode = mode;
  }
  
  setMode(mode: 'ask' | 'files' | 'auto'): void {
    this.mode = mode;
  }
  
  setAllowedCommands(commands: Set<string>): void {
    this.allowedCommands = commands;
  }
  
  async check(
    toolName: string,
    args: Record<string, unknown>,
    action: 'read' | 'write' | 'execute' | 'delete',
    resource: string
  ): Promise<'allow' | 'deny' | 'always'> {
    // Auto mode allows everything
    if (this.mode === 'auto') return 'allow';
    
    // Files mode auto-approves file operations
    if (this.mode === 'files' && action !== 'execute') return 'allow';
    
    // Check persistent approval
    const approvalKey = this.getApprovalKey(toolName, args);
    if (this.allowedCommands.has(approvalKey)) return 'always';
    
    // Request permission
    const requestId = randomUUID();
    await this.eventBus.publish({
      id: randomUUID(),
      type: 'permission.requested',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      payload: { requestId, toolName, arguments: args, resource, action },
    });
    
    // Wait for decision (this would be implemented by UI)
    const decision = await this.waitForDecision(requestId);
    
    await this.eventBus.publish({
      id: randomUUID(),
      type: decision === 'allow' ? 'permission.granted' : 'permission.denied',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      payload: { requestId, decision },
    });
    
    if (decision === 'always') {
      this.allowedCommands.add(approvalKey);
    }
    
    return decision;
  }
  
  private getApprovalKey(toolName: string, args: Record<string, unknown>): string {
    // Create a stable key for the tool + arguments
    const relevantArgs = JSON.stringify(args, Object.keys(args).sort());
    return `${toolName}:${relevantArgs}`;
  }
  
  private waitForDecision(requestId: string): Promise<'allow' | 'deny' | 'always'> {
    return new Promise((_resolve) => {
      this.pendingRequests.set(requestId, Promise.resolve().then(() => {
        // This would be resolved by the UI when user responds
        // For now, return a default
        return 'deny' as const;
      }));
    });
  }
  
  resolvePermission(requestId: string, _decision: 'allow' | 'deny' | 'always'): void {
    const promise = this.pendingRequests.get(requestId);
    if (promise) {
      // In a real implementation, we'd resolve the promise here
      this.pendingRequests.delete(requestId);
    }
  }
}

// Built-in Tool Definitions
export function createBuiltinTools(_projectRoot: string): ToolRegistryEntry[] {
  return [
    // File Read
    {
      name: 'file:read',
      description: 'Read the complete contents of a file. Use for examining existing code, config, or documentation.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path (absolute or relative to project root)' },
          limit: { type: 'number', description: 'Maximum number of lines to read (0 = all)', default: 0 },
          offset: { type: 'number', description: 'Line offset to start reading from (0 = start)', default: 0 },
        },
        required: ['path'],
      },
      permissions: {
        required: ['read'],
        resources: ['file:*'],
      },
      execute: async (args, context) => {
        const { readFile } = await import('node:fs/promises');
        const { resolve, isAbsolute, relative } = await import('node:path');
        
        const path = String(args.path ?? '');
        if (!path) return { success: false, error: 'path is required', durationMs: 0 };
        
        const fullPath = isAbsolute(path) ? path : resolve(context.projectRoot, path);
        const rel = relative(context.projectRoot, fullPath);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { success: false, error: 'Access denied: ' + path, durationMs: 0 };
        }
        
        try {
          const content = await readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          const limit = Number(args.limit ?? 0);
          const offset = Number(args.offset ?? 0);
          const sliced = lines.slice(offset, limit > 0 ? offset + limit : undefined);
          const summary = limit > 0 ? `[Showing lines ${offset + 1}-${offset + sliced.length} of ${lines.length}]` : '';
          return { success: true, output: (summary ? summary + '\n' : '') + sliced.join('\n'), durationMs: 0 };
        } catch (err) {
          return { success: false, error: 'Cannot read ' + path + ': ' + (err instanceof Error ? err.message : String(err)), durationMs: 0 };
        }
      },
    },
    
    // File Write
    {
      name: 'file:write',
      description: 'Write or overwrite a complete file. Use this to create new files or replace existing ones entirely.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write (relative to project root)' },
          content: { type: 'string', description: 'Complete file content to write' },
        },
        required: ['path', 'content'],
      },
      permissions: {
        required: ['write'],
        resources: ['file:*'],
      },
      execute: async (args, context) => {
        const { writeFile } = await import('node:fs/promises');
        const { resolve, isAbsolute, relative } = await import('node:path');
        const { mkdirSync, existsSync } = await import('node:fs');
        
        const path = String(args.path ?? '');
        const content = args.content;
        if (!path) return { success: false, error: 'path is required', durationMs: 0 };
        if (typeof content !== 'string') {
          return { success: false, error: 'content must be a string', durationMs: 0 };
        }
        
        const fullPath = isAbsolute(path) ? path : resolve(context.projectRoot, path);
        const rel = relative(context.projectRoot, fullPath);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { success: false, error: 'Access denied: ' + path, durationMs: 0 };
        }
        
        try {
          const dir = resolve(fullPath, '..');
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          await writeFile(fullPath, content, 'utf-8');
          return { success: true, output: `Created ${path}`, durationMs: 0 };
        } catch (err) {
          return { success: false, error: 'Cannot write ' + path + ': ' + (err instanceof Error ? err.message : String(err)), durationMs: 0 };
        }
      },
    },
    
    // File Edit
    {
      name: 'file:edit',
      description: 'Edit an existing file by replacing an exact section. The old_string must appear verbatim in the file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File to edit' },
          old_string: { type: 'string', description: 'Exact text to find and replace (must be unique in file)' },
          new_string: { type: 'string', description: 'Replacement text' },
          replace_all: { type: 'boolean', description: 'Replace every occurrence of old_string (default false)', default: false },
        },
        required: ['path', 'old_string', 'new_string'],
      },
      permissions: {
        required: ['write'],
        resources: ['file:*'],
      },
      execute: async (args, context) => {
        const { readFile, writeFile } = await import('node:fs/promises');
        const { resolve, isAbsolute, relative } = await import('node:path');
        const { existsSync } = await import('node:fs');
        
        const path = String(args.path ?? '');
        const oldString = String(args.old_string ?? '');
        const newString = String(args.new_string ?? '');
        if (!path || !oldString) return { success: false, error: 'path and old_string are required', durationMs: 0 };
        
        const fullPath = isAbsolute(path) ? path : resolve(context.projectRoot, path);
        const rel = relative(context.projectRoot, fullPath);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { success: false, error: 'Access denied: ' + path, durationMs: 0 };
        }
        
        try {
          if (!existsSync(fullPath)) {
            return { success: false, error: 'File not found: ' + path, durationMs: 0 };
          }
          
          const existingContent = await readFile(fullPath, 'utf-8');
          const eol = existingContent.includes('\r\n') ? '\r\n' : '\n';
          const fileText = existingContent.replace(/\r\n/g, '\n');
          const findText = oldString.replace(/\r\n/g, '\n');
          const replaceText = newString.replace(/\r\n/g, '\n');
          
          if (!fileText.includes(findText)) {
            return { success: false, error: 'old_string not found in ' + path, durationMs: 0 };
          }
          
          const occurrences = fileText.split(findText).length - 1;
          const replaceAll = args.replace_all === true;
          if (occurrences > 1 && !replaceAll) {
            return { success: false, error: `old_string appears ${occurrences} times in ${path}. Use replace_all: true.`, durationMs: 0 };
          }
          
          const updated = replaceAll
            ? fileText.split(findText).join(replaceText)
            : fileText.replace(findText, () => replaceText);
          const newContent = eol === '\r\n' ? updated.replace(/\n/g, '\r\n') : updated;
          
          await writeFile(fullPath, newContent, 'utf-8');
          return { success: true, output: `Edited ${path}`, durationMs: 0 };
        } catch (err) {
          return { success: false, error: 'Cannot edit ' + path + ': ' + (err instanceof Error ? err.message : String(err)), durationMs: 0 };
        }
      },
    },
    
    // File Glob
    {
      name: 'file:glob',
      description: 'Find all files matching a glob pattern. Use to discover project structure.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g. "src/**/*.ts", "**/*.json")' },
          cwd: { type: 'string', description: 'Root directory to search in (defaults to project root)' },
        },
        required: ['pattern'],
      },
      permissions: {
        required: ['read'],
        resources: ['file:*'],
      },
      execute: async (args, context) => {
        const { glob } = await import('glob');
        const { resolve, isAbsolute, relative } = await import('node:path');
        
        const globPattern = String(args.pattern ?? '').replace(/\\/g, '/');
        if (!globPattern) return { success: false, error: 'pattern is required', durationMs: 0 };
        
        const cwd = args.cwd ? String(args.cwd) : context.projectRoot;
        const fullCwd = isAbsolute(cwd) ? cwd : resolve(context.projectRoot, cwd);
        const rel = relative(context.projectRoot, fullCwd);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { success: false, error: 'Access denied', durationMs: 0 };
        }
        
        try {
          const files = await glob(globPattern, {
            cwd: fullCwd,
            absolute: false,
            dot: true,
            ignore: ['**/node_modules/**', '**/.git/**'],
          });
          const output = files.length > 0 ? files.join('\n') : '(no files matched)';
          return { success: true, output, durationMs: 0 };
        } catch (err) {
          return { success: false, error: 'glob error: ' + (err instanceof Error ? err.message : String(err)), durationMs: 0 };
        }
      },
    },
    
    // Grep
    {
      name: 'grep',
      description: 'Search for text or regex patterns inside files. Use to find function definitions, imports, etc.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Text or regex pattern to search for' },
          path: { type: 'string', description: 'File or directory to search in', default: '.' },
          glob: { type: 'string', description: 'Only search files matching this glob pattern' },
          case_sensitive: { type: 'boolean', description: 'Case sensitive search (default true)', default: true },
        },
        required: ['pattern', 'path'],
      },
      permissions: {
        required: ['read'],
        resources: ['file:*'],
      },
      execute: async (args, context) => {
        const { glob } = await import('glob');
        const { readFile } = await import('node:fs/promises');
        const { resolve, isAbsolute, relative } = await import('node:path');
        const { existsSync, statSync } = await import('node:fs');
        
        const pattern = String(args.pattern ?? '');
        const path = args.path ? String(args.path) : '.';
        const caseSensitive = args.case_sensitive !== false;
        
        if (!pattern) return { success: false, error: 'pattern is required', durationMs: 0 };
        
        const fullPath = isAbsolute(path) ? path : resolve(context.projectRoot, path);
        const rel = relative(context.projectRoot, fullPath);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { success: false, error: 'Access denied', durationMs: 0 };
        }
        if (!existsSync(fullPath)) {
          return { success: false, error: 'Path not found: ' + path, durationMs: 0 };
        }
        
        let matcher: RegExp;
        try {
          matcher = new RegExp(pattern, caseSensitive ? '' : 'i');
        } catch {
          matcher = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? '' : 'i');
        }
        
        try {
          let files: string[];
          if (statSync(fullPath).isDirectory()) {
            let globPattern = String(args.glob ?? '**/*').replace(/\\/g, '/');
            if (args.glob && !globPattern.includes('/')) globPattern = '**/' + globPattern;
            files = await glob(globPattern, {
              cwd: fullPath,
              absolute: true,
              nodir: true,
              dot: true,
              ignore: ['**/node_modules/**', '**/.git/**'],
            });
          } else {
            files = [fullPath];
          }
          
          const matches: string[] = [];
          const MAX_MATCHES = 300;
          const MAX_FILE_BYTES = 5 * 1024 * 1024;
          let truncated = false;
          
          for (const file of files) {
            try {
              const info = statSync(file);
              if (!info.isFile() || info.size > MAX_FILE_BYTES) continue;
              const content = await readFile(file, 'utf-8');
              const rel = relative(context.projectRoot, file).replace(/\\/g, '/');
              const lines = content.split(/\r?\n/);
              for (let i = 0; i < lines.length; i++) {
                if (matcher.test(lines[i] ?? '')) {
                  matches.push(rel + ':' + (i + 1) + ': ' + (lines[i] ?? '').slice(0, 400));
                  if (matches.length >= MAX_MATCHES) {
                    truncated = true;
                    break;
                  }
                }
              }
            } catch {
              // Skip unreadable files
            }
            if (truncated) break;
          }
          
          const suffix = truncated ? `\n(stopped at ${MAX_MATCHES} matches; narrow the search)` : '';
          return { success: true, output: matches.length > 0 ? matches.join('\n') + suffix : '(no matches found)', durationMs: 0 };
        } catch (err) {
          return { success: false, error: 'grep error: ' + (err instanceof Error ? err.message : String(err)), durationMs: 0 };
        }
      },
    },
    
    // Bash Execute (Shell)
    {
      name: 'bash:execute',
      description: 'Execute a shell command and return its stdout/stderr output. Destructive commands require user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          cwd: { type: 'string', description: 'Working directory (defaults to project root)' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default 300000)', default: 300000 },
        },
        required: ['command'],
      },
      permissions: {
        required: ['execute'],
        resources: ['command:*'],
      },
      execute: async (args, context) => {
        const { spawn } = await import('node:child_process');
        const { resolve, isAbsolute, relative } = await import('node:path');
        const { resolveShell } = await import('../utils/shell.js');
        const { killProcessTree } = await import('../tools/index.js');
        
        const command = String(args.command ?? '');
        if (!command.trim()) {
          return { success: false, error: 'command must be a non-empty string', durationMs: 0 };
        }
        
        const cwd = args.cwd ? String(args.cwd) : context.projectRoot;
        const fullCwd = isAbsolute(cwd) ? cwd : resolve(context.projectRoot, cwd);
        const rel = relative(context.projectRoot, fullCwd);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { success: false, error: 'Access denied: shell cwd must be inside the project root', durationMs: 0 };
        }
        
        const requestedTimeout = Number(args.timeout ?? 300000);
        const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : 300000;
        
        // Dangerous pattern check
        const DANGEROUS_PATTERNS = [
          /rm\s+-rf\s+['"]?\//i,
          /dd\s+if=/i,
          />\s*\/dev\/sda/i,
          /mkfs\./i,
          /:\s*\(\)\s*\{\s*:\|:&?\s*\};?\s*:/i,
        ];
        for (const pattern of DANGEROUS_PATTERNS) {
          if (pattern.test(command)) {
            return { success: false, error: 'Dangerous command blocked: ' + command.slice(0, 50), durationMs: 0 };
          }
        }
        
        const MAX_BASH_OUTPUT = 60000;
        
        return new Promise<ToolResult>((resolve) => {
          let settled = false;
          let stdout = '';
          let stderr = '';
          let timer: ReturnType<typeof setTimeout> | null = null;
          
          const finish = (success: boolean, exitCode: number | null, error?: string): void => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            
            const combinedOutput = [stdout, stderr].filter(Boolean).join('');
            const metadata = { command, cwd: fullCwd, stdout, stderr, exitCode };
            
            if (success) {
              resolve({ success: true, output: combinedOutput || '(no output)', ...metadata, durationMs: 0 });
            } else {
              resolve({
                success: false,
                output: combinedOutput || undefined,
                error: [
                  `Command failed: ${command}`,
                  `Working directory: ${fullCwd}`,
                  `Exit code: ${exitCode ?? 'unknown'}`,
                  error ?? 'The command did not complete successfully.',
                  stdout ? `stdout:\n${stdout}` : '',
                  stderr ? `stderr:\n${stderr}` : '',
                ].join('\n'),
                ...metadata,
                durationMs: 0,
              });
            }
            
            // Emit exit delta
            context.onOutput?.({ type: 'exit', data: exitCode ?? -1 });
          };
          
          // Emit start
          context.onOutput?.({ type: 'metadata', data: { command, cwd: fullCwd } });
          
          const child = spawn(command, {
            cwd: fullCwd,
            shell: resolveShell(),
            windowsHide: true,
            env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
          });
          
          const capture = (stream: 'stdout' | 'stderr') => (chunk: Buffer | string): void => {
            const text = chunk.toString();
            if (stream === 'stdout') {
              stdout = (stdout + text).slice(-MAX_BASH_OUTPUT);
            } else {
              stderr = (stderr + text).slice(-MAX_BASH_OUTPUT);
            }
            context.onOutput?.({ type: stream, data: text });
          };
          
          child.stdout?.setEncoding('utf8');
          child.stderr?.setEncoding('utf8');
          child.stdout?.on('data', capture('stdout'));
          child.stderr?.on('data', capture('stderr'));
          child.on('error', (err) => finish(false, null, err.message));
          child.on('close', (code) => finish(code === 0, code));
          
          timer = setTimeout(() => {
            context.onOutput?.({ type: 'stderr', data: `\n[agent-termo] timed out after ${timeoutMs}ms` });
            killProcessTree(child);
            finish(false, null, `Command timed out after ${timeoutMs}ms`);
          }, timeoutMs);
          
          // Handle abort signal
          context.signal.addEventListener('abort', () => {
            killProcessTree(child);
            finish(false, null, 'Command cancelled by user');
          });
        });
      },
    },
    
    // Git Status
    {
      name: 'git:status',
      description: 'Show the git working tree status (modified, staged, untracked files).',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Repository root (default: project root)' },
        },
      },
      permissions: {
        required: ['read'],
        resources: ['command:*'],
      },
      execute: async (args, context) => {
        const { simpleGit } = await import('simple-git');
        const { resolve, isAbsolute, relative } = await import('node:path');
        
        const cwd = args.cwd ? String(args.cwd) : context.projectRoot;
        const fullCwd = isAbsolute(cwd) ? cwd : resolve(context.projectRoot, cwd);
        const rel = relative(context.projectRoot, fullCwd);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { success: false, error: 'Access denied: Git cwd must be inside the project root', durationMs: 0 };
        }
        
        try {
          const git = simpleGit(fullCwd);
          const status = await git.status();
          const lines = [
            'Current branch: ' + (status.current ?? 'unknown'),
            status.tracking ? 'tracking: ' + status.tracking : '',
            '',
            'Modified: ' + (status.modified.length > 0 ? status.modified.join(', ') : '(none)'),
            'Created: ' + (status.created.length > 0 ? status.created.join(', ') : '(none)'),
            'Deleted: ' + (status.deleted.length > 0 ? status.deleted.join(', ') : '(none)'),
            '',
            'Not staged: ' + (status.not_added.length > 0 ? status.not_added.join(', ') : '(none)'),
            '',
            'Changed files: ' + (status.files.length > 0 ? status.files.map((f) => f.path).join(', ') : '(none)'),
          ].filter(Boolean).join('\n');
          return { success: true, output: lines, durationMs: 0 };
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err), durationMs: 0 };
        }
      },
    },
    
    // Git Commit
    {
      name: 'git:commit',
      description: 'Stage and commit all changes with a conventional commit message.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Conventional commit message (e.g. "feat: add login page")' },
          cwd: { type: 'string', description: 'Repository root (default: project root)' },
        },
        required: ['message'],
      },
      permissions: {
        required: ['write'],
        resources: ['command:*'],
      },
      execute: async (args, context) => {
        const { simpleGit } = await import('simple-git');
        const { resolve, isAbsolute, relative } = await import('node:path');
        
        const message = String(args.message ?? '');
        const cwd = args.cwd ? String(args.cwd) : context.projectRoot;
        const fullCwd = isAbsolute(cwd) ? cwd : resolve(context.projectRoot, cwd);
        const rel = relative(context.projectRoot, fullCwd);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { success: false, error: 'Access denied: Git cwd must be inside the project root', durationMs: 0 };
        }
        if (!message) return { success: false, error: 'message is required', durationMs: 0 };
        
        try {
          const git = simpleGit(fullCwd);
          await git.add('.');
          const result = await git.commit(message);
          return { success: true, output: 'Committed ' + result.commit + ' — ' + message, durationMs: 0 };
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err), durationMs: 0 };
        }
      },
    },
    
    // Git Push
    {
      name: 'git:push',
      description: 'Push the current branch to the remote repository.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Repository root (default: project root)' },
        },
      },
      permissions: {
        required: ['execute'],
        resources: ['command:*'],
      },
      execute: async (args, context) => {
        const { simpleGit } = await import('simple-git');
        const { resolve, isAbsolute, relative } = await import('node:path');
        
        const cwd = args.cwd ? String(args.cwd) : context.projectRoot;
        const fullCwd = isAbsolute(cwd) ? cwd : resolve(context.projectRoot, cwd);
        const rel = relative(context.projectRoot, fullCwd);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { success: false, error: 'Access denied: Git cwd must be inside the project root', durationMs: 0 };
        }
        
        try {
          const git = simpleGit(fullCwd);
          await git.push();
          return { success: true, output: 'Pushed to remote.', durationMs: 0 };
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err), durationMs: 0 };
        }
      },
    },
    
    // Git Log
    {
      name: 'git:log',
      description: 'Show recent git commit history.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Repository root (default: project root)' },
          limit: { type: 'number', description: 'Number of commits to show (default: 20)', default: 20 },
        },
      },
      permissions: {
        required: ['read'],
        resources: ['command:*'],
      },
      execute: async (args, context) => {
        const { simpleGit } = await import('simple-git');
        const { resolve, isAbsolute, relative } = await import('node:path');
        
        const cwd = args.cwd ? String(args.cwd) : context.projectRoot;
        const fullCwd = isAbsolute(cwd) ? cwd : resolve(context.projectRoot, cwd);
        const rel = relative(context.projectRoot, fullCwd);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return { success: false, error: 'Access denied: Git cwd must be inside the project root', durationMs: 0 };
        }
        const limit = Number(args.limit ?? 20);
        
        try {
          const git = simpleGit(fullCwd);
          const log = await git.log({ maxCount: limit });
          const lines = log.all
            .map((c: { hash: string; date: string; message: string; author_name: string }) => 
              c.hash.slice(0, 7) + ' | ' + c.date.slice(0, 10) + ' | ' + c.message + ' (' + c.author_name + ')'
            )
            .join('\n');
          return { success: true, output: lines, durationMs: 0 };
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err), durationMs: 0 };
        }
      },
    },
  ];
}