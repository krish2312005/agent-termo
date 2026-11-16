// =============================================================================
// Shell selection — command execution helper
// =============================================================================

import { existsSync } from 'node:fs';

const GIT_BASH_PATHS = [
	'C:\\Program Files\\Git\\bin\\bash.exe',
	'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
];

function gitBashPath(): string | undefined {
	return GIT_BASH_PATHS.find((candidate) => existsSync(candidate));
}

/**
 * The shell used for bash:execute. On Windows, Git Bash keeps the POSIX
 * commands and `&&` chains that coding models emit working; PowerShell is the
 * fallback when Git is not installed.
 */
export function resolveShell(): string | true {
	if (process.platform !== 'win32') return true;
	return gitBashPath() ?? 'powershell.exe';
}

/** Human-readable shell name for the agent system prompt. */
export function shellDescription(): string {
	if (process.platform !== 'win32') return 'bash (POSIX syntax)';
	if (gitBashPath()) return 'Git Bash (POSIX bash syntax)';
	return 'PowerShell (Windows syntax; avoid "&&", chain commands with ";")';
}
