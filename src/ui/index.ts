// =============================================================================
// Terminal UI — chalk-based, with slash-command autocomplete
// =============================================================================

import Chalk from 'chalk';
import { loadAgentTermoMemory, loadAgentTermoTimeline } from '../memory/index.js';
import type { ConversationMessage } from '../types/index.js';

const c: typeof Chalk = Chalk as unknown as typeof Chalk;

// =============================================================================
// WELCOME BANNER
// =============================================================================

export function printWelcome(projectRoot: string): void {
 const BAR = '===================================================';
 console.log('');
 console.log(c.magenta.bold(BAR));
 console.log(c.magenta.bold(' AGENT-TERMO'));
 console.log(c.magenta.bold(BAR));
 console.log('');
 console.log(c.dim(' AI-Powered Terminal Coding Agent'));
 console.log(c.dim(' Model: ') + c.cyan.bold('Nvidia NIM (OpenAI-compatible)'));
 console.log(c.dim(' Project: ') + c.white(projectRoot));
 console.log('');
 console.log(c.dim(' Commands: /help /clear /memory /timeline /model /agents'));
 console.log(c.dim(' /history /exit /quit'));
 console.log('');
 console.log(c.dim('-'.repeat(80)));
 console.log('');
}

// =============================================================================
// MESSAGE DISPLAY
// =============================================================================

export function printUserMessage(msg: ConversationMessage): void {
 const time = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false });
 console.log('\n' + c.green('[' + time + '] You'));
 console.log(c.dim('-'.repeat(80)));
 console.log(c.green(msg.content) + '\n');
}

export function printAssistantMessage(content: string): void {
 const time = new Date().toLocaleTimeString('en-US', { hour12: false });
 console.log('\n' + c.magenta('[' + time + '] Agent-Termo'));
 console.log(c.dim('-'.repeat(80)));
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
 process.stdout.write(c.dim('-'.repeat(80)) + '\n');
 process.stdout.write(mem + '\n');
 process.stdout.write(c.dim('-'.repeat(80)) + '\n\n');
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
 process.stdout.write(c.dim('-'.repeat(80)) + '\n');
 process.stdout.write(recent + '\n');
 process.stdout.write(c.dim('-'.repeat(80)) + '\n');
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
 process.stdout.write(c.dim('-'.repeat(80)) + '\n');
 const rows: Array<[string, string, string]> = [
   ['/help', '', 'Show this help message and all commands'],
   ['/clear', '/cls', 'Clear the conversation history and screen'],
   ['/memory', '', 'View Agent-Termo memory (~/.agent-termo/memory.md)'],
   ['/timeline', '/tl', 'View recent activity (~/.agent-termo/timeline.md)'],
   ['/model', '', 'Show current AI model'],
   ['/agents', '', 'List all available agents'],
   ['/history', '/hist', 'Show conversation message count'],
   ['/exit', '/quit', 'Exit Agent-Termo'],
 ];
 for (const [cmd, alias, desc] of rows) {
   const aliases = alias ? c.dim(' /' + alias) : '';
   process.stdout.write(' ' + c.cyan(cmd + aliases).padEnd(14) + ' ' + c.dim(desc) + '\n');
 }
 process.stdout.write(c.dim('-'.repeat(80)) + '\n\n');
}

export function printAgentsList(agents: Array<{ name: string; description: string }>): void {
 process.stdout.write('\n' + c.bold('Available Agents:') + '\n');
 process.stdout.write(c.dim('-'.repeat(80)) + '\n');
 for (const a of agents) {
   const short = a.description.length > 50 ? a.description.slice(0, 50) + '...' : a.description;
   process.stdout.write(' ' + c.cyan(a.name.padEnd(28)) + ' ' + c.dim(short) + '\n');
 }
 process.stdout.write(c.dim('-'.repeat(80)) + '\n\n');
}

// =============================================================================
// SLASH-COMMAND AUTOCOMPLETE DATA
// =============================================================================

const SLASH_COMMANDS: Array<{ cmd: string; aliases: string[]; description: string }> = [
 { cmd: '/help',    aliases: [],          description: 'Show this help message and all commands' },
 { cmd: '/clear',   aliases: ['cls'],     description: 'Clear the conversation history and screen' },
 { cmd: '/memory',  aliases: [],          description: 'View Agent-Termo memory' },
 { cmd: '/timeline',aliases: ['tl'],      description: 'View recent activity' },
 { cmd: '/model',   aliases: [],          description: 'Show current AI model' },
 { cmd: '/agents',  aliases: [],          description: 'List all available agents' },
 { cmd: '/history', aliases: ['hist'],    description: 'Show conversation message count' },
 { cmd: '/exit',    aliases: ['quit'],    description: 'Exit Agent-Termo' },
];

function filterCommands(
 query: string,
): Array<{ cmd: string; description: string; isExact: boolean }> {
 if (!query.startsWith('/')) return [];
 const lower = query.toLowerCase();
 return SLASH_COMMANDS
   .filter(({ cmd, aliases }) => {
     if (cmd === lower) return true;
     if (lower.startsWith(cmd + '/')) return false;
     if (cmd.startsWith(lower)) return true;       // <-- prefix match (was backwards)
     return aliases.some((a) => lower.startsWith('/' + a));
   })
   .map(({ cmd, description }) => ({ cmd, description, isExact: lower === cmd }));
}

class InputState {
 line = '';
 cursor = 0;
 histIdx = -1;
 ddVisible = false;
 ddSelected = 0;
 history: string[] = [];
 constructor() { this.history = []; }
}

// =============================================================================
// RAW-MODE INPUT — slash-command autocomplete on a single line
// =============================================================================

export function createInput(): {
 question: (prompt: string) => Promise<string>;
 close: () => void;
 showPrompt: () => void;
} {
 let closeFn: (() => void) | null = null;

 const DDH = 9; // dropdown max visible rows

 return {
   async question(_prompt: string): Promise<string> {
     return new Promise<string>((resolve) => {
       process.stdin.setRawMode(true);
       process.stdin.resume();
       process.stdin.setEncoding('utf8');

       const state = new InputState();

       function finalize(l: string): void {
         if (l.trim()) {
           state.history.unshift(l);
           if (state.history.length > 50) state.history.pop();
         }
         state.histIdx = -1;
         process.stdin.setRawMode(false);
         process.stdin.pause();
       }

       closeFn = (): void => {
         process.stdin.setRawMode(false);
         process.stdin.pause();
         try { process.stdin.removeListener('data', onData); } catch {}
         process.stdout.write('\n');
       };

       // Show the input prompt (no leading newline — caller already printed a blank line)
       process.stdout.write(c.magenta('> ') + '\x1b[?25h');

       function onData(key: string): void {
         const keyName = getKeyName(key);
         const items = filterCommands(state.line);

         // ── Dropdown active ──────────────────────────────────
         if (state.ddVisible) {
           if (keyName === 'escape') {
             // Dismiss dropdown: move cursor back down, clear line, redraw prompt
             state.line = '';
             state.cursor = 0;
             state.ddVisible = false;
             process.stdout.write('\x1b[' + DDH + 'B\x1b[2K\r' + c.magenta('> '));
             return;
           }
           if (keyName === 'return' || keyName === 'enter') {
             finalize(state.line);
             if (items.length > 0) {
               const sel = items[state.ddSelected]!;
               const finalLine = sel.isExact ? sel.cmd : sel.cmd + ' ';
               // Clear dropdown, write command on the same line as prompt
               process.stdout.write('\x1b[' + Math.min(items.length, DDH - 1) + 'B\x1b[2K');
               process.stdout.write('\r> ' + finalLine + '\n');
               resolve(finalLine);
             } else {
               process.stdout.write('\x1b[' + Math.min(items.length, DDH - 1) + 'B\x1b[2K\r> ' + state.line + '\n');
               resolve(state.line);
             }
             return;
           }
           if (keyName === 'up') {
             state.ddSelected = Math.max(0, Math.min(items.length - 1, state.ddSelected - 1));
             drawDropdown(items);
             return;
           }
           if (keyName === 'down') {
             state.ddSelected = Math.max(0, Math.min(items.length - 1, state.ddSelected + 1));
             drawDropdown(items);
             return;
           }
           if (keyName === 'tab') {
             if (items.length > 0) {
               const sel = items[state.ddSelected]!;
               state.line = sel.cmd;
               state.cursor = sel.cmd.length;
               state.ddVisible = false;
               const rows = Math.min(items.length, DDH - 1);
               process.stdout.write('\x1b[' + rows + 'B\x1b[2K\r' + c.magenta('> ') + state.line);
             }
             return;
           }
         }

         // ── Normal key handling ──────────────────────────────
         if (keyName === 'ctrl+c') {
           finalize(state.line);
           process.stdout.write('\r' + c.magenta('> ') + state.line + '\n');
           resolve(state.line);
           process.stdin.setRawMode(false);
           process.stdin.pause();
           process.exit(0);
           return;
         }

         if (keyName === 'escape') return; // stray ESC, ignore

         if (keyName === 'return' || keyName === 'enter') {
           finalize(state.line);
           process.stdout.write('\r> ' + state.line + '\n');
           resolve(state.line);
           return;
         }

         if (keyName === 'backspace') {
           if (state.cursor > 0) {
             state.line = state.line.slice(0, state.cursor - 1) + state.line.slice(state.cursor);
             state.cursor = Math.max(0, state.cursor - 1);
             drawInput();
             if (state.ddVisible) drawDropdown(filterCommands(state.line));
           }
           return;
         }

         if (keyName === 'left') {
           if (state.cursor > 0) {
             state.cursor--;
             process.stdout.write('\r> ' + state.line);
           }
           return;
         }

         if (keyName === 'right') {
           if (state.cursor < state.line.length) {
             state.cursor++;
             process.stdout.write('\r> ' + state.line);
           }
           return;
         }

         if (keyName === 'up') {
           if (!state.ddVisible && state.history.length > 0) {
             state.histIdx = Math.min(state.histIdx + 1, state.history.length - 1);
             state.line = state.history[state.histIdx] ?? '';
             state.cursor = state.line.length;
             process.stdout.write('\r> ' + state.line);
           }
           return;
         }

         if (keyName === 'down') {
           if (!state.ddVisible) {
             if (state.histIdx > 0) {
               state.histIdx--;
               state.line = state.history[state.histIdx] ?? '';
             } else {
               state.histIdx = -1;
               state.line = '';
             }
             state.cursor = state.line.length;
             process.stdout.write('\r> ' + state.line);
           }
           return;
         }

         if (keyName === 'tab') {
           if (state.ddVisible) {
             const cmds = filterCommands(state.line);
             if (cmds.length > 0) {
               const sel = cmds[state.ddSelected]!;
               state.line = sel.cmd;
               state.cursor = sel.cmd.length;
               state.ddVisible = false;
               const rows = Math.min(cmds.length, DDH - 1);
               process.stdout.write('\x1b[' + rows + 'B\x1b[2K\r' + c.magenta('> ') + state.line);
             }
           }
           return;
         }

         // ── Printable characters ─────────────────────────────
         if (key.length === 1) {
           const ch = key;
           if (ch.charCodeAt(0) < 0x20) return;
           state.line = state.line.slice(0, state.cursor) + ch + state.line.slice(state.cursor);
           state.cursor++;
           drawInput();
           const cmds = filterCommands(state.line);
           if (cmds.length > 0) {
             state.ddVisible = true;
             state.ddSelected = Math.min(state.ddSelected, cmds.length - 1);
             drawDropdown(cmds);
           } else {
             state.ddVisible = false;
           }
         }
       }

       function drawInput(): void {
         process.stdout.write('\x1b[2K\r' + c.magenta('> ') + state.line);
       }

       function drawDropdown(items: Array<{ cmd: string; description: string; isExact: boolean }>): void {
         if (!state.ddVisible || items.length === 0) return;
         const sel = Math.min(state.ddSelected, items.length - 1);
         const start = Math.max(0, sel - Math.floor((DDH - 1) / 2));
         const visible = items.slice(start, start + DDH - 1);

         // Move cursor up (dropdown rows + 1 input line)
         process.stdout.write('\x1b[' + visible.length + 'A');

         for (let i = 0; i < visible.length; i++) {
           const item = visible[i]!;
           const active = i === sel - start;
           process.stdout.write('\x1b[2K');
           if (active) {
             process.stdout.write(c.bgWhite.black(' ') + c.bgWhite.black(item.cmd) + ' ' + c.bgWhite.black(item.description));
           } else {
             process.stdout.write(' ' + c.cyan(item.cmd) + ' ' + c.dim(item.description));
           }
         }

         // Move cursor back down + redraw input line
         process.stdout.write('\x1b[' + visible.length + 'B\x1b[2K\r' + c.magenta('> ') + state.line);
       }

       process.stdin.on('data', onData);
     });
   },
   close(): void { if (closeFn) closeFn(); },
   showPrompt(): void { process.stdout.write(c.magenta('> ')); },
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
