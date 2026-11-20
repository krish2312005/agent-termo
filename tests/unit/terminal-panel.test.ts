import { afterEach, describe, expect, it } from 'vitest';
import { appendTerminalOutput, clearTerminalPanel, startTerminalPanel, terminalPanelState } from '../../src/ui/screen.js';

afterEach(() => clearTerminalPanel());

describe('live terminal panel', () => {
	it('exposes an unterminated npm confirmation prompt immediately', () => {
		startTerminalPanel('npx vite');
		appendTerminalOutput('Need to install the following packages:\nvite@8.3.8\nOk to proceed? (y)');

		const panel = terminalPanelState();
		expect(panel?.lines).toEqual([
			'Need to install the following packages:',
			'vite@8.3.8',
			'Ok to proceed? (y)',
		]);
	});
	it('removes ANSI terminal controls and keeps the final carriage-return update', () => {
		startTerminalPanel('npm install');
		appendTerminalOutput('\x1b[?25l\x1b[32mDownloading\x1b[0m\r\x1b[2K\x1b[32mReady\x1b[0m\n');

		expect(terminalPanelState()?.lines).toEqual(['Ready']);
	});
});
