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
});
