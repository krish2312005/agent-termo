// =============================================================================
// Discovers and actually runs a project's own test/typecheck/lint scripts.
//
// QUALITY GATE priority 1 ("evidence-based completion") says: discover the
// project's package manager from its lockfile, inspect its real scripts, and
// never invent a command or claim a check passed without actual output. That
// was previously only prompt text an agent could skip. This module is what
// makes it happen regardless of whether the agent remembers to: it reads the
// project's own package.json scripts (never a guessed command) and runs them
// through the same bash:execute tool the agent itself uses, so the result is
// real process output, not a claim.
// =============================================================================

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { executeTool, type ToolOutputHandler } from '../tools/index.js';
import type { AgentRunJournal } from './engine.js';

export interface CheckRun {
	/** Which kind of check this was: 'typecheck' | 'lint' | 'test'. */
	kind: string;
	/** The exact command that was run (never invented -- taken from package.json). */
	command: string;
	success: boolean;
	/** Tail of combined stdout/stderr. */
	output: string;
}

const LOCKFILE_RUNNER: Array<{ file: string; runner: string }> = [
	{ file: 'pnpm-lock.yaml', runner: 'pnpm run' },
	{ file: 'yarn.lock', runner: 'yarn run' },
	{ file: 'bun.lockb', runner: 'bun run' },
	{ file: 'package-lock.json', runner: 'npm run' },
];

/** Which package.json script names count as which kind of check, in run order. */
const SCRIPT_KINDS: Array<{ kind: string; names: string[] }> = [
	{ kind: 'typecheck', names: ['typecheck', 'type-check', 'tsc'] },
	{ kind: 'lint', names: ['lint'] },
	{ kind: 'test', names: ['test', 'test:unit'] },
];

function detectRunner(projectRoot: string): string {
	for (const { file, runner } of LOCKFILE_RUNNER) {
		if (existsSync(resolve(projectRoot, file))) return runner;
	}
	return 'npm run';
}

/** The project's own package.json scripts. Never a guessed command. */
function readScripts(projectRoot: string): Record<string, string> {
	try {
		const raw = readFileSync(resolve(projectRoot, 'package.json'), 'utf-8');
		const pkg = JSON.parse(raw) as { scripts?: unknown };
		return pkg.scripts && typeof pkg.scripts === 'object' ? (pkg.scripts as Record<string, string>) : {};
	} catch {
		return {};
	}
}

/**
 * Run every real typecheck/lint/test script this project defines (at most
 * one per kind -- the first matching name), in that order, stopping at the
 * first failure so the caller gets one actionable result instead of a wall
 * of cascading errors from a broken build. Returns [] when the project
 * defines none of these scripts at all (nothing invented to fill the gap).
 */
export async function runProjectChecks(
	projectRoot: string,
	timeoutMs = 180_000,
	journal?: AgentRunJournal,
): Promise<CheckRun[]> {
	const scripts = readScripts(projectRoot);
	if (Object.keys(scripts).length === 0) return [];
	const runner = detectRunner(projectRoot);
	const runs: CheckRun[] = [];

	for (const { kind, names } of SCRIPT_KINDS) {
		const name = names.find((candidate) => typeof scripts[candidate] === 'string');
		if (!name) continue;
		const command = `${runner} ${name}`;
		const callId = randomUUID();
		journal?.toolCalled({ id: callId, name: 'bash:execute', arguments: { command, timeout: timeoutMs } });
		journal?.toolStarted(callId);
		const outputHandler: ToolOutputHandler | undefined = journal
			? (stream, text) => journal.toolOutputDelta(callId, stream, text)
			: undefined;
		const result = await executeTool('bash:execute', { command, timeout: timeoutMs }, projectRoot, outputHandler);
		journal?.toolFinished(callId, { ...result, id: callId });
		runs.push({ kind, command, success: result.success, output: (result.success ? result.output : result.error) ?? '' });
		if (!result.success) break;
	}
	return runs;
}
