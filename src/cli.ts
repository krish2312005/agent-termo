#!/usr/bin/env node
// =============================================================================
// CLI Entry Point — Agent-Termo
// =============================================================================

import { Command } from 'commander';
import { runRepl } from './main.js';

const program = new Command();

program
  .name('agent-termo')
  .description('Terminal AI coding agent with Nvidia NIM APIs')
  .version('1.0.0')
  .argument('[project]', 'Project directory to operate in', process.cwd())
  .option('-k, --api-key <key>', 'Nvidia NIM API key')
  .option('-m, --model <model>', 'Model name to use')
  .option('--debug', 'Enable debug logging')
  .action(async (project: string, options: { apiKey?: string; model?: string; debug?: boolean }) => {
    // Apply CLI overrides to env before main initializes
    if (options.apiKey) process.env.NIM_API_KEY = options.apiKey;
    if (options.model) process.env.NIM_MODEL = options.model;
    if (options.debug) process.env.LOG_LEVEL = 'debug';

    console.log(`Starting Agent-Termo in: ${project}`);
    await runRepl(project);
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
    console.log('  Created: docs/MEMORY.md, docs/TIMELINE.md');
    console.log('  Create a .env file with your NIM_API_KEY to get started.');
  });

async function main() {
  // Check for unparsed arguments — if none, run repl mode
  const args = process.argv.slice(2);
  if (args.length === 0) {
    await runRepl(process.cwd());
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(`\nFatal error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});