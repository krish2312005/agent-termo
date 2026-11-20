import { describe, expect, it } from 'vitest';
import { computeDiff, computeFileChanges, applyDiffContext } from '../../src/diff/index.js';

describe('file diff generation', () => {
	it('shows additions, deletions and replacements with old/new line positions', () => {
		const diff = computeDiff('keep\nold value\nend', 'keep\nnew value\nend');
		expect(diff.additions).toBe(1);
		expect(diff.deletions).toBe(1);
		expect(diff.lines).toEqual([
			{ type: 'context', lineNumber: 1, content: 'keep' },
			{ type: 'remove', lineNumber: 2, content: 'old value' },
			{ type: 'add', lineNumber: 2, content: 'new value' },
			{ type: 'context', lineNumber: 3, content: 'end' },
		]);
	});

	it('builds changes for new, edited, deleted and documentation files', () => {
		const before = new Map([
			['src/app.py', 'before'],
			['docs/guide.md', 'old docs'],
			['src/remove.ts', 'remove me'],
		]);
		const after = new Map([
			['src/app.py', 'after'],
			['docs/guide.md', 'new docs'],
			['src/new.ts', 'created'],
		]);
		const changes = computeFileChanges(before, after);
		expect(changes.map((change) => change.path)).toEqual(['src/app.py', 'docs/guide.md', 'src/remove.ts', 'src/new.ts']);
		expect(changes.find((change) => change.path === 'src/new.ts')?.isNewFile).toBe(true);
		expect(changes.find((change) => change.path === 'src/remove.ts')?.isDeletion).toBe(true);
		expect(changes.find((change) => change.path === 'docs/guide.md')?.diff.additions).toBe(1);
		expect(changes.find((change) => change.path === 'docs/guide.md')?.diff.deletions).toBe(1);
	});

	it('does not report unchanged files or an unchanged empty file as a line addition', () => {
		expect(computeDiff('', '').additions).toBe(0);
		expect(computeFileChanges(new Map([['empty.txt', '']]), new Map([['empty.txt', '']]))).toEqual([]);
	});

	it('limits display context to three lines around changed regions', () => {
		const original = Array.from({ length: 30 }, (_, index) => 'line ' + (index + 1));
		const proposed = [...original];
		proposed[4] = 'changed first';
		proposed[25] = 'changed second';
		const visible = applyDiffContext(computeDiff(original.join('\n'), proposed.join('\n')));
		expect(visible.lines.some((line) => line.content.includes('unchanged lines omitted'))).toBe(true);
		expect(visible.lines).toContainEqual(expect.objectContaining({ type: 'add', content: 'changed first' }));
		expect(visible.lines).toContainEqual(expect.objectContaining({ type: 'add', content: 'changed second' }));
	});
});
