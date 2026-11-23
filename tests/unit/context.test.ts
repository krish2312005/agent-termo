import { describe, expect, it } from 'vitest';
import type { ConversationMessage } from '../../src/types/index.js';
import {
  compactConversation,
  estimateContextTokens,
  prepareConversationForRequest,
  recordContextTokenUsage,
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

  it('uses a less aggressive text estimate and calibrates it with exact provider usage', () => {
    const messages = [message('user', 'x'.repeat(4_000))];
    const initial = estimateContextTokens(messages, undefined, 'calibration-test-model');
    expect(initial).toBe(1_008);

    recordContextTokenUsage('calibration-test-model', initial, 1_200);
    const calibrated = estimateContextTokens(messages, undefined, 'calibration-test-model');
    expect(calibrated).toBe(1_200);
    recordContextTokenUsage('calibration-test-model', calibrated, 1_200);
    expect(estimateContextTokens(messages, undefined, 'calibration-test-model')).toBe(1_200);
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

  it('uses the context and output limits published for the selected NVIDIA model', () => {
    expect(resolveContextBudget('stepfun-ai/step-3.7-flash', {})).toMatchObject({
      contextWindowTokens: 262_144,
      outputReserveTokens: 8_192,
      maxOutputTokens: 8_192,
      safetyMarginTokens: 2_048,
      inputBudgetTokens: 251_904,
    });

    expect(resolveContextBudget('meta/llama-3.1-8b-instruct', {})).toMatchObject({
      contextWindowTokens: 131_072,
      outputReserveTokens: 4_096,
      maxOutputTokens: 4_096,
      safetyMarginTokens: 2_048,
      inputBudgetTokens: 124_928,
    });

    expect(resolveContextBudget('qwen/qwen2.5-coder-32b-instruct', {})).toMatchObject({
      outputReserveTokens: 4_000,
      maxOutputTokens: 4_000,
    });
    expect(resolveContextBudget('deepseek-ai/deepseek-v4-pro', {})).toMatchObject({
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 8_192,
    });
    expect(resolveContextBudget('deepseek-ai/deepseek-r1', {})).toMatchObject({
      contextWindowTokens: 131_072,
      maxOutputTokens: 8_192,
    });
    expect(resolveContextBudget('nvidia/llama-3.1-nemotron-70b-instruct', {})).toMatchObject({
      contextWindowTokens: 131_072,
      maxOutputTokens: 4_096,
      inputBudgetTokens: 124_928,
    });
    expect(resolveContextBudget('qwen/qwq-32b', {})).toMatchObject({
      contextWindowTokens: 131_072,
      maxOutputTokens: 4_096,
    });
  });

  it('allows a lower context override but never exceeds a documented model limit', () => {
    expect(resolveContextBudget('stepfun-ai/step-3.7-flash', {
      AGENT_TERMO_CONTEXT_WINDOW: '65536',
      AGENT_TERMO_OUTPUT_RESERVE_TOKENS: '4096',
      AGENT_TERMO_CONTEXT_SAFETY_MARGIN: '1024',
    })).toMatchObject({
      contextWindowTokens: 65_536,
      outputReserveTokens: 4_096,
      safetyMarginTokens: 1_024,
      inputBudgetTokens: 60_416,
    });
    expect(resolveContextBudget('stepfun-ai/step-3.7-flash', {
      AGENT_TERMO_CONTEXT_WINDOW: '9999999',
    }).contextWindowTokens).toBe(262_144);
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
      conversation.push(message('user', 'request ' + index + ' ' + 'x'.repeat(4_000)));
      conversation.push(message('assistant', 'result ' + index + ' ' + 'y'.repeat(2_000)));
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

  it('compacts only when the estimated input exceeds the reserved input budget', () => {
    const conversation: ConversationMessage[] = [message('system', 'system prompt')];
    for (let index = 0; index < 10; index++) {
      conversation.push(message('user', 'request ' + index + ' ' + 'x'.repeat(4_000)));
      conversation.push(message('assistant', 'result ' + index + ' ' + 'y'.repeat(2_000)));
    }
    const previousWindow = process.env.AGENT_TERMO_CONTEXT_WINDOW;
    const previousOutput = process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
    process.env.AGENT_TERMO_CONTEXT_WINDOW = '16384';
    process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = '1024';
    try {
      const before = estimateContextTokens(conversation, undefined, 'budget-trigger-test');
      const budget = resolveContextBudget('budget-trigger-test');
      // The estimated input exceeds the reserved input budget, so compaction
      // must fire, but it is still under the hard context-window limit.
      expect(before).toBeGreaterThan(budget.inputBudgetTokens);
      expect(before).toBeLessThan(budget.contextWindowTokens);
      const result = prepareConversationForRequest(conversation, 'budget-trigger-test');
      expect(result.compacted).toBe(true);
      expect(result.estimatedAfterTokens).toBeLessThan(result.estimatedBeforeTokens);
      expect(conversation.at(-2)?.content).toContain('request 9');
    } finally {
      if (previousWindow === undefined) delete process.env.AGENT_TERMO_CONTEXT_WINDOW;
      else process.env.AGENT_TERMO_CONTEXT_WINDOW = previousWindow;
      if (previousOutput === undefined) delete process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
      else process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = previousOutput;
    }
  });

  it('preserves the original task objective in the compacted system context', () => {
    const conversation: ConversationMessage[] = [
      message('system', 'Base system prompt'),
      message('user', 'Build the payment service and preserve idempotency.'),
      message('assistant', 'Use a database transaction and unique request key.'),
      message('user', 'Add retry handling.'),
      message('assistant', 'Retry only transient failures.'),
      message('user', 'Now add tests.'),
      message('assistant', 'Tests should cover duplicate requests.'),
    ];
    const result = compactConversation(conversation, 1);
    expect(result.archivedMessages.length).toBeGreaterThan(0);
    expect(conversation[0]?.content).toContain('Build the payment service');
    expect(conversation[0]?.content).toContain('idempotency');
    expect(conversation.at(-2)?.content).toBe('Now add tests.');
  });

  it('returns actionable diagnostics when the newest request cannot fit after compaction', () => {
    const conversation: ConversationMessage[] = [
      message('system', 'System prompt'),
      message('user', 'x'.repeat(60_000)),
    ];
    const previousWindow = process.env.AGENT_TERMO_CONTEXT_WINDOW;
    const previousOutput = process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
    const previousSafety = process.env.AGENT_TERMO_CONTEXT_SAFETY_MARGIN;
    process.env.AGENT_TERMO_CONTEXT_WINDOW = '8192';
    process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = '1024';
    process.env.AGENT_TERMO_CONTEXT_SAFETY_MARGIN = '512';
    try {
      const result = prepareConversationForRequest(conversation, 'oversized-request-test');
      expect(result.warning).toContain('Unable to fit this request');
      expect(result.warning).toContain('Estimated input:');
      expect(result.warning).toContain('available input budget:');
      expect(result.estimatedAfterTokens).toBeGreaterThan(result.budget.inputBudgetTokens);
    } finally {
      if (previousWindow === undefined) delete process.env.AGENT_TERMO_CONTEXT_WINDOW;
      else process.env.AGENT_TERMO_CONTEXT_WINDOW = previousWindow;
      if (previousOutput === undefined) delete process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
      else process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = previousOutput;
      if (previousSafety === undefined) delete process.env.AGENT_TERMO_CONTEXT_SAFETY_MARGIN;
      else process.env.AGENT_TERMO_CONTEXT_SAFETY_MARGIN = previousSafety;
    }
  });

  it('shortens oversized older tool messages but preserves the most recent tool result verbatim', () => {
    const conversation: ConversationMessage[] = [
      message('system', 'System'),
      message('user', 'Read a large file'),
      message('tool', 'x'.repeat(90_000)),
      message('assistant', 'Now check the latest result'),
      message('tool', 'latest result'),
    ];
    const result = prepareConversationForRequest(conversation, 'test-model');
    expect(result.compacted).toBe(true);
    expect(result.archivedMessages.some((item) => item.content.length === 90_000)).toBe(true);
    expect(conversation[2]?.content.length).toBeLessThan(10_000);
    expect(conversation[4]?.content).toBe('latest result');
  });
});
