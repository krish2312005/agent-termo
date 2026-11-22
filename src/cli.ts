#!/usr/bin/env bun
import "@opentui/solid/preload";
// =============================================================================
// CLI Entry Point — Agent-Termo
// =============================================================================

import { Command } from 'commander';
import { runRepl } from './main.js';
import { getConfig, saveNimApiKey } from './utils/config.js';
import { ensureAgentFolder } from './runtime/agent-folder.js';
import {
  loadMcpServerConfigs,
  saveMcpServerConfig,
  removeMcpServerConfig,
  setMcpServerEnabled,
  testMcpServer,
  type McpServerConfig,
  type McpConfigScope,
} from './runtime/mcp.js';
import pkg from '../package.json' with { type: 'json' };

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
  // Load the selected project's .env before checking for the API key.
  // This matters when the global CLI is launched from a different directory.
  getConfig(project);

  // Apply CLI overrides to env before main initializes.
  if (options.apiKey) process.env.NIM_API_KEY = options.apiKey;
  if (options.model) process.env.NIM_MODEL = options.model;
	if (options.debug) process.env.LOG_LEVEL = 'debug';
	if (options.autoApprove) {
		process.env.AGENT_TERMO_PERMISSION_MODE = 'auto';
		process.env.AGENT_TERMO_AUTO_APPROVE = '1';
	}

  if (!process.env.NIM_API_KEY?.trim() && !process.env.AGENT_TERMO_API_KEY?.trim() && !process.env.OPENAI_API_KEY?.trim()) {
    const apiKey = await promptForApiKey();
    if (apiKey) {
      saveNimApiKey(apiKey);
      process.env.NIM_API_KEY = apiKey;
      console.log('NVIDIA NIM API key saved. Agent-Termo will remember it for future sessions.');
    } else {
      console.log('No API key entered. Start Agent-Termo and run /providers to configure OpenAI, Claude, OpenRouter, and other providers.');
    }
  }

  console.log(`Starting Agent-Termo in: ${project}`);
  await runRepl(project);
}

program
  .name('agent-termo')
  .description('Terminal AI coding agent with multiple model API providers')
	.version(pkg.version)
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
    const { mkdirSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const dirsToCreate = [resolve(dir, 'src')];
    for (const d of dirsToCreate) {
      mkdirSync(d, { recursive: true });
    }
		const agentFolder = ensureAgentFolder(resolve(dir));

    console.log(`\n✓ Initialized Agent-Termo in ${resolve(dir)}`);
		console.log(`  Created: docs/MEMORY.md, docs/TIMELINE.md, .agent-termo/ (agents: ${agentFolder.copiedAgents}, commands: ${agentFolder.copiedCommands})`);
    console.log('  Configure an API provider on first launch with /providers.');
  });


const mcp = program.command('mcp').description('Manage Model Context Protocol servers');

mcp.command('list')
  .description('List configured MCP servers')
  .action(() => {
    const servers = loadMcpServerConfigs(process.cwd());
    const entries = Object.entries(servers);
    if (entries.length === 0) {
      console.log('No MCP servers configured. Use "agent-termo mcp add --help" to add one.');
      return;
    }
    for (const [name, config] of entries) {
      const transport = config.url ? 'http' : 'stdio';
      console.log((config.disabled ? '[disabled] ' : '[enabled] ') + name + ' (' + transport + ')');
    }
  });

mcp.command('add <name>')
  .description('Add or update an MCP server in project or user configuration')
  .option('--command <command>', 'Command to launch a stdio MCP server')
  .option('--args <json>', 'JSON array of command arguments')
  .option('--env <json>', 'JSON object of stdio environment variables')
  .option('--cwd <directory>', 'Working directory for a stdio server')
  .option('--url <url>', 'Streamable HTTP MCP endpoint')
  .option('--headers <json>', 'JSON object of HTTP headers')
  .option('--global', 'Save to user-level configuration instead of this project')
  .action((name: string, options: {
    command?: string; args?: string; env?: string; cwd?: string;
    url?: string; headers?: string; global?: boolean;
  }) => {
    if (Boolean(options.command) === Boolean(options.url)) {
      throw new Error('Provide exactly one of --command (stdio) or --url (Streamable HTTP).');
    }
    const parseJson = <T>(value: string | undefined, label: string): T | undefined => {
      if (!value) return undefined;
      try { return JSON.parse(value) as T; }
      catch { throw new Error('Invalid JSON for ' + label + '.'); }
    };
    const args = parseJson<unknown>(options.args, '--args');
    const env = parseJson<unknown>(options.env, '--env');
    const headers = parseJson<unknown>(options.headers, '--headers');
    if (args !== undefined && (!Array.isArray(args) || !args.every((value) => typeof value === 'string'))) {
      throw new Error('--args must be a JSON array of strings.');
    }
    const isStringRecord = (value: unknown): value is Record<string, string> =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
      Object.values(value as Record<string, unknown>).every((item) => typeof item === 'string');
    if (env !== undefined && !isStringRecord(env)) throw new Error('--env must be a JSON object of strings.');
    if (headers !== undefined && !isStringRecord(headers)) throw new Error('--headers must be a JSON object of strings.');
    const config: McpServerConfig = options.url
      ? { url: options.url, headers: headers as Record<string, string> | undefined }
      : {
          command: options.command,
          args: args as string[] | undefined,
          env: env as Record<string, string> | undefined,
          cwd: options.cwd,
        };
    const scope: McpConfigScope = options.global ? 'user' : 'project';
    saveMcpServerConfig(process.cwd(), name, config, scope);
    console.log('Saved MCP server "' + name + '" to ' + scope + ' configuration.');
  });

mcp.command('remove <name>')
  .description('Remove a configured MCP server')
  .option('--global', 'Remove from user-level configuration')
  .action((name: string, options: { global?: boolean }) => {
    const scope: McpConfigScope = options.global ? 'user' : 'project';
    removeMcpServerConfig(process.cwd(), name, scope);
    console.log('Removed MCP server "' + name + '" from ' + scope + ' configuration.');
  });

for (const action of ['enable', 'disable'] as const) {
  mcp.command(action + ' <name>')
    .description((action === 'enable' ? 'Enable' : 'Disable') + ' a configured MCP server')
    .option('--global', 'Change user-level configuration')
    .action((name: string, options: { global?: boolean }) => {
      const scope: McpConfigScope = options.global ? 'user' : 'project';
      setMcpServerEnabled(process.cwd(), name, action === 'enable', scope);
      console.log((action === 'enable' ? 'Enabled ' : 'Disabled ') + 'MCP server "' + name + '".');
    });
}

mcp.command('test <name>')
  .description('Connect to an MCP server and list its tools')
  .action(async (name: string) => {
    const tools = await testMcpServer(process.cwd(), name);
    console.log('Connected to "' + name + '". Discovered ' + tools.length + ' tools:');
    for (const tool of tools) console.log('  - ' + tool);
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
