// =============================================================================
// Main Entry Point — New OpenCode-style Architecture
// =============================================================================

import { createSessionEngine } from './core/session.js';
import { SessionEngine } from './core/types.js';
import { createRunLoop, RunLoop } from './core/run-loop.js';
import { NimClient } from './core/llm-client.js';
import { generateRecoveryActions } from './core/verification.js';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';

// Import UI components from existing code
import {
  initScreen,
  setScreenStatus,
  printWelcome,
  printUserMessage,
  printToolCall,
  printToolResult,
  printError,
  printSuccess,
  printInfo,
  printHelp,
  setCommands,
  setAgentNames,
  setContextFiles,
  setPermissionMode,
  createInput,
  InputController,
  clearScreen,
  COMMANDS,
} from './ui/index.js';

import { ensureAgentFolder, loadProjectAgents, loadAgentCommands, AgentCommand } from './runtime/agent-folder.js';
import { initializeMcpServers, shutdownMcpServers } from './runtime/mcp.js';
import { loadAllowedCommands } from './runtime/permissions.js';
import { resolveProjectRoot } from './utils/config.js';
import { setTerminalHooks } from './tools/index.js';

// Types
type PermissionMode = 'ask' | 'files' | 'auto';

interface AppContext {
  projectRoot: string;
  sessionEngine: SessionEngine;
  runLoop: RunLoop;
  llmClient: NimClient;
  input: InputController;
  permissionMode: PermissionMode;
  allowedCommands: Set<string>;
  customAgents: any[];
  customCommands: AgentCommand[];
  activeAgentName: string;
  activeAgentPrompt: string;
  currentGoal: string;
  taskState: {
    goal: string;
    status: 'idle' | 'running' | 'interrupted';
    reason: string;
    lastActions: string[];
    completedOperations: string[];
    checkpointId?: string;
  };
  activePlan: any;
  sessionStartedAt: number;
}

// Global context
let appContext: AppContext | null = null;

function discoverProjectFiles(projectRoot: string): string[] {
  const files: string[] = [];
  const ignored = new Set(['.git', 'node_modules', '.agent-termo', 'dist', 'build', 'coverage']);
  const walk = (directory: string, depth: number): void => {
    if (depth > 4 || files.length >= 500) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else files.push(full.slice(projectRoot.length + 1));
      if (files.length >= 500) return;
    }
  };
  try { walk(projectRoot, 0); } catch { /* inaccessible directories are omitted */ }
  return files;
}

async function main(projectRoot?: string): Promise<void> {
  const root = resolve(resolveProjectRoot(projectRoot ?? process.cwd()));
  
  // Initialize project structure
  try {
    ensureAgentFolder(root);
  } catch {
    // Read-only filesystem
  }
  
  // Load configuration
  const permissionMode: PermissionMode = process.env.AGENT_TERMO_PERMISSION_MODE === 'files'
    ? 'files'
    : process.env.AGENT_TERMO_PERMISSION_MODE === 'auto' || process.env.AGENT_TERMO_AUTO_APPROVE === '1'
      ? 'auto'
      : 'ask';
  
  const allowedCommands = loadAllowedCommands(root);
  const customAgents = loadProjectAgents(root);
  const customCommands = loadAgentCommands(root);
  
  setAgentNames(customAgents.map((a) => a.name));
  setPermissionMode(permissionMode);
  
  // Discover project files for @mentions
  const contextFiles = discoverProjectFiles(root);
  setContextFiles(contextFiles);
  
  // Set up terminal hooks
  setTerminalHooks({
    onStart: (_command) => {
      // Terminal panel will be started by the run loop
    },
    onOutput: (_text) => {
      // Output will be handled by the run loop
    },
    onEnd: (_exitCode) => {
      // Terminal panel will be finished by the run loop
    },
  });
  
  // Initialize LLM client
  const llmClient = new NimClient(root);
  
  // Initialize session engine
  const sessionEngine = await createSessionEngine({
    projectRoot: root,
    model: llmClient.getModel(),
    thinkingCapacity: llmClient.getThinkingCapacity(),
    permissionMode,
    allowedCommands,
  });
  
  // Initialize run loop
  const runLoop = createRunLoop({
    sessionEngine,
    llmClient,
    maxIterations: 40,
    onStateChange: (_state) => {
      // Update UI for state changes
    },
    onToolCall: (toolCall) => {
      printToolCall(toolCall.name, toolCall.arguments);
    },
    onToolResult: (toolCall, result) => {
      printToolResult(toolCall.name, result);
    },
    onTextDelta: (text) => {
      process.stdout.write(text);
    },
  });
  
  // Set up event subscriptions for UI
  const unsubscribeEvents = sessionEngine.subscribe((_event) => {
    // Handle events for UI updates
  });
  
  // Initialize UI
  initScreen({ model: llmClient.getModel(), project: root, thinking: llmClient.getThinkingCapacity() });
  setScreenStatus({ usage: llmClient.formatUsage() });
  
  // Initialize MCP servers
  const mcpStatuses = await initializeMcpServers(root);
  for (const status of mcpStatuses) {
    if (status.connected) printSuccess(`MCP server connected: ${status.name} (${status.tools} tools)`);
    else if (status.error) printInfo(`MCP server unavailable: ${status.name} — ${status.error}`);
  }
  
  // Load existing session state
  const sessionState = sessionEngine.getState();
  let activeAgentName = sessionState.activeAgentName ?? '';
  let activeAgentPrompt = '';
  if (activeAgentName) {
    const agent = customAgents.find((a) => a.name === activeAgentName);
    if (agent) activeAgentPrompt = agent.systemPrompt;
  }
  
  let currentGoal = sessionState.currentGoal ?? '';
  let taskState = sessionState.taskState ?? {
    goal: '',
    status: 'idle' as const,
    reason: '',
    lastActions: [],
    completedOperations: [],
  };
  let activePlan = sessionState.taskPlan;
  
  const sessionStartedAt = Date.now();
  
  printWelcome(root, llmClient.getModel());
  if (sessionState.messages.some((m) => m.role !== 'system')) {
    printSuccess(`Restored session ${sessionState.id.slice(0, 8)}: ${sessionState.title}`);
    if (taskState.status === 'interrupted') printInfo('The previous task was interrupted. Type "continue" to resume it.');
  }
  
  // Create input controller
  const input = createInput();
  
  // Store context globally for command handlers
  appContext = {
    projectRoot: root,
    sessionEngine,
    runLoop,
    llmClient,
    input,
    permissionMode,
    allowedCommands,
    customAgents,
    customCommands,
    activeAgentName,
    activeAgentPrompt,
    currentGoal,
    taskState,
    activePlan,
    sessionStartedAt,
  };
  
  // Set up command completion
  refreshCommandCompletion();
  
  // Main REPL loop
  await runRepl();
  
  // Cleanup
  unsubscribeEvents();
  await sessionEngine.destroy();
  await shutdownMcpServers();
}

function refreshCommandCompletion(): void {
  if (!appContext) return;
  const { customCommands } = appContext;
  setCommands([
    ...COMMANDS,
    { name: '/mcp', description: 'list MCP servers and available tools' },
    ...customCommands
      .filter((cmd) => !['skill', 'sessions', 'resume', 'fork', 'plan', 'checkpoint', 'checkpoints', 'undo', 'redo'].includes(cmd.name.toLowerCase()))
      .map((cmd) => ({ name: '/' + cmd.name, description: cmd.description || 'project command' })),
  ]);
}

async function runRepl(): Promise<void> {
  if (!appContext) return;
  
  const { input, sessionEngine, runLoop, llmClient: _llmClient, projectRoot: _projectRoot, permissionMode: _permissionMode, allowedCommands: _allowedCommands, customAgents: _customAgents, customCommands: _customCommands, sessionStartedAt } = appContext;
  
  let cleanupStarted = false;
  const cleanup = () => {
    if (cleanupStarted) return;
    cleanupStarted = true;
    input.close();
    shutdownMcpServers().finally(() => {
      process.stdout.write('\n');
      console.log(`Session complete. ${Math.round((Date.now() - sessionStartedAt) / 60000)} minutes.`);
      process.exit(0);
    });
  };
  process.on('SIGINT', cleanup);
  
  mainLoop: while (true) {
    try {
      const rawInput = await input.question('');
      let userInput = rawInput;
      if (!userInput) continue;
      
      // Handle MCP config paste
      if (userInput.includes('"mcpServers"')) {
        printUserMessage(rawInput);
        // Handle MCP import (reuse existing logic)
        continue mainLoop;
      }
      
      if (userInput === 'exit' || userInput === 'quit') {
        cleanup();
        break;
      }
      
      // Handle commands
      if (userInput.startsWith('/')) {
        const handled = await handleCommand(userInput);
        if (handled) continue mainLoop;
      }
      
      // Handle "continue"
      const isContinue = /^(?:\/)?continue\b/i.test(userInput.trim()) || userInput.trim().toLowerCase() === 'c';
      if (isContinue && appContext!.taskState.status === 'idle') {
        printInfo('Nothing to continue — no task is in progress or interrupted.');
        continue mainLoop;
      }
      
      // Run the agent
      const continuing = isContinue && appContext!.taskState.status !== 'idle';
      
      if (continuing) {
        printInfo('Resuming interrupted task from where it stopped…');
        userInput = buildContinueMessage(appContext!.taskState);
        appContext!.taskState.status = 'running';
        appContext!.taskState.reason = '';
      } else {
        appContext!.taskState.goal = userInput.replace(/\s+/g, ' ').slice(0, 300);
        appContext!.taskState.reason = '';
        appContext!.taskState.lastActions = [];
        appContext!.taskState.completedOperations = [];
        appContext!.taskState.checkpointId = undefined;
        appContext!.taskState.status = 'running';
      }
      
      appContext!.currentGoal = userInput;
      
      // Run the agent loop
      const result = await runLoop.run(userInput, continuing);
      
      if (result.interrupted) {
        // Task was paused, can be continued
        continue mainLoop;
      }
      
      if (!result.success) {
        printError(result.error ?? 'Unknown error');
        continue mainLoop;
      }
      
      // Show verification results if any
      if (result.verification && !result.verification.ok) {
        printError('Completion check: evidence does not support completion');
        for (const issue of result.verification.issues) {
          if (issue.severity === 'error') {
            printError(`  ${issue.message}`);
          } else {
            printInfo(`  ${issue.message}`);
          }
        }
        
        // Generate recovery actions
        const recoveryActions = generateRecoveryActions(result.verification, []);
        if (recoveryActions.length > 0) {
          printInfo('Suggested recovery actions:');
          for (const action of recoveryActions) {
            printInfo(`  • ${action.description}`);
          }
        }
      }
      
      // Compact conversation if needed
      const sessionState = sessionEngine.getState();
      if (sessionState.messages.length > 42) {
        // Compaction would go here
      }
      
      await sessionEngine.save();
      
    } catch (err) {
      input.close();
      printError('Session error: ' + (err instanceof Error ? err.message : String(err)));
      if (appContext!.taskState.status === 'running') {
        appContext!.taskState.status = 'interrupted';
        appContext!.taskState.reason = err instanceof Error ? err.message : String(err);
        await sessionEngine.save();
        printInfo('The task was interrupted. Type "continue" to resume from where it stopped.');
      }
    }
  }
}

async function handleCommand(input: string): Promise<boolean> {
  if (!appContext) return false;
  
  const { projectRoot, sessionEngine: _sessionEngine, llmClient, permissionMode, allowedCommands: _allowedCommands, customAgents: _customAgents, customCommands: _customCommands, input: _inputController } = appContext;
  const cmd = input.toLowerCase().trim();
  
  // Simple command handlers (reuse existing logic)
  if (cmd === '/help' || cmd === '/') {
    printHelp();
    return true;
  }
  
  if (cmd === '/clear' || cmd === '/cls') {
    clearScreen();
    printWelcome(projectRoot, llmClient.getModel());
    printSuccess('Conversation cleared.');
    return true;
  }
  
  if (cmd === '/model' || cmd.startsWith('/model ')) {
    // Handle model switching
    // const _arg = input.trim().slice('/model'.length).trim();
    // ... model switching logic
    return true;
  }
  
  if (cmd === '/thinking' || cmd.startsWith('/thinking ')) {
    // Handle thinking capacity
    return true;
  }
  
  if (cmd === '/permissions' || cmd.startsWith('/permissions ')) {
    // Handle permissions
    return true;
  }
  
  if (cmd === '/mcp') {
    // Show MCP status
    return true;
  }
  
  if (cmd === '/agents') {
    // Show agents
    return true;
  }
  
  if (cmd === '/status') {
    printInfo(`Project: ${projectRoot}`);
    printInfo(`Model: ${llmClient.getModel()}`);
    printInfo(`Thinking: ${llmClient.getThinkingCapacity()}`);
    printInfo(`Permissions: ${permissionMode.toUpperCase()}`);
    printInfo(`Token usage: ${llmClient.formatUsage()}`);
    return true;
  }
  
  if (cmd === '/terminal' || cmd.startsWith('/terminal ')) {
    // Terminal panel control
    return true;
  }
  
  if (cmd === '/exit' || cmd === '/quit') {
    return false; // Let main loop handle exit
  }
  
  if (cmd === '/continue') {
    return true; // Handled in main loop
  }
  
  // Check custom commands
  const customMatch = /^\/([A-Za-z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(input);
  if (customMatch) {
    const cmdName = customMatch[1]!.toLowerCase();
    const customCmd = _customCommands.find((c: AgentCommand) => c.name.toLowerCase() === cmdName);
    if (customCmd) {
      printUserMessage(input);
      // Execute custom command
      return true;
    }
  }
  
  printError(`Unknown command: ${cmd}`, 'Type /help for available commands.');
  return true;
}

function buildContinueMessage(taskState: { goal: string; reason: string; lastActions: string[] }): string {
  const lines = [
    'Continue the previous task from exactly where it stopped. Do NOT restart the task from the beginning and do not redo work that is already done.',
    '',
    `Original goal: ${taskState.goal}`,
    `Reason the run stopped: ${taskState.reason || 'the previous run ended before finishing'}`,
  ];
  if (taskState.lastActions.length > 0) {
    lines.push('', 'Last completed actions (oldest first):');
    for (const action of taskState.lastActions) lines.push('- ' + action);
  }
  lines.push(
    '',
    'The full conversation history above (including every tool result) is still valid. Resume from the step that follows the last completed action. If the last action was in flight when the run stopped, re-verify its result before moving on, then continue the task until it is fully complete.',
  );
  return lines.join('\n');
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { main };