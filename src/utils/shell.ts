// =============================================================================
// Shell selection — command execution helper
// =============================================================================

import { existsSync } from 'node:fs';

const GIT_BASH_PATHS = [
	'C:\\Program Files\\Git\\bin\\bash.exe',
	'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
];
const POSIX_BASH_PATHS = ['/bin/bash', '/usr/bin/bash', '/opt/homebrew/bin/bash'];

function gitBashPath(): string | undefined {
	return GIT_BASH_PATHS.find((candidate) => existsSync(candidate));
}

/**
 * The shell used for bash:execute. On Windows, Git Bash keeps the POSIX
 * commands and `&&` chains that coding models emit working; PowerShell is the
 * fallback when Git is not installed.
 */
export function resolveShell(): string {
	if (process.platform !== 'win32') return POSIX_BASH_PATHS.find((candidate) => existsSync(candidate)) ?? '/bin/sh';
	return gitBashPath() ?? 'powershell.exe';
}

/** Human-readable shell name for the agent system prompt. */
export function shellDescription(): string {
	if (process.platform !== 'win32') {
		return POSIX_BASH_PATHS.some((candidate) => existsSync(candidate))
			? 'Bash (POSIX syntax)'
			: 'POSIX sh (avoid Bash-only arrays, [[ ]], and process substitution)';
	}
	if (gitBashPath()) return 'Git Bash (POSIX bash syntax)';
	return 'PowerShell (Windows syntax; avoid "&&", chain commands with ";")';
}
