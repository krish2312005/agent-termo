// =============================================================================
// Main REPL Loop
// =============================================================================

import { NimClient } from './llm/client.js';
import { TOOL_DEFINITIONS } from './llm/tools.js';
import { executeTool } from './tools/index.js';
import { loadMemory, logToTimeline } from './memory/index.js';
import { buildSystemPrompt } from './agents/index.js';
import { resolveProjectRoot } from './utils/config.js';
import {
  printWelcome,
  printUserMessage,
  printAssistantMessage,
  printToolCall,
  printToolResult,
  printError,
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
    { id: crypto.randomUUID(), role: 'system', content: systemPrompt, timestamp: new Date() },
  ];

  printWelcome(projectRoot);
  console.log('Model: ' + nimClient.getModel());
  await logToTimeline(projectRoot, 'Agent-Termo session started. Model: ' + nimClient.getModel());

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
      if (userInput === 'exit' || userInput === 'quit') { cleanup(); break; }

      const userMsg: ConversationMessage = {
        id: crypto.randomUUID(), role: 'user', content: userInput, timestamp: new Date(),
      };
      conversation.push(userMsg);
      printUserMessage(userMsg);

      const useTools = mightNeedTools(userInput);
      const tools = useTools ? nimClient.buildToolDefs(TOOL_DEFINITIONS) : undefined;

      let fullText = '';
      let toolCalls: ToolCall[] = [];

      if (useTools) {
        // Coding: always non-streaming for reliability
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
        // Chat: try streaming first, fall back to non-streaming
        startSpinner('Thinking...');
        let streamingWorked = false;
        try {
          const chunks: string[] = [];
          const gen = nimClient.streamComplete(conversation, undefined, (text: string) => {
            process.stdout.write(text);
            chunks.push(text);
            streamingWorked = true;
          });
          for await (const result of gen) {
            fullText = result.content;
          }
          // Streaming handled display via callback - no manual echo needed
          process.stdout.write('\n');
          stopSpinner(streamingWorked ? true : undefined);
        } catch {
          process.stdout.write('\n');
          stopSpinner(false);
          // Retry with non-streaming
          startSpinner('Retrying...');
          try {
            const result = await nimClient.complete(conversation, undefined);
            process.stdout.write('\n');
            stopSpinner(true);
            fullText = result.content || fullText;
          } catch (err) {
            process.stdout.write('\n');
            stopSpinner(false);
            printError('LLM error: ' + (err instanceof Error ? err.message : String(err)));
            conversation.pop();
            continue mainLoop;
          }
        }
      }

      // Commit to conversation history
      const cleanText = (fullText ?? '').trim().replace(/^null$/, '').trim();
      if (cleanText) {
        conversation.push({
          id: crypto.randomUUID(), role: 'assistant', content: cleanText, timestamp: new Date(),
        });
      }

      // Execute tools
      toolCalls = dedup(toolCalls);
      for (const tc of toolCalls) {
        printToolCall(tc.name, tc.arguments);
        startSpinner('Running ' + tc.name);
        const result = await executeTool(tc.name, tc.arguments, projectRoot as string);
        stopSpinner(result.success);
        printToolResult(tc.name, result);

        conversation.push({
          id: crypto.randomUUID(), role: 'tool',
          content: (result.success ? 'Result: ' : 'Error: ') + (result.success ? result.output : result.error),
          timestamp: new Date(),
        });

        const toolStatus3 = result.success
          ? 'OK'
          : ('ERR: ' + (result.error ? result.error.slice(0, 80) : 'unknown error'));
        await logToTimeline(projectRoot, 'Tool: ' + tc.name + ' -- ' + toolStatus3);
      }

      // Show response if no tools were used (streaming already showed it visually)
      if (toolCalls.length === 0 && cleanText && cleanText !== 'null') {
        printAssistantMessage(cleanText);
      }

      // Trim history
      if (conversation.length > 42) {
        conversation.splice(1, conversation.length - 42);
      }
    } catch (err) {
      stopSpinner(false);
      printError('Session error: ' + (err instanceof Error ? err.message : String(err)));
    }
  }
}