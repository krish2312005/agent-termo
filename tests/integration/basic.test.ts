/**
 * Basic Integration Test — tool executor
 *
 * Tests that the tool system correctly executes the file:read tool
 * against real files in the project.
 */

import { describe, it, expect } from 'vitest';
import { executeTool, applyFileChange } from '../../src/tools/index.js';
import { fromWireToolName, parseToolCallsFromText } from '../../src/llm/client.js';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = process.cwd();

describe('executeTool', () => {
	const lifecyclePath = '.test-tool-lifecycle.txt';
	const lifecycleAbsolutePath = resolve(PROJECT_ROOT, lifecyclePath);

	it('file:write, file:edit, and file:delete apply real filesystem changes', async () => {
		rmSync(lifecycleAbsolutePath, { force: true });

		const write = await executeTool('file:write', { path: lifecyclePath, content: 'before\n' }, PROJECT_ROOT);
		expect(write.success).toBe(true);
		const proposedWrite = JSON.parse(write.output ?? '').proposedChange;
		expect((await applyFileChange(proposedWrite, PROJECT_ROOT)).success).toBe(true);
		expect(readFileSync(lifecycleAbsolutePath, 'utf-8')).toBe('before\n');

		const edit = await executeTool('file:edit', { path: lifecyclePath, old_string: 'before', new_string: 'after' }, PROJECT_ROOT);
		const proposedEdit = JSON.parse(edit.output ?? '').proposedChange;
		expect((await applyFileChange(proposedEdit, PROJECT_ROOT)).success).toBe(true);
		expect(readFileSync(lifecycleAbsolutePath, 'utf-8')).toBe('after\n');

		const deletion = await executeTool('file:delete', { path: lifecyclePath }, PROJECT_ROOT);
		expect(deletion.success).toBe(true);
		const proposedDeletion = JSON.parse(deletion.output ?? '').proposedChange;
		expect((await applyFileChange(proposedDeletion, PROJECT_ROOT)).success).toBe(true);
		expect(existsSync(lifecycleAbsolutePath)).toBe(false);
	});

	it('file:write with empty content creates an empty file instead of a deletion', async () => {
		const path = '.test-empty-write.txt';
		const absolutePath = resolve(PROJECT_ROOT, path);
		rmSync(absolutePath, { force: true });
		try {
			const write = await executeTool('file:write', { path, content: '' }, PROJECT_ROOT);
			expect(write.success).toBe(true);
			const change = JSON.parse(write.output ?? '').proposedChange;
			expect(change.isDeletion).toBe(false);
			expect((await applyFileChange(change, PROJECT_ROOT)).success).toBe(true);
			expect(existsSync(absolutePath)).toBe(true);
			expect(readFileSync(absolutePath, 'utf-8')).toBe('');
		} finally {
			rmSync(absolutePath, { force: true });
		}
	});

	it('file:edit matches LF old_string in a CRLF file and preserves CRLF', async () => {
		const path = '.test-crlf-edit.txt';
		const absolutePath = resolve(PROJECT_ROOT, path);
		writeFileSync(absolutePath, 'alpha\r\nbeta\r\ngamma\r\n', 'utf-8');
		try {
			const edit = await executeTool('file:edit', { path, old_string: 'alpha\nbeta', new_string: 'ALPHA\nBETA' }, PROJECT_ROOT);
			expect(edit.success).toBe(true);
			const change = JSON.parse(edit.output ?? '').proposedChange;
			expect((await applyFileChange(change, PROJECT_ROOT)).success).toBe(true);
			expect(readFileSync(absolutePath, 'utf-8')).toBe('ALPHA\r\nBETA\r\ngamma\r\n');
		} finally {
			rmSync(absolutePath, { force: true });
		}
	});

	it('file:edit rejects ambiguous edits and supports replace_all', async () => {
		const path = '.test-ambiguous-edit.txt';
		const absolutePath = resolve(PROJECT_ROOT, path);
		writeFileSync(absolutePath, 'same\nsame\n', 'utf-8');
		try {
			const rejected = await executeTool('file:edit', { path, old_string: 'same', new_string: 'other' }, PROJECT_ROOT);
			expect(rejected.success).toBe(false);
			expect(rejected.error).toContain('appears 2 times');

			const replaceAll = await executeTool('file:edit', { path, old_string: 'same', new_string: 'other', replace_all: true }, PROJECT_ROOT);
			expect(replaceAll.success).toBe(true);
			const change = JSON.parse(replaceAll.output ?? '').proposedChange;
			expect(change.proposedContent).toBe('other\nother\n');
		} finally {
			rmSync(absolutePath, { force: true });
		}
	});

	it('file:edit keeps dollar sequences in new_string literal', async () => {
		const path = '.test-dollar-edit.txt';
		const absolutePath = resolve(PROJECT_ROOT, path);
		writeFileSync(absolutePath, 'value\n', 'utf-8');
		try {
			const edit = await executeTool('file:edit', { path, old_string: 'value', new_string: 'cost $& $1' }, PROJECT_ROOT);
			expect(edit.success).toBe(true);
			const change = JSON.parse(edit.output ?? '').proposedChange;
			expect(change.proposedContent).toBe('cost $& $1\n');
		} finally {
			rmSync(absolutePath, { force: true });
		}
	});

	it('accepts common model tool names and Claude-style argument names', async () => {
		const path = '.test-alias-tool.txt';
		const absolutePath = resolve(PROJECT_ROOT, path);
		rmSync(absolutePath, { force: true });
		try {
			const write = await executeTool('write_file', { file_path: path, file_text: 'alias works\n' }, PROJECT_ROOT);
			expect(write.success).toBe(true);
			const change = JSON.parse(write.output ?? '').proposedChange;
			expect((await applyFileChange(change, PROJECT_ROOT)).success).toBe(true);
			expect(readFileSync(absolutePath, 'utf-8')).toBe('alias works\n');
			expect(fromWireToolName('Read')).toBe('file:read');
		} finally {
			rmSync(absolutePath, { force: true });
		}
	});

	it('grep searches file contents without relying on an external grep binary', async () => {
		const path = '.test-grep-target.txt';
		const absolutePath = resolve(PROJECT_ROOT, path);
		writeFileSync(absolutePath, 'const needle = 1;\nNEEDLE upper\n', 'utf-8');
		try {
			const exact = await executeTool('grep', { pattern: 'needle', path }, PROJECT_ROOT);
			expect(exact.success).toBe(true);
			expect(exact.output).toContain(path + ':1');

			const insensitive = await executeTool('grep', { pattern: 'needle', path, case_sensitive: false }, PROJECT_ROOT);
			expect(insensitive.success).toBe(true);
			expect(insensitive.output).toContain(path + ':2');

			const recursive = await executeTool('grep', { pattern: 'needle', path: '.', glob: '*.txt' }, PROJECT_ROOT);
			expect(recursive.success).toBe(true);
			expect(recursive.output).toContain(path + ':1');
		} finally {
			rmSync(absolutePath, { force: true });
		}

		const traversal = await executeTool('grep', { pattern: 'x', path: '../../..' }, PROJECT_ROOT);
		expect(traversal.success).toBe(false);
		expect(traversal.error).toContain('Access denied');
	});

	it('parses text-emitted tool calls with top-level arguments', () => {
		const wrapped = parseToolCallsFromText('{"tool_calls":[{"id":"call_1","name":"write_file","arguments":{"path":"a.txt","content":"x"}}]}');
		expect(wrapped).toHaveLength(1);
		expect(wrapped[0]?.name).toBe('file:write');
		expect(wrapped[0]?.arguments).toEqual({ path: 'a.txt', content: 'x' });

		const single = parseToolCallsFromText('{"name":"bash","arguments":"{\\"command\\":\\"echo hi\\"}"}');
		expect(single[0]?.name).toBe('bash:execute');
		expect(single[0]?.arguments).toEqual({ command: 'echo hi' });

		const bare = parseToolCallsFromText('[{"name":"Read","arguments":{"file_path":"a.txt"}}]');
		expect(bare[0]?.name).toBe('file:read');
	});

  it('file:read — reads package.json successfully', async () => {
    const result = await executeTool('file:read', { path: 'package.json' }, PROJECT_ROOT);

    expect(result.success).toBe(true);
    expect(result.name).toBe('file:read');
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.output).toBeDefined();
    expect(result.output).toContain('"name": "agent-termo"');
    expect(result.error).toBeUndefined();
  });

  it('file:read — returns error for missing file', async () => {
    const result = await executeTool('file:read', { path: 'DOES_NOT_EXIST.json' }, PROJECT_ROOT);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.output).toBeUndefined();
  });

  it('file:read — returns error when path is missing', async () => {
    const result = await executeTool('file:read', {}, PROJECT_ROOT);

    expect(result.success).toBe(false);
    expect(result.error).toContain('path is required');
  });

  it('file:read — rejects path traversal outside project', async () => {
    const result = await executeTool(
      'file:read',
      { path: '../../../etc/passwd' },
      PROJECT_ROOT,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Access denied');
  });

	it('file:glob — finds TypeScript files', async () => {
    const result = await executeTool('file:glob', { pattern: 'src/**/*.ts' }, PROJECT_ROOT);

    expect(result.success).toBe(true);
    expect(result.name).toBe('file:glob');
    expect(result.output).toBeDefined();
		expect(result.output).toContain('src/cli.ts');
	});

	it('file:glob and bash:execute resolve relative cwd from the project root', async () => {
		const glob = await executeTool('file:glob', { pattern: '*.json', cwd: '.' }, PROJECT_ROOT);
		expect(glob.success).toBe(true);
		expect(glob.output).toContain('package.json');

		const bash = await executeTool('bash:execute', { command: 'node -e "console.log(process.cwd())"', cwd: '.' }, PROJECT_ROOT);
		expect(bash.success).toBe(true);
		expect(bash.output).toContain(PROJECT_ROOT);
	});

  it('file:glob — returns error when pattern is missing', async () => {
    const result = await executeTool('file:glob', {}, PROJECT_ROOT);

    expect(result.success).toBe(false);
    expect(result.error).toContain('pattern is required');
  });

  it('bash:execute — runs a simple echo command', async () => {
    const result = await executeTool(
      'bash:execute',
      { command: 'echo hello' },
      PROJECT_ROOT,
    );

    expect(result.success).toBe(true);
    expect(result.name).toBe('bash:execute');
    expect(result.output).toContain('hello');
  });

	it('bash:execute — blocks dangerous commands', async () => {
    const result = await executeTool(
      'bash:execute',
      { command: 'rm -rf /' },
      PROJECT_ROOT,
    );

    expect(result.success).toBe(false);
		expect(result.error).toContain('Dangerous command blocked');
	});

	it('bash:execute — honors millisecond timeouts', async () => {
		const started = Date.now();
		const result = await executeTool(
			'bash:execute',
			{ command: 'node -e "setTimeout(() => {}, 10000)"', timeout: 1500 },
			PROJECT_ROOT,
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain('timed out after 1500ms');
		expect(Date.now() - started).toBeLessThan(10_000);
	});

	it('normalizes delegated-agent wire names and blocks temp project writes', async () => {
		expect(fromWireToolName('agent_delegate')).toBe('agent:delegate');
		const result = await executeTool('bash:execute', { command: 'touch /tmp/agent-termo-should-not-exist' }, PROJECT_ROOT);
		expect(result.success).toBe(false);
		expect(result.error).toContain('active project directory');
	});

  it('git:status — returns repository status without errors', async () => {
    const result = await executeTool('git:status', {}, PROJECT_ROOT);

    // Success or failure depends on whether this is a git repo
    // We just verify it returns a valid ToolResult shape
    expect(result).toHaveProperty('name', 'git:status');
    expect(typeof result.durationMs).toBe('number');
    expect(typeof result.success).toBe('boolean');
  });

  it('returns error for unknown tool', async () => {
    const result = await executeTool('unknown:tool', {}, PROJECT_ROOT);

    expect(result.success).toBe(false);
    expect(result.name).toBe('unknown:tool');
    expect(result.error).toContain('Unknown tool');
  });
});
