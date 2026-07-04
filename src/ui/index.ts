// =============================================================================
// Terminal UI — chalk + readline implementation
// Simple, cross-platform, no native dependencies
// =============================================================================

import Chalk from 'chalk';
import { createInterface } from 'node:readline';
import { loadMemory, loadTimeline } from '../memory/index.js';
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
  console.log(c.dim('   AI-Powered Terminal Coding Agent'));
  console.log(c.dim('   Model: ') + c.cyan.bold('Nvidia NIM (OpenAI-compatible)'));
  console.log(c.dim('   Project: ') + c.white(projectRoot));
  console.log('');
  console.log(c.dim('   Commands: /help  /clear  /memory  /timeline  /model  /agents'));
  console.log(c.dim('            /history  /exit  /quit'));
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
  const bar = '-'.repeat(56);
  console.log('');
  console.log(c.blue('[Tool] ') + c.cyan(toolName) + ' ' + c.dim(bar));
  const truncated = argsSummary.slice(0, Math.max(0, bar.length - 4));
  if (truncated) {
    console.log(c.dim(' ' + truncated));
  }
}

export function printToolResult(
  toolName: string,
  result: { success: boolean; output?: string; error?: string },
): void {
  if (result.success) {
    const output = result.output
      ? result.output.slice(0, 200) + (result.output.length > 200 ? '...' : '')
      : '(success)';
    console.log('');
    console.log(c.green('[Done] ') + c.cyan(toolName) + ' ' + c.green('OK') + ' ' + c.dim('-'.repeat(40)));
    const shortened = output.length > 60 ? output.slice(0, 60) + '...' : output;
    console.log(c.green(' ' + shortened));
  } else {
    console.log('');
    const errMsg = toolName + ': ' + (result.error?.slice(0, 200) ?? 'unknown error');
    console.log(c.red('[Error] ') + c.red(errMsg));
  }
}

// =============================================================================
// STATUS MESSAGES
// =============================================================================

export function printError(message: string, hint?: string): void {
  console.log('');
  console.log(c.red('[Error] ' + message));
  if (hint) {
    console.log(c.dim(' Hint: ' + hint));
  }
}

export function printSuccess(message: string): void {
  console.log('\n' + c.green('Done: ' + message) + '\n');
}

export function printInfo(message: string): void {
  console.log(c.blue('[Info] ') + message);
}

// =============================================================================
// MEMORY + TIMELINE DISPLAY (for /memory and /timeline commands)
// =============================================================================

function clearCurrentLine(): void {
  process.stdout.write('\x1b[2K');
}

export async function printMemoryFile(projectRoot: string): Promise<void> {
  const mem = await loadMemory(projectRoot);
  if (!mem) {
    process.stdout.write('\n');
    clearCurrentLine();
    process.stdout.write(c.blue('[Info] ') + 'Memory file is empty or does not exist yet.\n');
    return;
  }
  // Clear the readline prompt line so output is clean
  process.stdout.write('\n');
  clearCurrentLine();
  process.stdout.write(c.bold('=== MEMORY.md ===') + '\n');
  process.stdout.write(c.dim('-'.repeat(80)) + '\n');
  process.stdout.write(mem + '\n');
  process.stdout.write(c.dim('-'.repeat(80)) + '\n\n');
}

export async function printTimelineFile(projectRoot: string): Promise<void> {
  const tl = await loadTimeline(projectRoot);
  const trimmed = tl.trim();

  // Check if file has real content beyond the template header
  const hasRealContent = trimmed.includes('## [') || trimmed.includes('### Phase') || trimmed.includes('- [20');

  if (!tl || !hasRealContent) {
    process.stdout.write('\n');
    clearCurrentLine();
    process.stdout.write(c.blue('[Info] ') + 'Timeline is empty or does not exist yet.\n');
    return;
  }

  const lines = tl.split('\n');
  const totalLines = lines.length;
  const recentCount = Math.min(40, totalLines);
  const recent = lines.slice(-recentCount).join('\n');

  // Clear the readline prompt line so output is clean
  process.stdout.write('\n');
  clearCurrentLine();
  process.stdout.write(c.bold('=== TIMELINE.md (recent entries) ===') + '\n');
  process.stdout.write(c.dim('-'.repeat(80)) + '\n');
  process.stdout.write(recent + '\n');
  process.stdout.write(c.dim('-'.repeat(80)) + '\n');

  if (totalLines > recentCount) {
    process.stdout.write(c.dim('... (' + (totalLines - recentCount) + ' earlier entries hidden)') + '\n');
  }
  process.stdout.write('\n');
}

// =============================================================================
// HELP DISPLAY (for /help, /, and invalid commands)
// =============================================================================

export function printHelp(): void {
  process.stdout.write('\n' + c.bold('Agent-Termo ') + c.dim('— available commands') + '\n');
  process.stdout.write(c.dim('-'.repeat(80)) + '\n');
  const rows: Array<[string, string, string]> = [
    ['/help', '', 'Show this help message and all commands'],
    ['/clear', '/cls', 'Clear the conversation history'],
    ['/memory', '', 'View project memory (docs/MEMORY.md)'],
    ['/timeline', '/tl', 'View recent activity (docs/TIMELINE.md)'],
    ['/model', '', 'Show current AI model'],
    ['/agents', '', 'List all available agents'],
    ['/history', '/hist', 'Show conversation message count'],
    ['/exit', '/quit', 'Exit Agent-Termo'],
  ];
  for (const [cmd, alias, desc] of rows) {
    const aliases = alias ? c.dim(' /' + alias) : '';
    process.stdout.write(' ' + c.cyan(cmd + aliases).padEnd(14) + '  ' + c.dim(desc) + '\n');
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
// INPUT (readline with history)
// =============================================================================

export function createInput(): {
  question: (p: string) => Promise<string>;
  close: () => void;
  showPrompt: () => void;
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

  return {
    async question(_prompt: string): Promise<string> {
      return new Promise<string>((resolve) => {
        process.stdout.write('\n' + c.magenta('> ') + '\x1b[?25h');
        let currentLine = '';

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

        rl.on('keypress', (_: unknown, key: { name?: string } | null) => {
          if (key?.name === 'up' && history.length > 0) {
            if (historyIndex < history.length - 1) {
              historyIndex++;
              const prev = history[historyIndex] ?? '';
              process.stdout.write('\r' + ' '.repeat(80) + '\r' + c.magenta('> ') + prev);
              currentLine = prev;
            }
          } else if (key?.name === 'down') {
            if (historyIndex > 0) {
              historyIndex--;
              const prev = history[historyIndex] ?? '';
              process.stdout.write('\r' + ' '.repeat(80) + '\r' + c.magenta('> ') + prev);
              currentLine = prev;
            } else {
              historyIndex = -1;
              process.stdout.write('\r' + ' '.repeat(80) + '\r' + c.magenta('> '));
              currentLine = '';
            }
          }
        });
      });
    },
    showPrompt() {
      process.stdout.write(c.magenta('> '));
    },
    close: () => {
      rl.close();
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
