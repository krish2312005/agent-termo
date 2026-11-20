import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { printToolCall } from '../../src/ui/index.js';

function captureToolCall(args: Record<string, unknown>): string {
	const writes: string[] = [];
	const spy = vi.spyOn(process.stdout, 'write');
	spy.mockImplementation(((chunk: string | Uint8Array) => {
		writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
		return true;
	}) as typeof process.stdout.write);
	try {
		printToolCall('bash:execute', args);
	} finally {
		spy.mockRestore();
	}
	return writes.join('');
}

describe('bash tool-call display', () => {
	it('prints multiline commands verbatim, including quotes, pipes, redirects, and whitespace', () => {
		const command = `cd "test folder" && printf 'hello | world' > "output file.txt"
node -e "console.log('two spaces')"`;
		const cwd = resolve(process.cwd(), 'test folder');
		const output = captureToolCall({ command, cwd, timeout: 120000 });

		expect(output).toContain(command);
		expect(output).toContain('Working directory:');
		expect(output).toContain(cwd);
		expect(output).toContain('Timeout: 120000ms');
	});

	it('does not truncate long commands or working directories', () => {
		const command = 'printf "long-command-marker" && '.repeat(80) + 'printf "COMMAND_END_MARKER"';
		const cwd = resolve(process.cwd(), ...Array.from({ length: 18 }, (_, index) => `deep-directory-${index}-with-a-long-name`));
		const output = captureToolCall({ command, cwd });

		expect(output).toContain(command);
		expect(output).toContain(cwd);
		expect(output).toContain('COMMAND_END_MARKER');
	});

	it('shows the active project directory when cwd is omitted', () => {
		const output = captureToolCall({ command: 'npm test' });
		expect(output).toContain('Working directory:');
		expect(output).toContain(resolve(process.cwd()));
	});
});
