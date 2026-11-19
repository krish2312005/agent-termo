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
	kind: 'placeholder' | 'unverified' | 'check-failed' | 'no-changes';
	detail: string;
}

/** The minimal shape this module needs from runtime/checks.ts's CheckRun. */
export interface RanCheck {
	command: string;
	success: boolean;
	output: string;
	exitCode?: number | null;
	completedAt?: number;
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
	/^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test(?:[:\w-]+)?|build|lint|typecheck|type-check|tsc)\b|npx\s+(?:tsc|eslint|vitest|jest|mocha|pytest|ruff|flake8)\b|(?:tsc|vitest|jest|mocha|pytest|eslint|ruff|flake8)\b)/i;

export function requiresImplementationEvidence(task: string): boolean {
	return VERIFIABLE_TASK.test(task);
}

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
export function verifyCompletion(task: string, changedFiles: ReadonlyMap<string, string>, ranCommands: readonly RanCheck[]): VerificationResult {
	const issues: VerificationIssue[] = [];
	for (const [path, content] of changedFiles) issues.push(...scanForPlaceholders(path, content));

	const touchedCode = [...changedFiles.keys()].some((path) => CODE_FILE.test(path));
	if (requiresImplementationEvidence(task) && !touchedCode) {
		issues.push({ kind: 'no-changes', detail: 'The task requested implementation work, but no changed source files were observed in the workspace. Do not report completion without an actual implementation.' });
		return { ok: false, issues };
	}

	if (touchedCode && requiresImplementationEvidence(task)) {
		const checksByKind = new Map<string, RanCheck>();
		for (const entry of ranCommands) {
			if (!CHECK_COMMAND.test(entry.command.trim())) continue;
			const kind = /build/i.test(entry.command) ? 'build'
				: /lint|eslint|ruff|flake8/i.test(entry.command) ? 'lint'
				: /test|vitest|jest|mocha|pytest/i.test(entry.command) ? 'test' : 'typecheck';
			checksByKind.set(kind, entry);
		}
		const failed = [...checksByKind.values()].filter((entry) => !entry.success);
		if (failed.length > 0) {
			issues.push({ kind: 'check-failed', detail: failed.map((entry) => `${entry.command} failed (exit code ${entry.exitCode ?? 'unknown'}): ${entry.output.replace(/\s+/g, ' ').trim().slice(0, 250)}`).join('\n') });
		} else if (checksByKind.size === 0) {
			issues.push({ kind: 'unverified', detail: `code was changed for an implementation task ("${task.replace(/\s+/g, ' ').trim().slice(0, 100)}"), but no successful test, build, lint or type-check command was recorded after the latest source change.` });
		}
	}
	return { ok: issues.length === 0, issues };
}

/** Render a VerificationResult's issues as a short bullet list for a report. */
export function formatIssues(issues: readonly VerificationIssue[]): string {
	return issues.map((issue) => `- ${issue.detail}`).join('\n');
}

/**
 * verifyCompletion(), but when it would otherwise only flag "nothing was run
 * to check this" (the 'unverified' heuristic), it actually runs the project's
 * own checks via `runChecks` instead of guessing from the agent's command
 * history. `runChecks` is injected so the orchestration here stays testable
 * without spawning real processes; main.ts passes runProjectChecks(projectRoot).
 *
 * - The project defines no test/lint/typecheck script at all (`runChecks`
 *   returns []): nothing to run, so the original heuristic result stands --
 *   this can still flag that code shipped with zero way to verify it.
 * - The project's own check fails: that replaces the heuristic with real,
 *   actionable command output -- the strongest evidence there is that the
 *   task is not actually done.
 * - The project's own check passes: the 'unverified' flag is lifted. The
 *   agent didn't have to remember to run it; the harness ran it for real.
 */
export async function verifyCompletionWithChecks(
	task: string,
	changedFiles: ReadonlyMap<string, string>,
	ranCommands: readonly RanCheck[],
	runChecks: () => Promise<readonly RanCheck[]>,
): Promise<VerificationResult> {
	const initial = verifyCompletion(task, changedFiles, ranCommands);
	const hasCodeChanges = [...changedFiles.keys()].some((path) => CODE_FILE.test(path));
	if (!requiresImplementationEvidence(task) || !hasCodeChanges ||
		initial.issues.some((issue) => issue.kind === 'placeholder' || issue.kind === 'no-changes')) return initial;

	// Agent-reported commands are context; configured project scripts are the
	// authoritative completion gate and always run after the final edits.
	const checks = await runChecks();
	if (checks.length === 0) return initial;
	const issues = initial.issues.filter((issue) => issue.kind === 'placeholder');
	const failed = checks.find((check) => !check.success);
	if (failed) {
		issues.push({ kind: 'check-failed', detail: `${failed.command} failed (exit code ${failed.exitCode ?? 'unknown'}):\n${failed.output.replace(/\s+/g, ' ').trim().slice(0, 500)}` });
	}
	return { ok: issues.length === 0, issues };
}
