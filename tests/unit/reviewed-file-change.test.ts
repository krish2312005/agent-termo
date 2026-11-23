import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyFileChange } from '../../src/tools/index.js';
import type { ProposedFileChange } from '../../src/types/index.js';

function change(path: string, originalContent: string, proposedContent: string, isNewFile = false): ProposedFileChange {
	return {
		path,
		originalContent,
		proposedContent,
		diff: { file: path, lines: [], additions: 0, deletions: 0 },
		isNewFile,
		isDeletion: false,
	};
}

describe('reviewed file change application', () => {
	it('applies a reviewed change when the original snapshot is unchanged', async () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-termo-reviewed-change-'));
		try {
			writeFileSync(join(root, 'source.ts'), 'const value = 1;');
			const result = await applyFileChange(change('source.ts', 'const value = 1;', 'const value = 2;'), root);
			expect(result.success).toBe(true);
			expect(readFileSync(join(root, 'source.ts'), 'utf8')).toBe('const value = 2;');
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('rejects a reviewed change if the file was modified after preview', async () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-termo-reviewed-change-'));
		try {
			writeFileSync(join(root, 'source.ts'), 'const value = 3;');
			const result = await applyFileChange(change('source.ts', 'const value = 1;', 'const value = 2;'), root);
			expect(result.success).toBe(false);
			expect(result.error).toContain('modified independently');
			expect(readFileSync(join(root, 'source.ts'), 'utf8')).toBe('const value = 3;');
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('rejects a new-file proposal if the destination appeared after preview', async () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-termo-reviewed-change-'));
		try {
			writeFileSync(join(root, 'new.ts'), 'created independently');
			const result = await applyFileChange(change('new.ts', '', 'agent content', true), root);
			expect(result.success).toBe(false);
			expect(result.error).toContain('already exists');
			expect(readFileSync(join(root, 'new.ts'), 'utf8')).toBe('created independently');
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
});
