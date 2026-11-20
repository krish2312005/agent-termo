import { afterEach, describe, expect, it } from 'vitest';
import { appendTerminalOutput, clearTerminalPanel, finishTerminalPanel, handleTerminalMouseWheel, handleTerminalPanelKey, scrollTerminalPanel, startTerminalPanel, terminalPanelOutputBounds, terminalPanelState, terminalPanelVisible, terminalPanelWindow } from '../../src/ui/screen.js';

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
	it('scrolls by mouse wheel only when the pointer is over terminal output', async () => {
		startTerminalPanel('node output');
		appendTerminalOutput(Array.from({ length: 100 }, (_, index) => \`Output \${index + 1}\r\n\`).join(''));
		await flushTerminalOutput();

		const bounds = terminalPanelOutputBounds();
		expect(bounds).not.toBeNull();
		expect(handleTerminalMouseWheel('up', bounds!.left + 1, bounds!.top)).toBe(true);
		expect(terminalPanelState()?.scrollOffset).toBe(3);
		expect(handleTerminalMouseWheel('down', bounds!.left + 1, bounds!.top)).toBe(true);
		expect(terminalPanelState()?.scrollOffset).toBe(0);
		expect(handleTerminalMouseWheel('up', bounds!.left + 1, bounds!.top - 1)).toBe(false);
		expect(terminalPanelState()?.scrollOffset).toBe(0);
	});

	it('preserves intentional blank terminal rows without shifting later output', async () => {
		startTerminalPanel('printf output');
		appendTerminalOutput('first\r\n\r\nthird\r\n');
		await flushTerminalOutput();
		expect(terminalPanelState()?.lines.slice(0, 3)).toEqual(['first', '', 'third']);
	});

	it('can hide and reopen the terminal workspace with Ctrl+O', () => {
		startTerminalPanel('npm create vite');
		expect(handleTerminalPanelKey('ctrl+o')).toBe(true);
		expect(terminalPanelVisible()).toBe(false);
		expect(handleTerminalPanelKey('ctrl+o')).toBe(true);
		expect(terminalPanelVisible()).toBe(true);
	});

	it('keeps terminal scrolling available after the command and agent turn finish', async () => {
		startTerminalPanel('npm create vite');
		const rows = Array.from({ length: 100 }, (_, index) => `History ${index + 1}`);
		appendTerminalOutput(rows.map((row) => row + '\\r\\n').join(''));
		await flushTerminalOutput();

		finishTerminalPanel(0);
		await flushTerminalOutput();

		const before = terminalPanelState();
		expect(before?.exitCode).toBe(0);
		expect(before?.scrollOffset).toBe(0);
		expect(handleTerminalPanelKey('pageup')).toBe(true);
		expect(terminalPanelState()?.scrollOffset).toBeGreaterThan(0);
		expect(handleTerminalPanelKey('pagedown')).toBe(true);
		expect(terminalPanelState()?.scrollOffset).toBe(0);
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