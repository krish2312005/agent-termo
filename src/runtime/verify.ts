// =============================================================================
// Deterministic completion gate for delegated agent runs.
//
// A delegated agent's narrated "done" / final report is a claim, not proof.
// SYSTEM_BASE (src/agents/index.ts) already tells every agent this in prose,
// but nothing previously checked it: runDelegatedAgent (src/main.ts) accepted
// any non-empty final report as "completed" regardless of what the agent
// actually did. This module inspects the evidence recorded during a run --
// the files it wrote and the commands it ran -- and flags completion claims
// the evidence doesn't support, so the caller can refuse to mark the run
// completed instead of trusting the summary text.
// =============================================================================

export interface VerificationIssue {
	kind: 'placeholder' | 'unverified';
	detail: string;
}

export interface VerificationResult {
	ok: boolean;
	issues: VerificationIssue[];
}

/** A function/method/arrow body whose entire implementation is a stub. */
const STUB_PATTERNS: Array<{ re: RegExp; label: string }> = [
	{ re: /function\s+[\w$]*\s*\([^)]*\)\s*(?::\s*[^\n{]+)?\s*\{\s*return\s+(null|undefined)\s*;?\s*\}/g, label: 'function body is only "return null/undefined"' },
	{ re: /=>\s*\{\s*return\s+(null|undefined)\s*;?\s*\}/g, label: 'arrow function body is only "return null/undefined"' },
	{ re: /throw new Error\(\s*["'`](not implemented|unimplemented|todo)/gi, label: 'throws a "not implemented" error' },
	{ re: /\bNotImplementedError\b/g, label: 'raises NotImplementedError' },
	{ re: /^\s*pass\s*(#.*)?$/gm, label: 'empty "pass" body' },
	{ re: /\/\/\s*(TODO|FIXME)\b/i, label: 'TODO/FIXME left in the code' },
	{ re: /#\s*(TODO|FIXME)\b/i, label: 'TODO/FIXME left in the code' },
];

/** File extensions worth scanning for stub implementations. */
const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|c|cpp|h|hpp)$/i;

/** Task language implying working functionality was requested, not just files existing. */
const VERIFIABLE_TASK = /\b(build|implement|fix|feature|component|api|endpoint|bug|refactor|integrat|develop|add)\b/i;

/** Shell commands that count as real verification evidence for code changes. */
const CHECK_COMMAND =
	/\b(test|vitest|jest|mocha|pytest|tsc|typecheck|type-check|lint|eslint|flake8|ruff)\b|\bnpm run (test|build|lint|typecheck)\b|\b(pnpm|yarn) (test|build|lint|typecheck)\b/i;

/** Scan one file's final content for placeholder/stub implementations. */
export function scanForPlaceholders(path: string, content: string): VerificationIssue[] {
	if (!CODE_FILE.test(path)) return [];
	const issues: VerificationIssue[] = [];
	for (const { re, label } of STUB_PATTERNS) {
		re.lastIndex = 0;
		const match = re.exec(content);
		if (match) {
			issues.push({
				kind: 'placeholder',
				detail: `${path}: ${label} (found "${match[0].replace(/\s+/g, ' ').trim().slice(0, 80)}")`,
			});
		}
	}
	return issues;
}

/**
 * Decide whether a delegated run's own evidence supports its completion claim.
 *
 * `changedFiles` maps each file path the run wrote or edited to its final
 * content (the last applied version, not an intermediate draft). `ranCommands`
 * lists every `bash:execute` command the run actually invoked. Both must come
 * from what was observed happening, never from the agent's self-report.
 */
export function verifyCompletion(task: string, changedFiles: ReadonlyMap<string, string>, ranCommands: readonly string[]): VerificationResult {
	const issues: VerificationIssue[] = [];

	for (const [path, content] of changedFiles) {
		issues.push(...scanForPlaceholders(path, content));
	}

	const touchedCode = [...changedFiles.keys()].some((path) => CODE_FILE.test(path));
	if (touchedCode && VERIFIABLE_TASK.test(task) && !ranCommands.some((cmd) => CHECK_COMMAND.test(cmd))) {
		issues.push({
			kind: 'unverified',
			detail:
				`code was written or edited for a task that implies working functionality ("${task.replace(/\s+/g, ' ').trim().slice(0, 100)}"), ` +
				'but no test, build, lint or type-check command was recorded during the run.',
		});
	}

	return { ok: issues.length === 0, issues };
}

/** Render a VerificationResult's issues as a short bullet list for a report. */
export function formatIssues(issues: readonly VerificationIssue[]): string {
	return issues.map((issue) => `- ${issue.detail}`).join('\n');
}
