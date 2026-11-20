import { afterEach, describe, expect, it } from 'vitest';
import { appendTerminalOutput, clearTerminalPanel, closeTerminalOutputViewer, finishTerminalPanel, handleTerminalMouseWheel, handleTerminalPanelClick, handleTerminalPanelKey, openTerminalOutputViewer, startTerminalPanel, terminalPanelOutputBounds, terminalPanelState, terminalPanelPreview, terminalPanelVisible, terminalPanelWindow, toggleTerminalPanel } from '../../src/ui/screen.js';

afterEach(() => {
	closeTerminalOutputViewer();
	clearTerminalPanel();
});

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

	it('keeps a compact terminal preview at a fixed height before and after command completion', async () => {
		startTerminalPanel('node output');
		const running = terminalPanelState();
		expect(terminalPanelVisible()).toBe(true);
		expect(running?.panelRows).toBe(10);
		expect(running?.viewportRows).toBe(6);

		const lines = Array.from({ length: 150 }, (_, index) => 'Output ' + (index + 1));
		appendTerminalOutput(lines.map((row) => row + '\r\n').join(''));
		await flushTerminalOutput();
		finishTerminalPanel(0);
		await flushTerminalOutput();

		const completed = terminalPanelState();
		expect(completed?.panelRows).toBe(running?.panelRows);
		expect(completed?.viewportRows).toBe(7);
		expect(terminalPanelPreview(completed?.lines ?? [], 7)).toEqual([
			'(144 earlier lines)',
			...lines.slice(-6),
		]);
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

	it('opens the full output viewer from the compact card and closes back to chat', async () => {
		startTerminalPanel('node output');
		const lines = Array.from({ length: 200 }, (_, index) => 'Row ' + (index + 1));
		appendTerminalOutput(lines.map((row) => row + '\r\n').join(''));
		await flushTerminalOutput();
		finishTerminalPanel(0);
		await flushTerminalOutput();

		const bounds = terminalPanelOutputBounds();
		expect(bounds).not.toBeNull();
		expect(handleTerminalPanelClick(bounds!.left + 1, bounds!.top)).toBe(true);
		expect(terminalPanelState()?.viewerOpen).toBe(true);
		expect(terminalPanelState()?.viewportRows).toBeGreaterThan(7);

		expect(handleTerminalPanelKey('pageup')).toBe(true);
		expect(terminalPanelState()?.scrollOffset).toBeGreaterThan(0);
		expect(handleTerminalPanelKey('end')).toBe(true);
		expect(terminalPanelState()?.scrollOffset).toBe(0);

		closeTerminalOutputViewer();
		expect(terminalPanelState()?.viewerOpen).toBe(false);
	});

	it('scrolls the expanded viewer with the mouse wheel, not the compact preview', async () => {
		startTerminalPanel('node output');
		appendTerminalOutput(Array.from({ length: 100 }, (_, index) => 'Output ' + (index + 1) + '\r\n').join(''));
		await flushTerminalOutput();
		finishTerminalPanel(0);
		await flushTerminalOutput();

		expect(handleTerminalMouseWheel('up', 10, 2)).toBe(false);
		expect(openTerminalOutputViewer()).toBe(true);
		expect(handleTerminalMouseWheel('up', 10, 2)).toBe(true);
		expect(terminalPanelState()?.scrollOffset).toBe(3);
		expect(handleTerminalMouseWheel('down', 10, 2)).toBe(true);
		expect(terminalPanelState()?.scrollOffset).toBe(0);
	});
	it('re-enables terminal mouse scrolling when new output reopens a hidden panel', async () => {
		startTerminalPanel('node output');
		expect(terminalPanelVisible()).toBe(true);
		toggleTerminalPanel();
		expect(terminalPanelVisible()).toBe(false);
		appendTerminalOutput('new output\r\n');
		await flushTerminalOutput();
		expect(terminalPanelVisible()).toBe(true);
	});

	it('does not scroll the compact preview; wheel scrolling belongs to the expanded viewer', async () => {
		startTerminalPanel('node output');
		appendTerminalOutput(Array.from({ length: 100 }, (_, index) => 'Output ' + (index + 1) + '\r\n').join(''));
		await flushTerminalOutput();
		finishTerminalPanel(0);
		await flushTerminalOutput();

		expect(handleTerminalMouseWheel('up', 10, 2)).toBe(false);
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

	it('supports keyboard scrolling after the command and agent turn finish', async () => {
		startTerminalPanel('npm create vite');
		const rows = Array.from({ length: 100 }, (_, index) => 'History ' + (index + 1));
		appendTerminalOutput(rows.map((row) => row + '\r\n').join(''));
		await flushTerminalOutput();
		finishTerminalPanel(0);
		await flushTerminalOutput();

		expect(openTerminalOutputViewer()).toBe(true);
		expect(handleTerminalPanelKey('pagedown')).toBe(true);
		expect(terminalPanelState()?.scrollOffset).toBe(0);
		expect(handleTerminalPanelKey('escape')).toBe(true);
		expect(terminalPanelState()?.viewerOpen).toBe(false);
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