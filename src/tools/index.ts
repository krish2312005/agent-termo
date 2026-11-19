// =============================================================================
// Agent-Termo Tool Executor — routes tool calls to implementations
// =============================================================================

import { readFile as readFileAsync, writeFile as writeFileAsync, unlink as unlinkAsync } from 'node:fs/promises';
import { resolve, isAbsolute, relative } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { glob as globPromise } from 'glob';
import { simpleGit } from 'simple-git';
import { statSync, existsSync, mkdirSync } from 'node:fs';
import { getConfig } from '../utils/config.js';
import { resolveShell } from '../utils/shell.js';
import { fromWireToolName } from '../llm/client.js';
import { computeDiff } from '../diff/index.js';
import type { ToolResult, ProposedFileChange } from '../types/index.js';
import { readSkillFile } from '../runtime/skills.js';

const MAX_GLOB_RESULTS = 500;
const MAX_GREP_MATCHES = 300;
const MAX_GREP_FILE_BYTES = 5 * 1024 * 1024;
const MAX_BASH_OUTPUT = 60_000;

export type ToolOutputStream = 'stdout' | 'stderr';
export type ToolOutputHandler = (stream: ToolOutputStream, text: string) => void;

interface ReadCacheEntry { mtimeMs: number; size: number; output: string }
const readCache = new Map<string, ReadCacheEntry>();
const globCache = new Map<string, string>();

/** Invalidate workspace observations after a command or approved file change. */
export function invalidateToolCache(projectRoot: string): void {
	const prefix = projectRoot + '\0';
	for (const key of readCache.keys()) if (key.startsWith(prefix)) readCache.delete(key);
	for (const key of globCache.keys()) if (key.startsWith(prefix)) globCache.delete(key);
}

/** Model-facing aliases for argument names (Claude-style tools use file_path, old_str, ...). */
const ARG_ALIASES: Record<string, string> = {
	file_path: 'path',
	filepath: 'path',
	file_name: 'path',
	filename: 'path',
	old_str: 'old_string',
	old_text: 'old_string',
	new_str: 'new_string',
	new_text: 'new_string',
	file_text: 'content',
	contents: 'content',
	cmd: 'command',
	command_line: 'command',
	timeout_ms: 'timeout',
};

function normalizeToolArgs(args: Record<string, unknown>): Record<string, unknown> {
	const normalized = { ...args };
	for (const [alias, key] of Object.entries(ARG_ALIASES)) {
		if (normalized[key] === undefined && normalized[alias] !== undefined) normalized[key] = normalized[alias];
	}
	return normalized;
}

// ── Tool map ────────────────────────────────────────────────────────────────

async function toolSkillRead(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const name = String(args.name ?? '').trim();
	const path = String(args.path ?? 'SKILL.md');
	if (!name) return { id: '', name: 'skill:read', success: false, error: 'name is required', durationMs: 0 };
	try {
		const output = readSkillFile(projectRoot, name, path);
		return { id: '', name: 'skill:read', success: true, output, durationMs: 0 };
	} catch (error) {
		return {
			id: '',
			name: 'skill:read',
			success: false,
			error: error instanceof Error ? error.message : String(error),
			durationMs: 0,
		};
	}
}

const TOOL_MAP: Record<string, (...args: any[]) => Promise<ToolResult>> = {
	'skill:read': toolSkillRead,
	'file:read': toolFileRead,
	'file:write': toolFileWrite,
	'file:edit': toolFileEdit,
	'file:delete': toolFileDelete,
	'file:glob': toolFileGlob,
	'grep': toolGrep,
	'bash:execute': toolBash,
	'git:status': toolGitStatus,
	'git:commit': toolGitCommit,
	'git:push': toolGitPush,
	'git:log': toolGitLog,
};

// ── Re-exported tool definitions for OpenAI schema ───────────────────────────
export const TOOL_DEFS = TOOL_MAP;

// ── Terminal streaming hooks (wired to the UI by main.ts) ───────────────────
//
// bash:execute streams live output through these hooks so the running
// terminal is visible in the bottom panel while the command executes.
export interface TerminalHooks {
	onStart?: (command: string) => void;
	onOutput?: (text: string) => void;
	onEnd?: (exitCode: number | null) => void;
}
let terminalHooks: TerminalHooks = {};
export function setTerminalHooks(hooks: TerminalHooks): void {
	terminalHooks = hooks;
}

/** The currently running bash child process, so a stuck agent terminal can be killed. */
let activeBashChild: ChildProcess | null = null;

/** Kill a shell and the commands it started (npm/node grandchildren on Windows). */
function killProcessTree(child: ChildProcess): void {
	if (process.platform === 'win32' && child.pid) {
		try {
			spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
			return;
		} catch {
			// Fall through to the direct kill below.
		}
	}
	try {
		child.kill('SIGKILL');
	} catch {
		// best effort
	}
}

/** Kill the currently running agent terminal command, if any. Returns true when something was killed. */
export function killRunningTerminal(): boolean {
	if (!activeBashChild) return false;
	killProcessTree(activeBashChild);
	activeBashChild = null;
	terminalHooks.onEnd?.(null);
	return true;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function executeTool(
	name: string,
	args: Record<string, unknown>,
	projectRoot: string,
	onOutput?: ToolOutputHandler,
): Promise<ToolResult> {
	const start = Date.now();
	const id = crypto.randomUUID();

	try {
		let rawArgs: unknown = args;
		if (typeof rawArgs === 'string') {
			try {
				rawArgs = JSON.parse(rawArgs);
			} catch {
				return { id, name, success: false, error: 'Invalid JSON tool arguments', durationMs: Date.now() - start };
			}
		}
			const toolArgs = rawArgs && typeof rawArgs === 'object' ? normalizeToolArgs(rawArgs as Record<string, unknown>) : {};
			if (Object.prototype.hasOwnProperty.call(toolArgs, '_raw')) {
				return {
					id,
					name,
					success: false,
					error: 'Invalid JSON tool arguments. Read the tool schema and send arguments as a JSON object. Raw payload: ' + String(toolArgs._raw).slice(0, 500),
					durationMs: Date.now() - start,
				};
			}
			const fn = TOOL_MAP[fromWireToolName(name)];
		if (!fn) {
			return { id, name, success: false, error: 'Unknown tool: ' + name, durationMs: Date.now() - start };
		}
			const result = await fn(toolArgs, projectRoot, onOutput);
			if (result.success && fromWireToolName(name) === 'bash:execute') invalidateToolCache(projectRoot);
			return result;
	} catch (err) {
		return {
			id,
			name,
			success: false,
			error: String(err instanceof Error ? err.message : err),
			durationMs: Date.now() - start,
		};
	}
}

// ── Path helpers ─────────────────────────────────────────────────────────────

function toProjectPath(path: string, projectRoot: string): string {
	if (isAbsolute(path)) return path;
	return resolve(projectRoot, path);
}

function withinProject(path: string, projectRoot: string): boolean {
	try {
		const resolved = toProjectPath(path, projectRoot);
		const rel = relative(projectRoot, resolved);
		return !rel.startsWith('..') && !isAbsolute(rel);
	} catch {
		return false;
	}
}

// ── Propose a file change (returns ProposedFileChange without writing) ───────

function proposeFileChange(
	path: string,
	proposedContent: string,
	projectRoot: string,
	changeType: 'write' | 'edit' | 'delete',
	oldContent?: string,
): { change: ProposedFileChange; result: ToolResult } {
	const fullPath = toProjectPath(path, projectRoot);
	const originalContent = oldContent ?? '';
	const isNewFile = !existsSync(fullPath);
	const isDeletion = changeType === 'delete';

	const baseContent = isNewFile ? '' : originalContent;
	const diff = computeDiff(baseContent, proposedContent);

	const change: ProposedFileChange = {
		path,
		originalContent,
		proposedContent,
		diff: { ...diff, file: path },
		isNewFile,
		isDeletion,
	};

	const lineCount = (isDeletion ? originalContent : proposedContent).split('\n').length;
	const summary = isDeletion
		? `Delete ${path} (${lineCount} lines removed)`
		: isNewFile
			? `Create ${path} (${lineCount} lines)`
			: `${changeType === 'edit' ? 'Edit' : 'Overwrite'} ${path} (${lineCount} lines, +${diff.additions}/-${diff.deletions})`;

	const result: ToolResult = {
		id: '',
		name: `${changeType}:${path}`,
		success: true,
		output: JSON.stringify({
			message: summary,
			needsApproval: true,
			proposedChange: change,
		}),
		durationMs: 0,
	};

	return { change, result };
}

// ── Apply an approved change to disk ────────────────────────────────────────

export async function applyFileChange(change: ProposedFileChange, projectRoot: string): Promise<ToolResult> {
	const start = Date.now();
	const fullPath = toProjectPath(change.path, projectRoot);
	if (!withinProject(fullPath, projectRoot)) {
		return { id: '', name: 'file:write', success: false, error: 'Access denied: ' + change.path, durationMs: Date.now() - start };
	}

	try {
		if (change.isDeletion) {
			if (existsSync(fullPath)) {
					await unlinkAsync(fullPath);
			}
		} else {
			const dir = resolve(fullPath, '..');
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
				await writeFileAsync(fullPath, change.proposedContent, 'utf-8');
			}
			invalidateToolCache(projectRoot);
			return {
			id: '',
			name: 'file:write',
			success: true,
			output: `Applied: ${change.path}`,
			durationMs: Date.now() - start,
		};
	} catch (err) {
		return {
			id: '',
			name: 'file:write',
			success: false,
			error: 'Cannot apply ' + change.path + ': ' + (err instanceof Error ? err.message : String(err)),
			durationMs: Date.now() - start,
		};
	}
}

// ── File Tools ──────────────────────────────────────────────────────────────

async function toolFileRead(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const path = String(args.path ?? '');
	if (!path) return { id: '', name: 'file:read', success: false, error: 'path is required', durationMs: 0 };
	if (!withinProject(path, projectRoot)) {
		return { id: '', name: 'file:read', success: false, error: 'Access denied: ' + path, durationMs: 0 };
	}

	const fullPath = toProjectPath(path, projectRoot);
	const limit = Number(args.limit ?? 0);
	const offset = Number(args.offset ?? 0);

		try {
			const statResult = statSync(fullPath);
			if (statResult.isDirectory()) {
				return { id: '', name: 'file:read', success: false, error: 'Path "' + path + '" is a directory', durationMs: 0 };
			}

			const cacheKey = `${projectRoot}\0${fullPath}\0${offset}\0${limit}`;
			const cached = readCache.get(cacheKey);
			if (cached && cached.mtimeMs === statResult.mtimeMs && cached.size === statResult.size) {
				return { id: '', name: 'file:read', success: true, output: cached.output, durationMs: 0 };
			}
			const content = await readFileAsync(fullPath, 'utf-8');
			const lines = content.split('\n');
			const sliced = lines.slice(offset, limit > 0 ? offset + limit : undefined);
			const summary = limit > 0 ? '[Showing lines ' + (offset + 1) + '-' + (offset + sliced.length) + ' of ' + lines.length + ']' : '';
			const output = (summary ? summary + '\n' : '') + sliced.join('\n');
			readCache.set(cacheKey, { mtimeMs: statResult.mtimeMs, size: statResult.size, output });
			return { id: '', name: 'file:read', success: true, output, durationMs: 0 };
	} catch (err) {
		return { id: '', name: 'file:read', success: false, error: 'Cannot read ' + path + ': ' + (err instanceof Error ? err.message : String(err)), durationMs: 0 };
	}
}

async function toolFileWrite(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const path = String(args.path ?? '');
	const content = args.content;
	if (!path) return { id: '', name: 'file:write', success: false, error: 'path is required', durationMs: 0 };
	if (typeof content !== 'string') {
		return { id: '', name: 'file:write', success: false, error: 'content must be a string (use "" for an empty file)', durationMs: 0 };
	}
	if (!withinProject(path, projectRoot)) {
		return { id: '', name: 'file:write', success: false, error: 'Access denied: ' + path, durationMs: 0 };
	}

	const fullPath = toProjectPath(path, projectRoot);
	let existingContent = '';
	try {
		if (existsSync(fullPath)) {
			if (!statSync(fullPath).isFile()) {
				return { id: '', name: 'file:write', success: false, error: 'Path "' + path + '" is not a file', durationMs: 0 };
			}
			existingContent = await readFileAsync(fullPath, 'utf-8');
		}
	} catch {
		// Fall back to an empty diff base; applyFileChange reports write errors.
	}

	const { result } = proposeFileChange(path, content, projectRoot, 'write', existingContent);
	return result;
}

async function toolFileEdit(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const path = String(args.path ?? '');
	const oldString = String(args.old_string ?? '');
	const newString = String(args.new_string ?? '');
	if (!path || !oldString) return { id: '', name: 'file:edit', success: false, error: 'path and old_string are required', durationMs: 0 };
	if (!withinProject(path, projectRoot)) {
		return { id: '', name: 'file:edit', success: false, error: 'Access denied: ' + path, durationMs: 0 };
	}

	const fullPath = toProjectPath(path, projectRoot);

	try {
		const existingContent = existsSync(fullPath) ? await readFileAsync(fullPath, 'utf-8') : '';
		if (!existingContent) {
			return { id: '', name: 'file:edit', success: false, error: 'File not found or empty: ' + path + '. Use file:write to create it.', durationMs: 0 };
		}
		// Models usually emit LF even when the file on disk uses CRLF. Match on a
		// normalized copy, then restore the file's line endings.
		const eol = existingContent.includes('\r\n') ? '\r\n' : '\n';
		const fileText = existingContent.replace(/\r\n/g, '\n');
		const findText = oldString.replace(/\r\n/g, '\n');
		const replaceText = newString.replace(/\r\n/g, '\n');

		if (!fileText.includes(findText)) {
			return { id: '', name: 'file:edit', success: false, error: 'old_string not found in ' + path + '. Check whitespace or read the file again.', durationMs: 0 };
		}

		const occurrences = fileText.split(findText).length - 1;
		const replaceAll = args.replace_all === true || args.replace_all === 'true';
		if (occurrences > 1 && !replaceAll) {
			return {
				id: '',
				name: 'file:edit',
				success: false,
				error: `old_string appears ${occurrences} times in ${path}. Include more surrounding context or pass replace_all: true.`,
				durationMs: 0,
			};
		}

		// Function replacement keeps `$&`, `$1`, ... in generated code literal.
		const updated = replaceAll
			? fileText.split(findText).join(replaceText)
			: fileText.replace(findText, () => replaceText);
		const newContent = eol === '\r\n' ? updated.replace(/\n/g, '\r\n') : updated;
		const { result } = proposeFileChange(path, newContent, projectRoot, 'edit', existingContent);
		return result;
	} catch (err) {
		return { id: '', name: 'file:edit', success: false, error: 'Cannot edit ' + path + ': ' + (err instanceof Error ? err.message : String(err)), durationMs: 0 };
	}
}

async function toolFileDelete(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const path = String(args.path ?? '');
	if (!path) return { id: '', name: 'file:delete', success: false, error: 'path is required', durationMs: 0 };
	if (!withinProject(path, projectRoot)) {
		return { id: '', name: 'file:delete', success: false, error: 'Access denied: ' + path, durationMs: 0 };
	}

	const fullPath = toProjectPath(path, projectRoot);
	try {
		if (!existsSync(fullPath)) {
			return { id: '', name: 'file:delete', success: false, error: 'File not found: ' + path, durationMs: 0 };
		}
		if (!statSync(fullPath).isFile()) {
			return { id: '', name: 'file:delete', success: false, error: 'Path "' + path + '" is not a file', durationMs: 0 };
		}
		const existingContent = await readFileAsync(fullPath, 'utf-8');
		return proposeFileChange(path, '', projectRoot, 'delete', existingContent).result;
	} catch (err) {
		return { id: '', name: 'file:delete', success: false, error: 'Cannot delete ' + path + ': ' + (err instanceof Error ? err.message : String(err)), durationMs: 0 };
	}
}

async function toolFileGlob(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const globPattern = String(args.pattern ?? '').replace(/\\/g, '/');
	if (!globPattern) return { id: '', name: 'file:glob', success: false, error: 'pattern is required', durationMs: 0 };
	if (isAbsolute(globPattern) && !withinProject(globPattern, projectRoot)) {
		return { id: '', name: 'file:glob', success: false, error: 'Access denied', durationMs: 0 };
	}

	const cwd = args.cwd ? String(args.cwd) : projectRoot;
	const fullCwd = toProjectPath(cwd, projectRoot);
	if (!withinProject(fullCwd, projectRoot)) {
		return { id: '', name: 'file:glob', success: false, error: 'Access denied', durationMs: 0 };
	}

	try {
		const cacheKey = `${projectRoot}\0${fullCwd}\0${globPattern}`;
		const cached = globCache.get(cacheKey);
		if (cached !== undefined) return { id: '', name: 'file:glob', success: true, output: cached, durationMs: 0 };
		const files = await globPromise(globPattern, {
			cwd: fullCwd,
			absolute: false,
			dot: true,
			ignore: ['**/node_modules/**', '**/.git/**'],
		});
		const shown = files.slice(0, MAX_GLOB_RESULTS);
		const suffix = files.length > shown.length ? `\n(${files.length - shown.length} more files not shown; narrow the pattern)` : '';
		const output = shown.length > 0 ? shown.join('\n') + suffix : '(no files matched)';
		globCache.set(cacheKey, output);
		return { id: '', name: 'file:glob', success: true, output, durationMs: 0 };
	} catch (err) {
		return { id: '', name: 'file:glob', success: false, error: 'glob error: ' + (err instanceof Error ? err.message : String(err)), durationMs: 0 };
	}
}

async function toolGrep(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const pattern = String(args.pattern ?? '');
	const path = args.path ? String(args.path) : '.';
	const caseSensitive = args.case_sensitive !== false;

	if (!pattern) return { id: '', name: 'grep', success: false, error: 'pattern is required', durationMs: 0 };

	const fullPath = toProjectPath(path, projectRoot);
	if (!withinProject(fullPath, projectRoot)) {
		return { id: '', name: 'grep', success: false, error: 'Access denied', durationMs: 0 };
	}
	if (!existsSync(fullPath)) {
		return { id: '', name: 'grep', success: false, error: 'Path not found: ' + path, durationMs: 0 };
	}

	let matcher: RegExp;
	try {
		matcher = new RegExp(pattern, caseSensitive ? '' : 'i');
	} catch {
		// Invalid regex — search for the literal text instead.
		matcher = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? '' : 'i');
	}

	try {
		let files: string[];
		if (statSync(fullPath).isDirectory()) {
			let globPattern = String(args.glob ?? '**/*').replace(/\\/g, '/');
			// grep --include semantics: a bare "*.ts" searches recursively.
			if (args.glob && !globPattern.includes('/')) globPattern = '**/' + globPattern;
			if (isAbsolute(globPattern) && !withinProject(globPattern, projectRoot)) {
				return { id: '', name: 'grep', success: false, error: 'Access denied', durationMs: 0 };
			}
			files = await globPromise(globPattern, {
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
		let truncated = false;
		for (const file of files) {
			try {
				const info = statSync(file);
				if (!info.isFile() || info.size > MAX_GREP_FILE_BYTES) continue;
				const content = await readFileAsync(file, 'utf-8');
				const rel = relative(projectRoot, file).replace(/\\/g, '/');
				const lines = content.split(/\r?\n/);
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i] ?? '';
					if (!matcher.test(line)) continue;
					matches.push(rel + ':' + (i + 1) + ': ' + line.slice(0, 400));
					if (matches.length >= MAX_GREP_MATCHES) {
						truncated = true;
						break;
					}
				}
			} catch {
				// Unreadable file — keep searching the rest.
			}
			if (truncated) break;
		}

		const suffix = truncated ? `\n(stopped at ${MAX_GREP_MATCHES} matches; narrow the search)` : '';
		return {
			id: '',
			name: 'grep',
			success: true,
			output: matches.length > 0 ? matches.join('\n') + suffix : '(no matches found)',
			durationMs: 0,
		};
	} catch (err) {
		return { id: '', name: 'grep', success: false, error: 'grep error: ' + (err instanceof Error ? err.message : String(err)), durationMs: 0 };
	}
}

// ── Bash ─────────────────────────────────────────────────────────────────────

const DANGEROUS_PATTERNS = [
	/rm\s+-rf\s+['"]?\//i,
	/dd\s+if=/i,
	/>\s*\/dev\/sda/i,
	/mkfs\./i,
	/:\s*\(\)\s*\{\s*:\|:&?\s*\};?\s*:/i,
];

async function toolBash(args: Record<string, unknown>, projectRoot: string, onOutput?: ToolOutputHandler): Promise<ToolResult> {
	if (typeof args.command !== 'string' || !args.command.trim()) {
		return { id: '', name: 'bash:execute', success: false, error: 'command must be a non-empty string. Do not pass an object or shell syntax in another field.', durationMs: 0 };
	}
	const command = args.command;
	const cwd = args.cwd ? String(args.cwd) : projectRoot;
	const fullCwd = toProjectPath(cwd, projectRoot);
	// The schema (and BASH_TIMEOUT) are milliseconds.
	const requestedTimeout = Number(args.timeout ?? getConfig(projectRoot).bashTimeout);
	const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : 300_000;

	if (!command) return { id: '', name: 'bash:execute', success: false, error: 'command is required', durationMs: 0 };
	if (!withinProject(fullCwd, projectRoot)) {
		return { id: '', name: 'bash:execute', success: false, error: 'Access denied: shell cwd must be inside the project root', durationMs: 0 };
	}
	if (/\/tmp(?:\/|\s|$)|\/var\/tmp(?:\/|\s|$)|\$TMPDIR|%TEMP%|\bmktemp\b/i.test(command)) {
		return { id: '', name: 'bash:execute', success: false, error: 'Project files must be created in the active project directory, not an OS temporary directory', durationMs: 0 };
	}

	for (const pattern of DANGEROUS_PATTERNS) {
		if (pattern.test(command)) {
			return { id: '', name: 'bash:execute', success: false, error: 'Dangerous command blocked: ' + command.slice(0, 50), durationMs: 0 };
		}
	}

	// Stream the command live (like Claude Code / opencode): output is piped
	// to the terminal panel hooks while it runs, and captured for the model.
		return await new Promise<ToolResult>((resolve) => {
			let settled = false;
			let stdout = '';
			let stderr = '';
			let timer: ReturnType<typeof setTimeout> | null = null;
			const finish = (success: boolean, exitCode: number | null, error?: string): void => {
				if (settled) return;
				settled = true;
				if (timer) clearTimeout(timer);
				terminalHooks.onEnd?.(exitCode);
				const combinedOutput = [stdout, stderr].filter(Boolean).join('');
				const metadata = { command, cwd: fullCwd, stdout, stderr, exitCode };
				resolve(
					success
						? { id: '', name: 'bash:execute', success: true, output: combinedOutput || '(no output)', ...metadata, durationMs: 0 }
						: {
							id: '',
							name: 'bash:execute',
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
						},
				);
		};

		terminalHooks.onStart?.(command);
		const child = spawn(command, {
			cwd: fullCwd,
			shell: resolveShell(),
			windowsHide: true,
			env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
		});
		activeBashChild = child;
		const releaseChild = (): void => {
			if (activeBashChild === child) activeBashChild = null;
		};
		child.on('close', releaseChild);
		child.on('error', releaseChild);

			const capture = (stream: ToolOutputStream) => (chunk: Buffer | string): void => {
				const text = chunk.toString();
				onOutput?.(stream, text);
				// Keep the tail: build errors are usually at the end of the output.
				if (stream === 'stdout') stdout = (stdout + text).slice(-MAX_BASH_OUTPUT);
				else stderr = (stderr + text).slice(-MAX_BASH_OUTPUT);
				terminalHooks.onOutput?.(text);
			};
			child.stdout?.setEncoding('utf8');
			child.stderr?.setEncoding('utf8');
			child.stdout?.on('data', capture('stdout'));
			child.stderr?.on('data', capture('stderr'));
		child.on('error', (err) => finish(false, null, err.message));
		child.on('close', (code) => finish(code === 0, code));

		timer = setTimeout(() => {
			terminalHooks.onOutput?.(`\n[agent-termo] timed out after ${timeoutMs}ms`);
			killProcessTree(child);
			finish(false, null, `Command timed out after ${timeoutMs}ms`);
		}, timeoutMs);
	});
}

// ── Git Tools ────────────────────────────────────────────────────────────────

async function toolGitStatus(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const cwd = args.cwd ? String(args.cwd) : projectRoot;
	const fullCwd = toProjectPath(cwd, projectRoot);
	if (!withinProject(fullCwd, projectRoot)) return { id: '', name: 'git:status', success: false, error: 'Access denied: Git cwd must be inside the project root', durationMs: 0 };
	try {
		const git = simpleGit(fullCwd);
		const status = await git.status();
		const tracking = status.tracking;
		const lines = [
			'Current branch: ' + (status.current ?? 'unknown'),
			tracking ? 'tracking: ' + tracking : '',
			'',
			'Modified: ' + (status.modified.length > 0 ? status.modified.join(', ') : '(none)'),
			'Created: ' + (status.created.length > 0 ? status.created.join(', ') : '(none)'),
			'Deleted: ' + (status.deleted.length > 0 ? status.deleted.join(', ') : '(none)'),
			'',
			'Not staged: ' + (status.not_added.length > 0 ? status.not_added.join(', ') : '(none)'),
			'',
			'Changed files: ' + (status.files.length > 0 ? status.files.map((file) => file.path).join(', ') : '(none)'),
		].filter(Boolean).join('\n');
		return { id: '', name: 'git:status', success: true, output: lines, durationMs: 0 };
	} catch (err) {
		return { id: '', name: 'git:status', success: false, error: err instanceof Error ? err.message : String(err), durationMs: 0 };
	}
}

async function toolGitCommit(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const message = String(args.message ?? '');
	const cwd = args.cwd ? String(args.cwd) : projectRoot;
	const fullCwd = toProjectPath(cwd, projectRoot);
	if (!message) return { id: '', name: 'git:commit', success: false, error: 'message is required', durationMs: 0 };
	if (!withinProject(fullCwd, projectRoot)) return { id: '', name: 'git:commit', success: false, error: 'Access denied: Git cwd must be inside the project root', durationMs: 0 };
	try {
		const git = simpleGit(fullCwd);
		await git.add('.');
		const result = await git.commit(message);
		return { id: '', name: 'git:commit', success: true, output: 'Committed ' + result.commit + ' — ' + message, durationMs: 0 };
	} catch (err) {
		return { id: '', name: 'git:commit', success: false, error: err instanceof Error ? err.message : String(err), durationMs: 0 };
	}
}

async function toolGitPush(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const cwd = args.cwd ? String(args.cwd) : projectRoot;
	const fullCwd = toProjectPath(cwd, projectRoot);
	if (!withinProject(fullCwd, projectRoot)) return { id: '', name: 'git:push', success: false, error: 'Access denied: Git cwd must be inside the project root', durationMs: 0 };
	try {
		const git = simpleGit(fullCwd);
		await git.push();
		return { id: '', name: 'git:push', success: true, output: 'Pushed to remote.', durationMs: 0 };
	} catch (err) {
		return { id: '', name: 'git:push', success: false, error: err instanceof Error ? err.message : String(err), durationMs: 0 };
	}
}

async function toolGitLog(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const cwd = args.cwd ? String(args.cwd) : projectRoot;
	const fullCwd = toProjectPath(cwd, projectRoot);
	const limit = Number(args.limit ?? 20);
	if (!withinProject(fullCwd, projectRoot)) return { id: '', name: 'git:log', success: false, error: 'Access denied: Git cwd must be inside the project root', durationMs: 0 };
	try {
		const git = simpleGit(fullCwd);
		const log = await git.log({ maxCount: limit });
		const lines = log.all
			.map((c: { hash: string; date: string; message: string; author_name: string }) => c.hash.slice(0, 7) + ' | ' + c.date.slice(0, 10) + ' | ' + c.message + ' (' + c.author_name + ')')
			.join('\n');
		return { id: '', name: 'git:log', success: true, output: lines, durationMs: 0 };
	} catch (err) {
		return { id: '', name: 'git:log', success: false, error: err instanceof Error ? err.message : String(err), durationMs: 0 };
	}
}
