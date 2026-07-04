// =============================================================================
// Terminal UI — chalk + readline implementation
// Simple, cross-platform, no native dependencies
// =============================================================================

import Chalk from 'chalk';
import { createInterface } from 'node:readline';
import type { ConversationMessage } from '../types/index.js';

// chalk TypeScript is a bit off — use cast for chainability
const c: typeof Chalk = Chalk as unknown as typeof Chalk;

// ── Output Primitives ────────────────────────────────────────────────────────

export function printWelcome(projectRoot: string): void {
  const logo = [
    '╔══════════════════════════════════════════════════════════════════════════════╗',
    '║                                                                              ║',
    '║   ██████╗ ███████╗███████╗     ██████╗██╗      ██████╗ ███████╗███████╗██████╗      ║',
    '║   ██╔══██╗██╔════╝██╔════╝    ██╔════╝██║     ██╔═══██╗██╔════╝██╔════╝██╔══██╗     ║',
    '║   ██║  ██║█████╗  █████╗      ██║     ██║     ██║   ██║███████╗█████╗  ██║  ██║     ║',
    '║   ██║  ██║██╔══╝  ██╔══╝      ██║     ██║     ██║   ██║╚════██║██╔══╝  ██║  ██║     ║',
    '║   ██████╔╝███████╗███████╗    ╚██████╗███████╗╚██████╔╝███████║███████╗██████╔╝     ║',
    '║   ╚═════╝ ╚══════╝╚══════╝     ╚═════╝╚══════╝ ╚═════╝ ╚══════╝╚══════╝╚═════╝      ║',
    '║                                                                              ║',
    '╚══════════════════════════════════════════════════════════════════════════════╝',
  ];

  console.log(
    '\n' +
      logo.map((line) => c.hex('#A855F7').bold(line)).join('\n') +
      '\n' +
      c.dim('  AI-Powered Terminal Coding Agent') +
      '\n  ' +
      c.dim('  Model:') +
      ' ' +
      c.cyan.bold('Nvidia NIM') +
      '  ' +
      c.dim('  Project:') +
      ' ' +
      c.white(projectRoot) +
      '\n\n  ' +
      c.dim('[Ctrl+C] Quit   [Ctrl+L] Clear   [Up/Down] History') +
      '\n\n' +
      c.dim('─'.repeat(80)) +
      '\n',
  );
}

export function printUserMessage(msg: ConversationMessage): void {
  const time = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false });
  console.log('\n' + c.green('[' + time + '] You'));
  console.log(c.dim('─'.repeat(80)));
  console.log(c.green(msg.content) + '\n');
}

export function printAssistantMessage(content: string): void {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log('\n' + c.hex('#A855F7')('[' + time + '] Agent-Termo'));
  console.log(c.dim('─'.repeat(80)));
  console.log(c.hex('#A855F7')(content) + '\n');
}

export function printAgentBadge(agentName: string, status: string): void {
  const color = getAgentBadgeColor(agentName);
  console.log('');
  console.log(c.hex(color)('┌─ [' + agentName + '] Active ────────────────────────────────────────────┐'));
  console.log(c.hex(color)('│ ') + status + c.hex(color)(' '.repeat(Math.max(0, 58 - status.length))) + c.hex(color)('│'));
  console.log(c.hex(color)('└─────────────────────────────────────────────────────────────────────┘'));
}

function getAgentBadgeColor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('manager')) return '#7C3AED';
  if (lower.includes('architecture') || lower.includes('stack') || lower.includes('planner')) return '#3B82F6';
  if (lower.includes('security') || lower.includes('deploy')) return '#F59E0B';
  return '#22C55E';
}

export function printToolCall(toolName: string, args: Record<string, unknown>): void {
  const argsSummary = Object.entries(args)
    .map(([k, v]) => k + '=' + JSON.stringify(v))
    .join(', ');
  const bar = '─'.repeat(56);
  console.log('');
  console.log(c.blue('┌─ Tool: ') + c.cyan(toolName) + ' ' + c.dim(bar) + ' ' + c.blue('┐'));
  console.log(c.blue('│ ') + c.dim(argsSummary.slice(0, Math.max(0, bar.length - 4))) + ' ' + c.blue('│'));
  console.log(c.blue('└─') + c.dim('─'.repeat(58)) + c.blue('┘'));
}

export function printToolResult(
  toolName: string,
  result: { success: boolean; output?: string; error?: string },
): void {
  const bar = '─'.repeat(62);
  if (result.success) {
    const output = result.output
      ? result.output.slice(0, 200) + (result.output.length > 200 ? '...' : '')
      : '(success)';
    console.log('');
    console.log(c.green('┌─ Tool: ') + c.cyan(toolName) + ' ' + c.green('Complete') + ' ' + c.dim('─'.repeat(40)) + ' ' + c.green('┐'));
    console.log(c.green('│ ') + c.green(output) + c.green(' '.repeat(Math.max(0, 64 - output.length))) + c.green('│'));
    console.log(c.green('└─') + c.dim('─'.repeat(64)) + c.green('┘'));
  } else {
    const errMsg = toolName + ': ' + (result.error?.slice(0, 200) ?? 'unknown error');
    console.log('');
    console.log(c.red('┌─ Error ') + c.dim(bar) + ' ' + c.red('┐'));
    console.log(c.red('│ ' + errMsg + ' '.repeat(Math.max(0, 66 - errMsg.length)) + c.red(' │')));
    console.log(c.red('└') + c.dim('─'.repeat(70)) + c.red('┘'));
  }
}

export function printError(message: string, hint?: string): void {
  const bar = '─'.repeat(66);
  console.log('');
  console.log(c.red('┌─ Error ') + c.dim(bar) + ' ' + c.red('┐'));
  console.log(c.red('│ ' + message + ' '.repeat(Math.max(0, 66 - message.length - 3)) + ' │'));
  if (hint) {
    console.log(c.red('│ ') + c.dim('Hint: ' + hint) + ' '.repeat(Math.max(0, 62 - hint.length)) + c.red(' │'));
  }
  console.log(c.red('└') + c.dim('─'.repeat(70)) + c.red('┘'));
}

export function printSuccess(message: string): void {
  console.log('\n' + c.green('✓') + ' ' + c.green(message) + '\n');
}

export function printInfo(message: string): void {
  console.log(c.blue('ℹ') + ' ' + c.blue(message));
}

// ── Input ────────────────────────────────────────────────────────────────────

export function createInput(): {
  question: (p: string) => Promise<string>;
  close: () => void;
} {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
    crlfDelay: Infinity,
    history: [],
  });

  const history: string[] = [];
  let historyIndex = -1;
  let currentLine = '';

  return {
    async question(_prompt: string): Promise<string> {
      return new Promise<string>((resolve) => {
        process.stdout.write('\n' + c.hex('#A855F7')('> ') + '\x1b[?25h'); // ensure cursor shown
        currentLine = '';

        const handleLine = (line: string) => {
          currentLine = line.trim();
          if (currentLine) {
            history.unshift(currentLine);
            if (history.length > 50) history.pop();
          }
          historyIndex = -1;
          rl.removeListener('line', handleLine);
          resolve(currentLine);
        };

        rl.on('line', handleLine);

        // History navigation
        rl.on('keypress', (_: unknown, key: { name?: string }) => {
          if (key?.name === 'up' && history.length > 0) {
            if (historyIndex < history.length - 1) {
              historyIndex++;
              const prev = history[historyIndex] ?? '';
              process.stdout.write('\r' + ' '.repeat(80) + '\r' + c.hex('#A855F7')('> ') + prev);
              currentLine = prev;
            }
          } else if (key?.name === 'down') {
            if (historyIndex > 0) {
              historyIndex--;
              const prev = history[historyIndex] ?? '';
              process.stdout.write('\r' + ' '.repeat(80) + '\r' + c.hex('#A855F7')('> ') + prev);
              currentLine = prev;
            } else {
              historyIndex = -1;
              process.stdout.write('\r' + ' '.repeat(80) + '\r' + c.hex('#A855F7')('> '));
              currentLine = '';
            }
          }
        });
      });
    },
    close: () => {
      rl.close();
    },
  };
}

// ── Spinner ───────────────────────────────────────────────────────────────────

let spinnerInterval: ReturnType<typeof setInterval> | null = null;
let spinnerMessage = '';

export function startSpinner(message: string): void {
  spinnerMessage = message;
  let frame = 0;
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  spinnerInterval = setInterval(() => {
    process.stdout.write('\r' + c.hex('#A855F7')(frames[frame % frames.length]) + ' ' + c.dim(message) + '... ');
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