import { afterEach, describe, expect, it } from 'vitest';
import { appendTerminalOutput, clearTerminalPanel, startTerminalPanel, terminalPanelState } from '../../src/ui/screen.js';

afterEach(() => clearTerminalPanel());

const flushTerminalOutput = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('live terminal panel', () => {
	it('shows an unterminated npm confirmation prompt', async () => {
		startTerminalPanel('npx vite');
		appendTerminalOutput('Need to install the following packages:\nvite@8.3.8\nOk to proceed? (y)');
		await flushTerminalOutput();

		const output = terminalPanelState()?.lines.join('\n') ?? '';
		expect(output).toContain('Need to install the following packages:');
		expect(output).toContain('vite@8.3.8');
		expect(output).toContain('Ok to proceed? (y)');
	});

	it('renders cursor-addressed prompts from an alternate-screen terminal', async () => {
		startTerminalPanel('npm create vite');
		appendTerminalOutput('\x1b[?1049h\x1b[2J\x1b[HSelect a framework:\r\n  Vanilla\r\n  Vue\r\n❯ React');
		await flushTerminalOutput();

		const output = terminalPanelState()?.lines.join('\n') ?? '';
		expect(output).toContain('Select a framework:');
		expect(output).toContain('Vanilla');
		expect(output).toContain('React');
	});

	it('renders carriage-return progress updates instead of exposing control codes', async () => {
		startTerminalPanel('npm install');
		appendTerminalOutput('\x1b[?25l\x1b[32mDownloading\x1b[0m\r\x1b[2K\x1b[32mReady\x1b[0m\n');
		await flushTerminalOutput();

		const output = terminalPanelState()?.lines.join('\n') ?? '';
		expect(output).toContain('Ready');
		expect(output).not.toContain('\\x1b');
	});
});