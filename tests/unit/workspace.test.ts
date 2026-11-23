import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPathWithinWorkspace } from '../../src/runtime/workspace.js';

describe('workspace path boundary', () => {
	it('allows paths inside the project and future descendants', () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-termo-workspace-'));
		try {
			mkdirSync(join(root, 'src'));
			expect(isPathWithinWorkspace('src/new/file.ts', root)).toBe(true);
			expect(isPathWithinWorkspace(join(root, 'src'), root)).toBe(true);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('rejects lexical traversal outside the project', () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-termo-workspace-'));
		try { expect(isPathWithinWorkspace('../outside.txt', root)).toBe(false); }
		finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('rejects symlinked files and directories that escape the project', () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-termo-workspace-'));
		const outside = mkdtempSync(join(tmpdir(), 'agent-termo-outside-'));
		try {
			writeFileSync(join(outside, 'secret.txt'), 'secret');
			try {
				symlinkSync(outside, join(root, 'linked-dir'), process.platform === 'win32' ? 'junction' : 'dir');
				symlinkSync(join(outside, 'secret.txt'), join(root, 'linked-file'), 'file');
			} catch {
				if (process.platform === 'win32') return;
				throw new Error('Could not create symlink fixture');
			}
			expect(isPathWithinWorkspace('linked-dir/new.txt', root)).toBe(false);
			expect(isPathWithinWorkspace('linked-file', root)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(outside, { recursive: true, force: true });
		}
	});
});
