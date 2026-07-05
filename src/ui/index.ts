// =============================================================================
// Terminal UI — chalk-based, clean CLI styling
// =============================================================================

import Chalk from 'chalk';
import { loadAgentTermoMemory, loadAgentTermoTimeline } from '../memory/index.js';
import type { ConversationMessage } from '../types/index.js';

const c: typeof Chalk = Chalk as unknown as typeof Chalk;

// =============================================================================
// WELCOME BANNER — commands shown inline, no dropdown
// =============================================================================

export function printWelcome(projectRoot: string): void {
console.log('');
console.log(c.magenta.bold('  AGENT-TERMO'));
console.log(c.dim('  AI-Powered Terminal Coding Agent'));
console.log('');
console.log(c.dim('  Model: ') + c.cyan.bold('Nvidia NIM (OpenAI-compatible)'));
console.log(c.dim('  Project: ') + c.white(projectRoot));
console.log('');
console.log(c.dim('  Commands:'));
console.log(
  '    ' +
  c.cyan('/help') +
  c.dim(' — show all commands') +
  '\n' +
  '    ' +
  c.cyan('/clear') +
  c.dim(' — clear conversation & screen') +
  '\n' +
  '    ' +
  c.cyan('/memory') +
  c.dim(' — view Agent-Termo memory') +
  '\n' +
  '    ' +
  c.cyan('/timeline') +
  c.dim(' — view recent activity') +
  '\n' +
  '    ' +
  c.cyan('/model') +
  c.dim(' — show current AI model') +
  '\n' +
  '    ' +
  c.cyan('/agents') +
  c.dim(' — list all agents') +
  '\n' +
  '    ' +
  c.cyan('/history') +
  c.dim(' — show message count') +
  '\n' +
  '    ' +
  c.cyan('/exit') +
  c.dim(' — quit'),
);
console.log('');
console.log(c.dim('  ────────────────────────────────────────────────────────────────'));
console.log('');
}

// =============================================================================
// MESSAGE DISPLAY
// =============================================================================

export function printUserMessage(msg: ConversationMessage): void {
const time = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false });
console.log('\n' + c.green('[' + time + '] You'));
console.log(c.dim('─'.repeat(80)));
console.log(c.green(msg.content) + '\n');
}

export function printAssistantMessage(content: string): void {
const time = new Date().toLocaleTimeString('en-US', { hour12: false });
console.log('\n' + c.magenta('[' + time + '] Agent-Termo'));
console.log(c.dim('─'.repeat(80)));
console.log(c.magenta(content) + '\n');
}

// =============================================================================
// TOOL CALL DISPLAY
// =============================================================================

export function printToolCall(toolName: string, args: Record<string, unknown>): void {
const argsSummary = Object.entries(args)
.map(([k, v]) => k + '=' + JSON.stringify(v))
.join(', ');
console.log('');
console.log(c.blue('[Tool] ') + c.cyan(toolName));
const truncated = argsSummary.slice(0, 200);
if (truncated) console.log(c.dim(' ' + truncated));
}

export function printToolResult(
toolName: string,
result: { success: boolean; output?: string; error?: string },
): void {
if (result.success) {
const out = result.output
? result.output.slice(0, 200) + (result.output.length > 200 ? '...' : '')
: '(success)';
console.log('');
console.log(c.green('[Done] ') + c.cyan(toolName) + ' ' + c.green('OK'));
const short = out.length > 80 ? out.slice(0, 80) + '...' : out;
console.log(c.green(' ' + short));
} else {
console.log('');
console.log(c.red('[Error] ') + c.red(toolName + ': ' + (result.error?.slice(0, 200) ?? 'unknown error')));
}
}

// =============================================================================
// STATUS MESSAGES
// =============================================================================

export function printError(message: string, hint?: string): void {
console.log('');
console.log(c.red('[Error] ' + message));
if (hint) console.log(c.dim(' Hint: ' + hint));
}

export function printSuccess(message: string): void {
console.log(c.green('Done: ' + message));
}

export function printInfo(message: string): void {
console.log(c.blue('[Info] ') + message);
}

// =============================================================================
// AGENT-TERMO MEMORY + TIMELINE DISPLAY (own files, not project docs)
// =============================================================================

function clearCurrentLine(): void {
process.stdout.write('\x1b[2K');
}

export async function printMemoryFile(): Promise<void> {
const mem = loadAgentTermoMemory();
if (!mem) {
process.stdout.write('\n');
clearCurrentLine();
process.stdout.write(c.blue('[Info] ') + 'Agent-Termo memory is empty. (Normal for new sessions.)\n');
return;
}
process.stdout.write('\n');
clearCurrentLine();
process.stdout.write(c.bold('=== AGENT-TERMO MEMORY ===') + '\n');
process.stdout.write(c.dim('─'.repeat(80)) + '\n');
process.stdout.write(mem + '\n');
process.stdout.write(c.dim('─'.repeat(80)) + '\n\n');
}

export async function printTimelineFile(): Promise<void> {
const tl = loadAgentTermoTimeline();
if (!tl || tl.trim().length === 0) {
process.stdout.write('\n');
clearCurrentLine();
process.stdout.write(c.blue('[Info] ') + 'Timeline is empty.\n');
return;
}
const lines = tl.split('\n');
const totalLines = lines.length;
const recentCount = Math.min(40, totalLines);
const recent = lines.slice(-recentCount).join('\n');
process.stdout.write('\n');
clearCurrentLine();
process.stdout.write(c.bold('=== AGENT-TERMO TIMELINE (recent entries) ===') + '\n');
process.stdout.write(c.dim('─'.repeat(80)) + '\n');
process.stdout.write(recent + '\n');
process.stdout.write(c.dim('─'.repeat(80)) + '\n');
if (totalLines > recentCount) {
process.stdout.write(c.dim('... (' + (totalLines - recentCount) + ' earlier entries hidden)') + '\n');
}
process.stdout.write('\n');
}

// =============================================================================
// HELP + AGENTS DISPLAY
// =============================================================================

export function printHelp(): void {
process.stdout.write('\n' + c.bold('Agent-Termo ') + c.dim('— available commands') + '\n');
process.stdout.write(c.dim('─'.repeat(80)) + '\n');
console.log('  ' + c.cyan('/help')   + c.dim('    show all commands'));
console.log('  ' + c.cyan('/clear')  + c.dim('    clear conversation & screen'));
console.log('  ' + c.cyan('/memory')  + c.dim('    view Agent-Termo memory'));
console.log('  ' + c.cyan('/timeline')+ c.dim('   view recent activity'));
console.log('  ' + c.cyan('/model')   + c.dim('    show current AI model'));
console.log('  ' + c.cyan('/agents')  + c.dim('    list all agents'));
console.log('  ' + c.cyan('/history') + c.dim('   show message count'));
console.log('  ' + c.cyan('/exit')    + c.dim('    quit'));
console.log('');
}

export function printAgentsList(agents: Array<{ name: string; description: string }>): void {
process.stdout.write('\n' + c.bold('Available Agents:') + '\n');
process.stdout.write(c.dim('─'.repeat(80)) + '\n');
for (const a of agents) {
const short = a.description.length > 40 ? a.description.slice(0, 40) + '...' : a.description;
process.stdout.write('  ' + c.cyan(a.name.padEnd(28)) + ' ' + c.dim(short) + '\n');
}
process.stdout.write(c.dim('─'.repeat(80)) + '\n\n');
}

// =============================================================================
// INPUT STATE + REPL LOOP
// =============================================================================

class InputState {
line = '';
cursor = 0;
histIdx = -1;
history: string[] = [];
constructor() { this.history = []; }
}

// =============================================================================
// Cursor-anchor helpers
// After multi-line command output the terminal cursor can be on any row.
// saveCursorPosition() writes \x1b[s to stamp the prompt row;
// restoreCursorPosition() writes \x1b[u before every redraw so \r
// always targets the correct line.
// =============================================================================

export function createInput(): {
question: (prompt: string) => Promise<string>;
close: () => void;
showPrompt: () => void;
} {
let closeFn: (() => void) | null = null;
let boundOnData: ((key: string) => void) | null = null;
let cursorAnchorValid = false;

function saveCursorPosition(): void {
process.stdout.write("\x1b[s");
cursorAnchorValid = true;
}

function restoreCursorPosition(): void {
if (cursorAnchorValid) process.stdout.write("\x1b[u");
}

return {
async question(_prompt: string): Promise<string> {
return new Promise<string>((resolve) => {
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
process.stdin.setMaxListeners(20);

const state: InputState = new InputState();
const inputPrompt = c.magenta("> ");

function finalize(l: string): void {
if (l.trim()) {
state.history.unshift(l);
if (state.history.length > 50) state.history.pop();
}
state.histIdx = -1;
}

closeFn = (): void => {
process.stdin.setRawMode(false);
process.stdin.pause();
finalize("");
if (boundOnData) {
process.stdin.removeListener("data", boundOnData);
boundOnData = null;
}
cursorAnchorValid = false;
};

// Ensure a fresh line, then save cursor anchor at the prompt row
process.stdout.write("\n");
process.stdout.write(inputPrompt);
saveCursorPosition();
process.stdout.write("\x1b[?25h");

function onData(key: string): void {
const keyName = getKeyName(key);

if (keyName === "ctrl+c") {
finalize(state.line);
restoreCursorPosition();
process.stdout.write("\r" + inputPrompt + state.line + "\n");
resolve(state.line);
cursorAnchorValid = false;
process.stdin.setRawMode(false);
process.stdin.pause();
process.exit(0);
return;
}

if (keyName === "return" || keyName === "enter") {
finalize(state.line);
restoreCursorPosition();
process.stdout.write("\r" + inputPrompt + state.line + "\n");
resolve(state.line);
cursorAnchorValid = false;
return;
}

if (keyName === "up") {
if (state.history.length > 0 && state.histIdx < state.history.length - 1) {
state.histIdx++;
state.line = state.history[state.histIdx] ?? "";
state.cursor = state.line.length;
restoreCursorPosition();
process.stdout.write("\x1b[2K\r" + inputPrompt + state.line);
}
return;
}

if (keyName === "down") {
if (state.histIdx > 0) {
state.histIdx--;
state.line = state.history[state.histIdx] ?? "";
} else {
state.histIdx = -1;
state.line = "";
}
state.cursor = state.line.length;
restoreCursorPosition();
process.stdout.write("\x1b[2K\r" + inputPrompt + state.line);
return;
}

if (keyName === "backspace") {
if (state.cursor > 0) {
state.line = state.line.slice(0, state.cursor - 1) + state.line.slice(state.cursor);
state.cursor = Math.max(0, state.cursor - 1);
restoreCursorPosition();
process.stdout.write("\x1b[2K\r" + inputPrompt + state.line);
}
return;
}

if (keyName === "left") {
if (state.cursor > 0) {
state.cursor--;
restoreCursorPosition();
process.stdout.write("\r" + inputPrompt + state.line);
}
return;
}
if (keyName === "right") {
if (state.cursor < state.line.length) {
state.cursor++;
restoreCursorPosition();
process.stdout.write("\r" + inputPrompt + state.line);
}
return;
}

// Printable characters
if (key.length === 1 && key.charCodeAt(0) >= 0x20) {
state.line = state.line.slice(0, state.cursor) + key + state.line.slice(state.cursor);
state.cursor++;
restoreCursorPosition();
process.stdout.write("\x1b[2K\r" + inputPrompt + state.line);
}
}

boundOnData = (key: string) => onData(key);
process.stdin.on("data", boundOnData);
});
},
close(): void {
if (closeFn) closeFn();
},
showPrompt(): void {
process.stdout.write("\n");
process.stdout.write(c.magenta("> "));
saveCursorPosition();
},
};
}

// =============================================================================
// SPINNER
// =============================================================================

let spinnerInterval: ReturnType<typeof setInterval> | null = null;
let spinnerMessage = '';

export function startSpinner(message: string): void {
spinnerMessage = message;
let frame = 0;
const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
spinnerInterval = setInterval(() => {
process.stdout.write('\r' + c.magenta(frames[frame % frames.length]) + ' ' + c.dim(message) + '... ');
frame++;
}, 80);
}

export function stopSpinner(success?: boolean): void {
if (spinnerInterval) {
clearInterval(spinnerInterval);
spinnerInterval = null;
}
if (success === true) {
process.stdout.write('\r' + c.green('✓') + ' ' + c.dim(spinnerMessage) + ' done.\n');
} else if (success === false) {
process.stdout.write('\r' + c.red('✗') + ' ' + c.dim(spinnerMessage) + ' failed.\n');
} else {
process.stdout.write('\r' + ' '.repeat(80) + '\r');
}
}

export function clearScreen(): void {
process.stdout.write('\x1b[2J\x1b[H');
}

// =============================================================================
// KEY NAME PARSER
// =============================================================================

function getKeyName(ch: string): string {
if (ch === '\r') return 'return';
if (ch === '\n') return 'enter';
if (ch === '\x03') return 'ctrl+c';
if (ch === '\x1b') return 'escape';
if (ch === '\x7f' || ch === '\b') return 'backspace';
if (ch === '\x04') return 'ctrl+d';
if (ch === '\t') return 'tab';
if (ch === '\x1b[A') return 'up';
if (ch === '\x1b[B') return 'down';
if (ch === '\x1b[C') return 'right';
if (ch === '\x1b[D') return 'left';
if (ch === '\x1b[3~') return 'delete';
if (ch === '\x1b[F') return 'end';
if (ch === '\x1b[H') return 'home';
if (ch === '\x1b[5~') return 'pageup';
if (ch === '\x1b[6~') return 'pagedown';
if (ch.startsWith('\x1b[')) return ch;
return ch.length === 1 ? ch : ch;
}
