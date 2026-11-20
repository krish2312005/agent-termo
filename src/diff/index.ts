// =============================================================================
// Diff Engine — line-level diff computation for file change review
// =============================================================================
// Uses LCS (Longest Common Subsequence) to compute minimal line-level diffs.

import type { DiffLine, DiffResult, ProposedFileChange } from '../types/index.js';

// ── LCS-based Diff Algorithm ────────────────────────────────────────────────

export function computeDiff(original: string, proposed: string): DiffResult {
	if (original === proposed) {
		return { file: '', lines: [], additions: 0, deletions: 0 };
	}

	const originalLines = original.split('\n');
	const proposedLines = proposed.split('\n');

	if (originalLines.length === 1 && originalLines[0] === '') {
		const lines: DiffLine[] = proposedLines.map((content, i) => ({
			type: 'add',
			lineNumber: i + 1,
			content,
		}));
		return { file: '', lines, additions: proposedLines.length, deletions: 0 };
	}

	const m = originalLines.length;
	const n = proposedLines.length;
	const stride = n + 1;
	const table = new Int32Array((m + 1) * (n + 1));

	const get = (i: number, j: number): number => table[i * stride + j]!;
	const set = (i: number, j: number, val: number) => { table[i * stride + j] = val; };

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (originalLines[i - 1] === proposedLines[j - 1]) {
				set(i, j, get(i - 1, j - 1) + 1);
			} else {
				set(i, j, Math.max(get(i - 1, j), get(i, j - 1)));
			}
		}
	}

	const ops = backtrackLCS(get, originalLines, proposedLines);
	const diffLines = opsToDiffLines(ops);

	let additions = 0;
	let deletions = 0;
	for (const line of diffLines) {
		if (line.type === 'add') additions++;
		if (line.type === 'remove') deletions++;
	}

	return { file: '', lines: diffLines, additions, deletions };
}

interface DiffOp {
	type: 'same' | 'add' | 'remove';
	originalIndex: number;
	proposedIndex: number;
	originalLine?: string;
	proposedLine?: string;
}

function backtrackLCS(
	get: (i: number, j: number) => number,
	a: string[],
	b: string[],
): DiffOp[] {
	const ops: DiffOp[] = [];
	const m = a.length;
	const n = b.length;
	let i = m;
	let j = n;

	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
			ops.unshift({
				type: 'same',
				originalIndex: i,
				proposedIndex: j,
				originalLine: a[i - 1],
				proposedLine: b[j - 1],
			});
			i--;
			j--;
		} else if (j > 0 && (i === 0 || get(i, j - 1) >= get(i - 1, j))) {
			ops.unshift({
				type: 'add',
				proposedIndex: j,
				originalIndex: i,
				proposedLine: b[j - 1],
			});
			j--;
		} else {
			ops.unshift({
				type: 'remove',
				originalIndex: i,
				proposedIndex: j,
				originalLine: a[i - 1],
			});
			i--;
		}
	}

	return ops;
}

function opsToDiffLines(ops: DiffOp[]): DiffLine[] {
	const lines: DiffLine[] = [];
	let originalLineNum = 0;
	let proposedLineNum = 0;

	for (const op of ops) {
		switch (op.type) {
			case 'same': {
				originalLineNum++;
				proposedLineNum++;
				lines.push({
					type: 'context',
					lineNumber: originalLineNum,
					content: op.originalLine ?? '',
				});
				break;
			}
			case 'remove': {
				originalLineNum++;
				lines.push({
					type: 'remove',
					lineNumber: originalLineNum,
					content: op.originalLine ?? '',
				});
				break;
			}
			case 'add': {
				proposedLineNum++;
				lines.push({
					type: 'add',
					lineNumber: proposedLineNum,
					content: op.proposedLine ?? '',
				});
				break;
			}
		}
	}

	return lines;
}

/** Build visual diffs for text files changed by shell commands or external tools. */
export function computeFileChanges(
	before: ReadonlyMap<string, string>,
	after: ReadonlyMap<string, string>,
): ProposedFileChange[] {
	const paths = new Set([...before.keys(), ...after.keys()]);
	const changes: ProposedFileChange[] = [];

	for (const path of paths) {
		const existed = before.has(path);
		const existsNow = after.has(path);
		const originalContent = before.get(path) ?? '';
		const proposedContent = after.get(path) ?? '';
		if (existed === existsNow && originalContent === proposedContent) continue;

		const computed = originalContent === proposedContent
			? { file: path, lines: [], additions: 0, deletions: 0 }
			: { ...computeDiff(originalContent, proposedContent), file: path };
		changes.push({
			path,
			originalContent,
			proposedContent,
			diff: computed,
			isNewFile: !existed,
			isDeletion: !existsNow,
		});
	}

	return changes;
}

// ── Context Extraction for large files ──────────────────────────────────────

export interface DiffOptions {
	contextLines?: number;
	maxLines?: number;
}

export function applyDiffContext(diff: DiffResult, options: DiffOptions = {}): DiffResult {
	const { contextLines = 3, maxLines = 0 } = options;

	if (contextLines <= 0 && maxLines <= 0) {
		return diff;
	}

	// Identify contiguous change regions
	const changeRegions: { start: number; end: number }[] = [];
	let inChange = false;
	let regionStart = 0;

	for (let i = 0; i < diff.lines.length; i++) {
		const line = diff.lines[i]!;
		if (line.type === 'add' || line.type === 'remove') {
			if (!inChange) {
				regionStart = i;
				inChange = true;
			}
		} else {
			if (inChange) {
				changeRegions.push({ start: regionStart, end: i - 1 });
				inChange = false;
			}
		}
	}
	if (inChange) {
		changeRegions.push({ start: regionStart, end: diff.lines.length - 1 });
	}

	// Build merged ranges — use parallel arrays to avoid tuple strict-null issues
	// All accesses use ! because arrays are never sparse at these indices
	const mergeStarts: number[] = [];
	const mergeEnds: number[] = [];

	for (const region of changeRegions) {
		const start = Math.max(0, region.start - contextLines);
		const end = Math.min(diff.lines.length - 1, region.end + contextLines);

		const lastIdx = mergeStarts.length - 1;
		if (mergeStarts.length > 0 && start <= mergeEnds[lastIdx]! + 1) {
			mergeEnds[lastIdx] = Math.max(mergeEnds[lastIdx]!, end);
		} else {
			mergeStarts.push(start);
			mergeEnds.push(end);
		}
	}

	// Build filtered diff lines with ellipsis between non-adjacent ranges
	const filteredLines: DiffLine[] = [];

	for (let r = 0; r < mergeStarts.length; r++) {
		const rangeStart = mergeStarts[r]!;
		const rangeEnd = mergeEnds[r]!;
		const prevEnd = r > 0 ? mergeEnds[r - 1]! : -1;

		if (r > 0 && rangeStart > prevEnd + 1) {
			const omitted = rangeStart - prevEnd - 1;
			filteredLines.push({
				type: 'context',
				lineNumber: 0,
				content: '... ' + omitted + ' unchanged lines omitted ...',
			});
		}

		for (let i = rangeStart; i <= rangeEnd; i++) {
			const line = diff.lines[i]!;
			filteredLines.push(line);
		}
	}

	let finalLines = filteredLines;
	if (maxLines > 0 && finalLines.length > maxLines) {
		const halfMax = Math.floor(maxLines / 2);
		finalLines = [
			...finalLines.slice(0, halfMax),
			{
				type: 'context',
				lineNumber: 0,
				content: '... ' + (finalLines.length - maxLines) + ' more lines ...',
			},
			...finalLines.slice(finalLines.length - halfMax),
		];
	}

	let additions = 0;
	let deletions = 0;
	for (const line of finalLines) {
		if (line.type === 'add') additions++;
		if (line.type === 'remove') deletions++;
	}

	return { ...diff, lines: finalLines, additions, deletions };
}

export function isNoOpDiff(diff: DiffResult): boolean {
	return diff.lines.length === 0 && diff.additions === 0 && diff.deletions === 0;
}
