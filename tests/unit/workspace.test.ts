import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { snapshotWorkspaceFiles, collectWorkspaceChanges } from '../../src/runtime/workspace.js';

let root = '';
afterEach(() => {
	if (root) rmSync(root, { recursive: true, force: true });
	root = '';
});

describe('workspace text snapshots', () => {
	it('includes source, documentation and common text/config files but skips binary files', () => {
		root = mkdtempSync(join(tmpdir(), 'agent-termo-workspace-'));
		mkdirSync(join(root, 'src'));
		mkdirSync(join(root, 'docs'));
		writeFileSync(join(root, 'src', 'app.ts'), 'const value = 1;');
		writeFileSync(join(root, 'docs', 'guide.md'), '# Guide');
		writeFileSync(join(root, 'settings.json'), '{"enabled":true}');
		writeFileSync(join(root, 'notes.txt'), 'remember this');
		writeFileSync(join(root, 'image.png'), Buffer.from([0, 1, 2, 3]));

		const snapshot = snapshotWorkspaceFiles(root);
		expect(snapshot.get('src/app.ts')).toBe('const value = 1;');
		expect(snapshot.get('docs/guide.md')).toBe('# Guide');
		expect(snapshot.get('settings.json')).toBe('{"enabled":true}');
		expect(snapshot.get('notes.txt')).toBe('remember this');
		expect(snapshot.has('image.png')).toBe(false);
	});

	it('detects added, edited and deleted text files between snapshots', () => {
		const before = new Map([['old.md', 'old'], ['edit.py', 'before']]);
		const after = new Map([['edit.py', 'after'], ['new.txt', 'created']]);
		const changes = collectWorkspaceChanges(before, after);
		expect(changes).toEqual(new Map([['old.md', ''], ['edit.py', 'after'], ['new.txt', 'created']]));
	});
});
