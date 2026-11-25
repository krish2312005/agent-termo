import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { executeTool } from '../../src/tools/index.js';

describe('docs:write', () => {
	let projectRoot = '';

	afterEach(() => {
		if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
		projectRoot = '';
	});

	it('proposes a Markdown document within docs/ without bypassing approval', async () => {
		projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-docs-write-'));
		const result = await executeTool('docs:write', {
			path: 'docs/agent-reports/REPORT.md',
			content: '# Work report\n',
		}, projectRoot);

		expect(result.success).toBe(true);
		const proposal = JSON.parse(result.output ?? '{}');
		expect(proposal).toMatchObject({
			needsApproval: true,
			proposedChange: { path: 'docs/agent-reports/REPORT.md', proposedContent: '# Work report\n' },
		});
		expect(existsSync(resolve(projectRoot, 'docs/agent-reports/REPORT.md'))).toBe(false);
	});

	it.each([
		'README.md',
		'src/app.ts',
		'docs/../README.md',
		'docs/reports/notes.txt',
		'docs//empty-segment.md',
		'/tmp/outside.md',
	])('rejects paths outside the Markdown docs area: %s', async (path) => {
		projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-docs-write-'));
		const result = await executeTool('docs:write', { path, content: '# Not allowed\n' }, projectRoot);
		expect(result.success).toBe(false);
		expect(result.error).toContain('only accepts relative Markdown paths inside docs/');
	});
});
