// =============================================================================
// Main REPL Loop
// =============================================================================

import { NimClient } from './llm/client.js';
import { TOOL_DEFINITIONS } from './llm/tools.js';
import { executeTool } from './tools/index.js';
import { loadMemory, logToTimeline } from './memory/index.js';
import { loadAllAgents } from './agents/index.js';
import { buildSystemPrompt } from './agents/index.js';
import { resolveProjectRoot } from './utils/config.js';
import {
  printWelcome,
  printUserMessage,
  printAssistantMessage,
  printToolCall,
  printToolResult,
  printError,
  printSuccess,
  printInfo,
  printHelp,
  printAgentsList,
  printMemoryFile,
  printTimelineFile,
  startSpinner,
  stopSpinner,
  createInput,
} from './ui/index.js';
import type { ConversationMessage, ToolCall } from './types/index.js';

const TOOL_KEYWORDS = [
  'build', 'create', 'write', 'edit', 'modify', 'file', 'code', 'function', 'class',
  'component', 'debug', 'fix', 'git', 'commit', 'push', 'install', 'npm', 'run',
  'bash', 'shell', 'command', 'read', 'grep', 'check', 'show', 'implement',
  'configure', 'setup', 'src', 'package', 'app', 'project', 'api', 'deploy',
  'test', 'compile', 'typescript', 'javascript', 'python', 'node', 'add', 'delete',
];

function mightNeedTools(message: string): boolean {
  const lower = message.toLowerCase();
  return TOOL_KEYWORDS.some((w) => lower.includes(w));
}

function dedup(arr: ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  return arr.filter((tc) => {
    if (seen.has(tc.id)) return false;
    seen.add(tc.id);
    return true;
  });
}

export async function runRepl(projectRoot?: string): Promise<void> {
  projectRoot = resolveProjectRoot(projectRoot);

  const memory = await loadMemory(projectRoot);
  const nimClient = new NimClient(projectRoot);
  const systemPrompt = buildSystemPrompt(memory, '', projectRoot);

  const session = { id: crypto.randomUUID(), projectRoot, startedAt: new Date() };

  const conversation: ConversationMessage[] = [
    {
      id: crypto.randomUUID(),
      role: 'system',
      content: systemPrompt,
      timestamp: new Date(),
    },
  ];

  printWelcome(projectRoot);
  console.log('Model: ' + nimClient.getModel());
  await logToTimeline(projectRoot, 'Agent-Termo session started. Model: ' + nimClient.getModel());
  await logToTimeline(projectRoot, 'Commands: /help /clear /memory /timeline /model /agents /history');

  const input = createInput();

  const cleanup = () => {
    input.close();
    process.stdout.write('\n');
    console.log('Session complete. ' + Math.round((Date.now() - session.startedAt.getTime()) / 60000) + ' minutes.');
    process.exit(0);
  };
  process.on('SIGINT', cleanup);

  mainLoop: while (true) {
    try {
      const userInput = await input.question('');
      if (!userInput) continue;
      if (userInput === 'exit' || userInput === 'quit') {
        cleanup();
        break;
      }

      // ---- Slash commands (handled locally, no LLM) ----
      if (userInput.startsWith('/')) {
        const cmd = userInput.toLowerCase().trim();

        // Exact command matches
        if (cmd === '/help' || cmd === '/') {
          printHelp();
          continue mainLoop;
        }
        if (cmd === '/clear' || cmd === '/cls') {
          conversation.length = 1;
          printSuccess('Conversation cleared.');
          continue mainLoop;
        }
        if (cmd === '/memory') {
          await printMemoryFile(projectRoot);
          continue mainLoop;
        }
        if (cmd === '/timeline' || cmd === '/tl') {
          await printTimelineFile(projectRoot);
          continue mainLoop;
        }
        if (cmd === '/model') {
          printInfo('Current model: ' + nimClient.getModel());
          continue mainLoop;
        }
        if (cmd === '/agents') {
          const agents = loadAllAgents(process.env.AGENT_TERMO_DIR || '.claude');
          printAgentsList(agents);
          continue mainLoop;
        }
        if (cmd === '/history' || cmd === '/hist') {
          printInfo('Conversation (excluding system): ' + (conversation.length - 1) + ' messages');
          continue mainLoop;
        }
        if (cmd === '/exit' || cmd === '/quit') {
          cleanup();
          break;
        }

        // Unrecognized command starting with / — show help (Claude Code behavior)
        console.log('');
        printHelp();
        console.log('Unknown command: ' + cmd);
        console.log('Type /help for available commands.\n');
        continue mainLoop;
      }

      const userMsg: ConversationMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userInput,
        timestamp: new Date(),
      };
      conversation.push(userMsg);
      printUserMessage(userMsg);

      const useTools = mightNeedTools(userInput);
      const tools = useTools ? nimClient.buildToolDefs(TOOL_DEFINITIONS) : undefined;

      let fullText = '';
      let toolCalls: ToolCall[] = [];

      if (useTools) {
        startSpinner('Working...');
        try {
          const result = await nimClient.complete(conversation, tools);
          fullText = result.content;
          toolCalls = dedup(result.toolCalls);
          process.stdout.write('\n');
          stopSpinner(true);
        } catch (err) {
          process.stdout.write('\n');
          stopSpinner(false);
          printError('LLM error: ' + (err instanceof Error ? err.message : String(err)));
          conversation.pop();
          continue mainLoop;
        }
      } else {
        startSpinner('Thinking...');
        let streamingWorked = false;
        try {
          const gen = nimClient.streamComplete(conversation, undefined, (text: string) => {
            process.stdout.write(text);
            streamingWorked = true;
          });
          for await (const result of gen) {
            fullText = result.content;
          }
          process.stdout.write('\n');
          stopSpinner(streamingWorked ? true : undefined);
        } catch {
          process.stdout.write('\n');
          stopSpinner(false);
          startSpinner('Retrying...');
          try {
            const result = await nimClient.complete(conversation, undefined);
            process.stdout.write('\n');
            stopSpinner(true);
            fullText = result.content || fullText;
          } catch (err2) {
            process.stdout.write('\n');
            stopSpinner(false);
            printError('LLM error: ' + (err2 instanceof Error ? err2.message : String(err2)));
            conversation.pop();
            continue mainLoop;
          }
        }
      }

      const cleanText = (fullText ?? '').trim().replace(/^null$/, '').trim();
      if (cleanText) {
        conversation.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: cleanText,
          timestamp: new Date(),
        });
      }

      toolCalls = dedup(toolCalls);
      for (const tc of toolCalls) {
        printToolCall(tc.name, tc.arguments);
        startSpinner('Running ' + tc.name);
        const result = await executeTool(tc.name, tc.arguments, projectRoot as string);
        stopSpinner(result.success);
        printToolResult(tc.name, result);
        conversation.push({
          id: crypto.randomUUID(),
          role: 'tool',
          content: (result.success ? 'Result: ' : 'Error: ') + (result.success ? result.output : result.error),
          timestamp: new Date(),
        });
        const toolStatus3 = result.success
          ? 'OK'
          : ('ERR: ' + (result.error ? result.error.slice(0, 80) : 'unknown error'));
        await logToTimeline(projectRoot, 'Tool: ' + tc.name + ' -- ' + toolStatus3);
      }

      if (toolCalls.length === 0 && cleanText && cleanText !== 'null') {
        printAssistantMessage(cleanText);
      }

      if (conversation.length > 42) {
        conversation.splice(1, conversation.length - 42);
      }
    } catch (err) {
      stopSpinner(false);
      printError('Session error: ' + (err instanceof Error ? err.message : String(err)));
    }
  }
}
