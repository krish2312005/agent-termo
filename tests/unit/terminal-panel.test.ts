import { afterEach, describe, expect, it } from 'vitest';
import { appendTerminalOutput, clearTerminalPanel, scrollTerminalPanel, startTerminalPanel, terminalPanelState, terminalPanelVisible, terminalPanelWindow } from '../../src/ui/screen.js';

afterEach(() => clearTerminalPanel());

const flushTerminalOutput = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('live terminal panel', () => {
	it('loads the headless terminal implementation and shows an unterminated npm prompt', async () => {
		startTerminalPanel('npx vite');
		appendTerminalOutput('Need to install the following packages:\nvite@8.3.8\nOk to proceed? (y)');
		await flushTerminalOutput();

		const output = terminalPanelState()?.lines.join('\n') ?? '';
		expect(output).toContain('Need to install the following packages:');
		expect(output).toContain('vite@8.3.8');
		expect(output).toContain('Ok to proceed? (y)');
	});

	it('opens a large terminal workspace immediately when a command starts', () => {
		startTerminalPanel('npm create vite');
		const state = terminalPanelState();
		expect(terminalPanelVisible()).toBe(true);
		expect(state?.viewportRows).toBeGreaterThan(0);
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

	it('scrolls the expanded terminal viewport through the full buffer', async () => {
		startTerminalPanel('npm create vite');
		const rows = Array.from({ length: 200 }, (_, index) => `Row ${index + 1}`);
		appendTerminalOutput(rows.map((row) => row + '\r\n').join(''));
		await flushTerminalOutput();

		const initial = terminalPanelState();
		const viewportRows = initial?.viewportRows ?? 0;
		expect(initial?.lines).toHaveLength(rows.length);
		expect(viewportRows).toBeGreaterThan(0);
		expect(terminalPanelWindow(initial?.lines ?? [], 0, viewportRows)).toEqual(rows.slice(-viewportRows));

		for (let page = 0; page < rows.length; page++) scrollTerminalPanel('up');
		const older = terminalPanelState();
		expect(older?.scrollOffset).toBe(rows.length - viewportRows);
		expect(terminalPanelWindow(older?.lines ?? [], older?.scrollOffset ?? 0, viewportRows)).toEqual(rows.slice(0, viewportRows));

		scrollTerminalPanel('down');
		expect(terminalPanelState()?.scrollOffset).toBe(Math.max(0, rows.length - viewportRows * 2));
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