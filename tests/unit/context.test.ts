import { describe, expect, it } from 'vitest';
import type { ConversationMessage } from '../../src/types/index.js';
import {
  compactConversation,
  estimateContextTokens,
  prepareConversationForRequest,
  resolveContextBudget,
} from '../../src/runtime/context.js';

function message(
  role: ConversationMessage['role'],
  content: string,
  extra: Partial<ConversationMessage> = {},
): ConversationMessage {
  return { id: role + '-' + content.slice(0, 8), role, content, timestamp: new Date(), ...extra };
}

describe('context budgeting and compaction', () => {
  it('includes tool-call JSON and tool schemas in estimates', () => {
    const messages = [
      message('system', 'System prompt'),
      message('assistant', '', {
        toolCalls: [{ id: 'call-1', name: 'file:read', arguments: { path: 'src/main.ts' } }],
      }),
    ];
    const plain = estimateContextTokens(messages);
    const withTools = estimateContextTokens(messages, [{
      type: 'function',
      function: { name: 'file_read', description: 'Read a file', parameters: { type: 'object' } },
    }]);
    expect(withTools).toBeGreaterThan(plain);
    expect(plain).toBeGreaterThan(estimateContextTokens([message('system', 'System prompt')]));
  });

  it('uses a conservative fallback and configurable model limits', () => {
    expect(resolveContextBudget('unknown', {}).contextWindowTokens).toBe(32_768);
    const configured = resolveContextBudget('unknown', {
      AGENT_TERMO_CONTEXT_WINDOW: '65536',
      AGENT_TERMO_OUTPUT_RESERVE_TOKENS: '4096',
      AGENT_TERMO_CONTEXT_SAFETY_MARGIN: '1024',
    });
    expect(configured.inputBudgetTokens).toBe(60_416);
  });

  it('summarizes tool results and preserves recent complete tool exchanges', () => {
    const conversation: ConversationMessage[] = [
      message('system', 'Base system prompt'),
      message('user', 'Earlier request'),
      message('assistant', 'Read a file', {
        toolCalls: [{ id: 'call-old', name: 'file:read', arguments: { path: 'old.ts' } }],
      }),
      message('tool', 'Older file contents with important decision details', { id: 'call-old' }),
      message('assistant', 'Earlier summary'),
      message('user', 'Latest request'),
      message('assistant', 'Read latest file', {
        toolCalls: [{ id: 'call-new', name: 'file:read', arguments: { path: 'new.ts' } }],
      }),
      message('tool', 'Recent file contents', { id: 'call-new' }),
      message('assistant', 'Latest result'),
    ];
    const result = compactConversation(conversation, 1);
    expect(result.archivedMessages.some((item) => item.role === 'tool')).toBe(true);
    expect(conversation.some((item) => item.content === 'Recent file contents')).toBe(true);
    expect(conversation[0]?.content).toContain('file:read');
    expect(conversation[0]?.content).toContain('Older file contents');
  });

  it('carries previous compacted summaries into later compaction passes', () => {
    const conversation: ConversationMessage[] = [
      message('system', 'Base system prompt'),
      message('user', 'First durable fact'),
      message('assistant', 'First outcome'),
      message('user', 'Second request'),
      message('assistant', 'Second outcome'),
      message('user', 'Third request'),
      message('assistant', 'Third outcome'),
      message('user', 'Fourth request'),
      message('assistant', 'Fourth outcome'),
    ];
    compactConversation(conversation, 2);
    conversation.push(message('user', 'A later request'));
    conversation.push(message('assistant', 'A later outcome'));
    compactConversation(conversation, 2);
    expect(conversation[0]?.content).toContain('First durable fact');
    expect(conversation[0]?.content).toContain('Third request');
  });

  it('compacts before exceeding the configured input budget', () => {
    const conversation: ConversationMessage[] = [message('system', 'system'.repeat(100))];
    for (let index = 0; index < 12; index++) {
      conversation.push(message('user', 'request ' + index + ' ' + 'x'.repeat(2_000)));
      conversation.push(message('assistant', 'result ' + index + ' ' + 'y'.repeat(1_000)));
    }
    const previousWindow = process.env.AGENT_TERMO_CONTEXT_WINDOW;
    const previousOutput = process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
    process.env.AGENT_TERMO_CONTEXT_WINDOW = '8192';
    process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = '1024';
    try {
      const result = prepareConversationForRequest(conversation, 'test-model');
      expect(result.compacted).toBe(true);
      expect(result.archivedMessages.length).toBeGreaterThan(0);
      expect(result.estimatedAfterTokens).toBeLessThan(result.estimatedBeforeTokens);
    } finally {
      if (previousWindow === undefined) delete process.env.AGENT_TERMO_CONTEXT_WINDOW;
      else process.env.AGENT_TERMO_CONTEXT_WINDOW = previousWindow;
      if (previousOutput === undefined) delete process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
      else process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = previousOutput;
    }
  });

  it('shortens oversized tool messages and returns their complete original for archiving', () => {
    const conversation: ConversationMessage[] = [
      message('system', 'System'),
      message('user', 'Read a large file'),
      message('tool', 'x'.repeat(90_000)),
    ];
    const result = prepareConversationForRequest(conversation, 'test-model');
    expect(result.compacted).toBe(true);
    expect(result.archivedMessages[0]?.content).toHaveLength(90_000);
    expect(conversation[2]?.content.length).toBeLessThan(10_000);
  });
});
