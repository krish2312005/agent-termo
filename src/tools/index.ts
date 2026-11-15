// =============================================================================
// Agent-Termo Tool Executor — routes tool calls to implementations
// =============================================================================

import { readFile as readFileAsync, writeFile as writeFileAsync, unlink as unlinkAsync } from 'node:fs/promises';
import { resolve, isAbsolute, relative } from 'node:path';
import { exec as execAsync } from 'node:child_process';
import { promisify } from 'node:util';
import { default as globAsync } from 'glob';
import { simpleGit } from 'simple-git';
import { statSync, existsSync, mkdirSync } from 'node:fs';
import { getConfig } from '../utils/config.js';
import { computeDiff } from '../diff/index.js';
import type { ToolResult, ProposedFileChange } from '../types/index.js';

const exec = promisify(execAsync);
const globPromise = promisify(globAsync);

// ── Tool map ────────────────────────────────────────────────────────────────

const TOOL_MAP: Record<string, (...args: any[]) => Promise<ToolResult>> = {
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

// ── Public API ──────────────────────────────────────────────────────────────

export async function executeTool(
	name: string,
	args: Record<string, unknown>,
	projectRoot: string,
): Promise<ToolResult> {
	const start = Date.now();
	const id = crypto.randomUUID();

	try {
		const fn = TOOL_MAP[name];
		if (!fn) {
			return { id, name, success: false, error: 'Unknown tool: ' + name, durationMs: Date.now() - start };
		}
		return await fn(args, projectRoot);
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
	changeType: 'write' | 'edit',
	oldContent?: string,
): { change: ProposedFileChange; result: ToolResult } {
	const fullPath = toProjectPath(path, projectRoot);
	const originalContent = oldContent ?? '';
	const isNewFile = !existsSync(fullPath);
	const isDeletion = proposedContent === '' && changeType === 'write';

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

	const lineCount = proposedContent.split('\n').length;
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

		const content = await readFileAsync(fullPath, 'utf-8');
		const lines = content.split('\n');
		const sliced = lines.slice(offset, limit > 0 ? offset + limit : undefined);
		const summary = limit > 0 ? '[Showing lines ' + (offset + 1) + '-' + (offset + sliced.length) + ' of ' + lines.length + ']' : '';
		return { id: '', name: 'file:read', success: true, output: (summary ? summary + '\n' : '') + sliced.join('\n'), durationMs: 0 };
	} catch (err) {
		return { id: '', name: 'file:read', success: false, error: 'Cannot read ' + path + ': ' + (err instanceof Error ? err.message : String(err)), durationMs: 0 };
	}
}

async function toolFileWrite(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const path = String(args.path ?? '');
	const content = String(args.content ?? '');
	if (!path) return { id: '', name: 'file:write', success: false, error: 'path is required', durationMs: 0 };
	if (!withinProject(path, projectRoot)) {
		return { id: '', name: 'file:write', success: false, error: 'Access denied: ' + path, durationMs: 0 };
	}

	const { result } = proposeFileChange(path, content, projectRoot, 'write');
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
		if (!existingContent.includes(oldString)) {
			return { id: '', name: 'file:edit', success: false, error: 'old_string not found in ' + path + '. Check whitespace.', durationMs: 0 };
		}
		const newContent = existingContent.replace(oldString, newString);
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
		const existingContent = await readFileAsync(fullPath, 'utf-8');
		return proposeFileChange(path, '', projectRoot, 'write', existingContent).result;
	} catch (err) {
		return { id: '', name: 'file:delete', success: false, error: 'Cannot delete ' + path + ': ' + (err instanceof Error ? err.message : String(err)), durationMs: 0 };
	}
}

async function toolFileGlob(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const globPattern = String(args.pattern ?? '');
	if (!globPattern) return { id: '', name: 'file:glob', success: false, error: 'pattern is required', durationMs: 0 };

	const cwd = args.cwd ? String(args.cwd) : projectRoot;
	const fullCwd = toProjectPath(cwd, projectRoot);
	if (!withinProject(fullCwd, projectRoot)) {
		return { id: '', name: 'file:glob', success: false, error: 'Access denied', durationMs: 0 };
	}

	try {
		const files = await globPromise(globPattern, { cwd: fullCwd, absolute: false });
		return { id: '', name: 'file:glob', success: true, output: files.length > 0 ? files.join('\n') : '(no files matched)', durationMs: 0 };
	} catch (err) {
		return { id: '', name: 'file:glob', success: false, error: 'glob error: ' + (err instanceof Error ? err.message : String(err)), durationMs: 0 };
	}
}

async function toolGrep(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const pattern = String(args.pattern ?? '');
	const path = args.path ? String(args.path) : '.';
	const caseSensitive = args.case_sensitive !== false;

	if (!pattern || !path) return { id: '', name: 'grep', success: false, error: 'pattern and path are required', durationMs: 0 };

	if (isAbsolute(path) && !withinProject(path, projectRoot)) {
		return { id: '', name: 'grep', success: false, error: 'Access denied', durationMs: 0 };
	}
	const fullPath = isAbsolute(path) ? path : resolve(projectRoot, path);
	const flags = caseSensitive ? '' : '-i';
	const includeFlag = args.glob ? ['--include=' + String(args.glob)] : [];

	try {
		const cmd = ['grep', flags, '-rn', '--color=never', pattern, fullPath, ...includeFlag].join(' ');
		const { stdout, stderr } = await exec(cmd, { timeout: 30000 } as { timeout: number });
		const results = (stdout || stderr).trim();
		return { id: '', name: 'grep', success: true, output: results || '(no matches found)', durationMs: 0 };
	} catch (err: unknown) {
		const errorObj = err as { code?: string | number; message?: string; stdout?: string; stderr?: string };
		if (errorObj.code === 1) return { id: '', name: 'grep', success: true, output: '(no matches found)', durationMs: 0 };
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

async function toolBash(args: Record<string, unknown>, projectRoot: string): Promise<ToolResult> {
	const command = String(args.command ?? '');
	const cwd = args.cwd ? String(args.cwd) : projectRoot;
	const fullCwd = toProjectPath(cwd, projectRoot);
	const timeout = Number(args.timeout ?? getConfig(projectRoot).bashTimeout);

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

	try {
		const { stdout, stderr } = await exec(command, { cwd: fullCwd, timeout } as { cwd: string; timeout: number });
		const output = [stdout, stderr].filter(Boolean).join('\n');
		return { id: '', name: 'bash:execute', success: true, output: output || '(no output)', durationMs: 0 };
	} catch (err: unknown) {
		const errorObj = err as { message?: string; stdout?: string; stderr?: string };
		const combined = [errorObj.stdout, errorObj.stderr].filter(Boolean).join('\n');
		return { id: '', name: 'bash:execute', success: false, error: combined.slice(0, 500) || errorObj.message, durationMs: 0 };
	}
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
			'Untracked: ' + (status.files.length > 0 ? status.files.join(', ') : '(none)'),
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
