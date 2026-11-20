import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeTool, setTerminalHooks, writeTerminalInput } from '../../src/tools/index.js';

describe('interactive bash stdin', () => {
	let projectRoot = '';

	afterEach(() => {
		if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
		projectRoot = '';
	});

	it('runs commands in a TTY and forwards a response to the child', async () => {
		projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-pty-'));
		const script = "process.stdout.write('TERMO_READY:'+process.stdin.isTTY+':'+process.stdout.isTTY);process.stdin.once('data',data=>process.stdout.write('TERMO_RECEIVED:'+data.toString().trim()))";
		const command = JSON.stringify(process.execPath) + ' -e ' + JSON.stringify(script);
		let sent = false;
		let observed = '';
		let terminalStarted = '';
		let terminalOutput = '';
		let terminalExit: number | null | undefined;
		setTerminalHooks({
			onStart: (command) => { terminalStarted = command; },
			onOutput: (chunk) => { terminalOutput += chunk; },
			onEnd: (code) => { terminalExit = code; },
		});

		const result = await executeTool('bash:execute', { command, timeout: 5000 }, projectRoot, (_stream, chunk) => {
			observed += chunk;
			if (!sent && observed.includes('TERMO_READY:true:true')) {
				sent = writeTerminalInput('y\r');
			}
		});

		expect(sent).toBe(true);
		expect(result.success).toBe(true);
		expect(result.output).toContain('TERMO_READY:true:true');
		expect(result.output).toContain('TERMO_RECEIVED:y');
		expect(terminalStarted).toBe(command);
		expect(terminalOutput).toContain('TERMO_READY:true:true');
		expect(terminalExit).toBe(0);
		setTerminalHooks({});
	});
});
