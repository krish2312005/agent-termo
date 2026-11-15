#!/usr/bin/env node
// =============================================================================
// CLI Entry Point — Agent-Termo
// =============================================================================

import { Command } from 'commander';
import { runRepl } from './main.js';
import { saveNimApiKey } from './utils/config.js';
import { ensureAgentFolder } from './runtime/agent-folder.js';

const program = new Command();

async function promptForApiKey(): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;

  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error(
      'NVIDIA NIM API key is missing. Run Agent-Termo in an interactive terminal or set NIM_API_KEY before starting.',
    );
  }

  console.log('An NVIDIA NIM API key is required to start Agent-Termo.');
  console.log('Get your key at https://build.nvidia.com/');
  output.write('Enter your API key (input hidden): ');

  return new Promise((resolve, reject) => {
    let apiKey = '';
    let previousWasCarriageReturn = false;

    const restoreTerminal = () => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
    };

    const onData = (data: Buffer) => {
      for (const char of data.toString('utf-8')) {
        if (char === '\n' && previousWasCarriageReturn) {
          previousWasCarriageReturn = false;
          continue;
        }
        previousWasCarriageReturn = char === '\r';

        if (char === '\u0003' || char === '\u0004') {
          restoreTerminal();
          reject(new Error('API key setup cancelled.'));
          return;
        }

        if (char === '\r' || char === '\n') {
          if (!apiKey.trim()) {
            output.write('\nAn API key is required. Enter your API key: ');
            continue;
          }

          restoreTerminal();
          resolve(apiKey.trim());
          return;
        }

        if (char === '\u007f' || char === '\b') {
          apiKey = apiKey.slice(0, -1);
        } else if (char >= ' ') {
          apiKey += char;
        }
      }
    };

    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function startAgent(
	project: string,
	options: { apiKey?: string; model?: string; debug?: boolean; autoApprove?: boolean },
): Promise<void> {
  // Apply CLI overrides to env before main initializes.
  if (options.apiKey) process.env.NIM_API_KEY = options.apiKey;
  if (options.model) process.env.NIM_MODEL = options.model;
	if (options.debug) process.env.LOG_LEVEL = 'debug';
	if (options.autoApprove) process.env.AGENT_TERMO_AUTO_APPROVE = '1';

  if (!process.env.NIM_API_KEY?.trim()) {
    const apiKey = await promptForApiKey();
    saveNimApiKey(apiKey);
    process.env.NIM_API_KEY = apiKey;
    console.log('API key saved. Agent-Termo will remember it for future sessions.');
  }

  console.log(`Starting Agent-Termo in: ${project}`);
  await runRepl(project);
}

program
  .name('agent-termo')
  .description('Terminal AI coding agent with Nvidia NIM APIs')
	.version('1.0.7')
  .argument('[project]', 'Project directory to operate in', process.cwd())
  .option('-k, --api-key <key>', 'Nvidia NIM API key')
  .option('-m, --model <model>', 'Model name to use')
	.option('--debug', 'Enable debug logging')
	.option('-y, --yes, --auto-approve', 'Automatically apply file changes without asking')
	.action(async (project: string, options: { apiKey?: string; model?: string; debug?: boolean; autoApprove?: boolean }) => {
    await startAgent(project, options);
  });

program
  .command('init')
  .description('Initialize Agent-Termo in a project directory')
  .argument('[dir]', 'Directory to initialize', '.')
  .action(async (dir: string) => {
    const { mkdirSync, writeFileSync, existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const dirsToCreate = [resolve(dir, 'docs'), resolve(dir, '.claude', 'agents'), resolve(dir, 'src')];
    for (const d of dirsToCreate) {
      mkdirSync(d, { recursive: true });
    }
		const agentFolder = ensureAgentFolder(resolve(dir));

    // Create stub docs
    const memoryPath = resolve(dir, 'docs', 'MEMORY.md');
    if (!existsSync(memoryPath)) {
      writeFileSync(memoryPath, '# Project Memory\n\n## Project Context\n(Add project context here)\n', 'utf-8');
    }

    const timelinePath = resolve(dir, 'docs', 'TIMELINE.md');
    if (!existsSync(timelinePath)) {
      writeFileSync(
        timelinePath,
        '# Project Timeline\n\n## Initialization\n- [date] Agent-Termo initialized\n',
        'utf-8',
      );
    }

    console.log(`\n✓ Initialized Agent-Termo in ${resolve(dir)}`);
		console.log(`  Created: docs/, .agent-termo/ (agents: ${agentFolder.copiedAgents}, commands: ${agentFolder.copiedCommands})`);
    console.log('  Agent-Termo will ask for your NVIDIA NIM API key the first time you launch it.');
  });

async function main() {
  // Run REPL mode directly when no command or options are supplied.
  const args = process.argv.slice(2);
  if (args.length === 0) {
    await startAgent(process.cwd(), {});
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(`\nFatal error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
