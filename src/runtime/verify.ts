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
	kind: 'placeholder' | 'unverified' | 'check-failed';
	detail: string;
}

/** The minimal shape this module needs from runtime/checks.ts's CheckRun. */
export interface RanCheck {
	command: string;
	success: boolean;
	output: string;
}

export interface VerificationResult {
	ok: boolean;
	issues: VerificationIssue[];
}

/** A function/method/arrow body whose entire implementation is a stub. */
const STUB_PATTERNS: Array<{ re: RegExp; label: string }> = [
	{ re: /function\s+[\w$]*\s*\([^)]*\)\s*(?::\s*[^\n{]+)?\s*\{\s*return\s+(null|undefined)\s*;?\s*\}/g, label: 'function body is only "return null/undefined"' },
	{ re: /=>\s*\{\s*return\s+(null|undefined)\s*;?\s*\}/g, label: 'arrow function body is only "return null/undefined"' },
	{ re: /throw new Error\(\s*["'`](?:not implemented|unimplemented)\b/gi, label: 'throws a "not implemented" error' },
	// TODO must be uppercase: a lowercase "todo" is usually domain vocabulary
	// (e.g. "Todo not found"), not a stub marker.
	{ re: /throw new Error\(\s*["'`]TODO\b/, label: 'throws a "TODO" placeholder error' },
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
	/(?:^|[;&|]\s*)(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test(?::unit)?|build|lint|typecheck|type-check|tsc)\b|(?:bunx|npx)\s+(?:vitest|jest|mocha|pytest|tsc|eslint|flake8|ruff)\b|(?:vitest|jest|mocha|pytest|tsc|eslint|flake8|ruff)\b|node\s+--test\b)/i;

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
 * content (the last applied version, not an intermediate draft). `ranChecks`
 * records each `bash:execute` result, including its observed success state
 * and output; never populate it from the agent's self-report.
 */
export function verifyCompletion(task: string, changedFiles: ReadonlyMap<string, string>, ranChecks: readonly RanCheck[]): VerificationResult {
	const issues: VerificationIssue[] = [];

	for (const [path, content] of changedFiles) {
		issues.push(...scanForPlaceholders(path, content));
	}

	const touchedCode = [...changedFiles.keys()].some((path) => CODE_FILE.test(path));
	if (touchedCode && VERIFIABLE_TASK.test(task)) {
		const latestChecks = new Map<string, RanCheck>();
		for (const check of ranChecks) {
			if (CHECK_COMMAND.test(check.command)) {
				const key = check.command.trim().replace(/\s+/g, ' ').toLowerCase();
				latestChecks.set(key, check);
			}
		}
		const matchingChecks = [...latestChecks.values()];
		const failedCheck = matchingChecks.find((check) => !check.success);

		if (failedCheck) {
			issues.push({
				kind: 'check-failed',
				detail: `\`${failedCheck.command}\` failed: ${failedCheck.output.replace(/\s+/g, ' ').trim().slice(0, 400)}`,
			});
		} else if (!matchingChecks.some((check) => check.success)) {
			issues.push({
				kind: 'unverified',
				detail:
					`code was written or edited for a task that implies working functionality ("${task.replace(/\s+/g, ' ').trim().slice(0, 100)}"), ` +
					'but no test, build, lint or type-check command passed during the run.',
			});
		}
	}

	return { ok: issues.length === 0, issues };
}

/** Render a VerificationResult's issues as a short bullet list for a report. */
export function formatIssues(issues: readonly VerificationIssue[]): string {
	return issues.map((issue) => `- ${issue.detail}`).join('\n');
}

/**
 * verifyCompletion(), but when no check command ran during the task, it invokes
 * the project's own checks instead of guessing from the agent's command history.
 * runChecks is injected so this remains testable without spawning real processes.
 *
 * - No project check scripts (`runChecks` returns []): the unverified finding
 *   remains.
 * - A project check fails: the result contains the actual command and output.
 * - Project checks pass: the unverified finding is lifted.
 */
export async function verifyCompletionWithChecks(
	task: string,
	changedFiles: ReadonlyMap<string, string>,
	ranChecks: readonly RanCheck[],
	runChecks: () => Promise<readonly RanCheck[]>,
): Promise<VerificationResult> {
	const result = verifyCompletion(task, changedFiles, ranChecks);
	if (!result.issues.some((issue) => issue.kind === 'unverified')) return result;

	const checks = await runChecks();
	if (checks.length === 0) return result;

	const issues = result.issues.filter((issue) => issue.kind !== 'unverified');
	const failed = checks.find((check) => !check.success);
	if (failed) {
		issues.push({
			kind: 'check-failed',
			detail: `\`${failed.command}\` failed:\n${failed.output.replace(/\s+/g, ' ').trim().slice(0, 400)}`,
		});
	}
	return { ok: issues.length === 0, issues };
}
