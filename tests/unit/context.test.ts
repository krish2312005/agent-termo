import { describe, expect, it } from 'vitest';
import type { ConversationMessage } from '../../src/types/index.js';
import {
  compactConversation,
  estimateContextTokens,
  parseContextWindowTokens,
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

  it('parses context sizes in tokens, thousands, and millions', () => {
    expect(parseContextWindowTokens('190000')).toBe(190_000);
    expect(parseContextWindowTokens('190k')).toBe(190_000);
    expect(parseContextWindowTokens('1.5m')).toBe(1_500_000);
    expect(parseContextWindowTokens('1,000,000')).toBe(1_000_000);
    expect(parseContextWindowTokens('4.1k')).toBe(4_100);
    expect(parseContextWindowTokens('2k')).toBeUndefined();
    expect(parseContextWindowTokens('not-a-size')).toBeUndefined();
  });

  it('uses a 190K default and configurable model limits', () => {
    expect(resolveContextBudget('unknown', {}).contextWindowTokens).toBe(190_000);
    const configured = resolveContextBudget('unknown', {
      AGENT_TERMO_CONTEXT_WINDOW: '65536',
      AGENT_TERMO_OUTPUT_RESERVE_TOKENS: '4096',
      AGENT_TERMO_CONTEXT_SAFETY_MARGIN: '1024',
    });
    expect(configured.inputBudgetTokens).toBe(60_416);
  });

  it('uses the context and output limits published for the selected NVIDIA model', () => {
    expect(resolveContextBudget('stepfun-ai/step-3.7-flash', {})).toMatchObject({
      contextWindowTokens: 190_000,
      outputReserveTokens: 8_192,
      maxOutputTokens: 8_192,
      safetyMarginTokens: 2_048,
      inputBudgetTokens: 179_760,
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
      contextWindowTokens: 190_000,
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
    const model = 'tool-message-shortening-test-model';
    const previousWindow = process.env.AGENT_TERMO_CONTEXT_WINDOW;
    const previousOutput = process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
    const previousSafety = process.env.AGENT_TERMO_CONTEXT_SAFETY_MARGIN;
    process.env.AGENT_TERMO_CONTEXT_WINDOW = '16384';
    process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = '2048';
    process.env.AGENT_TERMO_CONTEXT_SAFETY_MARGIN = '512';
    try {
      const result = prepareConversationForRequest(conversation, model);
      expect(result.estimatedBeforeTokens).toBeGreaterThan(result.budget.inputBudgetTokens);
      expect(result.compacted).toBe(true);
      expect(result.archivedMessages.some((item) => item.content.length === 90_000)).toBe(true);
      expect(conversation.some((item) => item.content.length < 10_000 && item.role === 'assistant')).toBe(true);
      expect(conversation.at(-1)?.content).toBe('latest result');
    } finally {
      if (previousWindow === undefined) delete process.env.AGENT_TERMO_CONTEXT_WINDOW;
      else process.env.AGENT_TERMO_CONTEXT_WINDOW = previousWindow;
      if (previousOutput === undefined) delete process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
      else process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = previousOutput;
      if (previousSafety === undefined) delete process.env.AGENT_TERMO_CONTEXT_SAFETY_MARGIN;
      else process.env.AGENT_TERMO_CONTEXT_SAFETY_MARGIN = previousSafety;
    }
  });

  it('does not compact when the estimate is under the reserved input budget (regression: premature 0.85 trigger)', () => {
    const conversation: ConversationMessage[] = [message('system', 'System prompt')];
    for (let index = 0; index < 14; index++) {
      conversation.push(message('user', 'request ' + index + ' ' + 'x'.repeat(3_800)));
      conversation.push(message('assistant', 'result ' + index + ' ' + 'y'.repeat(1_900)));
    }
    const model = 'no-premature-compaction-test';
    const previousWindow = process.env.AGENT_TERMO_CONTEXT_WINDOW;
    const previousOutput = process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
    const previousSafety = process.env.AGENT_TERMO_CONTEXT_SAFETY_MARGIN;
    process.env.AGENT_TERMO_CONTEXT_WINDOW = '32768';
    process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = '8192';
    process.env.AGENT_TERMO_CONTEXT_SAFETY_MARGIN = '2048';
    try {
      const budget = resolveContextBudget(model);
      const before = estimateContextTokens(conversation, undefined, model);
      // These sizes sit above the old 0.85-of-budget trigger but below the
      // reserved input budget, so the old code compacted here and the fix must not.
      expect(before).toBeGreaterThan(budget.inputBudgetTokens * 0.85);
      expect(before).toBeLessThanOrEqual(budget.inputBudgetTokens);

      const snapshot = structuredClone(conversation);
      const result = prepareConversationForRequest(conversation, model);
      expect(result.compacted).toBe(false);
      expect(result.archivedMessages).toHaveLength(0);
      expect(result.estimatedAfterTokens).toBe(result.estimatedBeforeTokens);
      expect(conversation).toEqual(snapshot);
    } finally {
      if (previousWindow === undefined) delete process.env.AGENT_TERMO_CONTEXT_WINDOW;
      else process.env.AGENT_TERMO_CONTEXT_WINDOW = previousWindow;
      if (previousOutput === undefined) delete process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
      else process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = previousOutput;
      if (previousSafety === undefined) delete process.env.AGENT_TERMO_CONTEXT_SAFETY_MARGIN;
      else process.env.AGENT_TERMO_CONTEXT_SAFETY_MARGIN = previousSafety;
    }
  });

  it('compaction keeps the objective, current goal, and failed-call diagnostics verbatim (regression: protection markers)', () => {
    const originalObjective = 'Build the payment service and preserve idempotency.';
    const currentGoal = 'Current goal: fix the failing deployment.';
    const failedToolContent = [
      'Tool: bash:execute',
      'Status: failure',
      'Command: node build.js',
      'Exit code: 1',
      'Error:',
      'Module not found: cannot resolve ./missing-module',
    ].join('\n');
    const olderToolContent = 'Older tool output that should be archived.';

    const conversation: ConversationMessage[] = [
      message('system', 'Base system prompt'),
      message('user', originalObjective),
      message('assistant', 'older turn A '.repeat(600)),
      message('tool', olderToolContent),
      message('user', 'Add retry handling.'),
      message('assistant', 'older turn B '.repeat(600)),
      message('user', currentGoal),
      message('assistant', '', {
        toolCalls: [{ id: 'call-fail', name: 'bash:execute', arguments: { command: 'node build.js' } }],
      }),
      message('tool', failedToolContent, { id: 'call-fail' }),
    ];

    const previousWindow = process.env.AGENT_TERMO_CONTEXT_WINDOW;
    const previousOutput = process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
    process.env.AGENT_TERMO_CONTEXT_WINDOW = '4096';
    process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = '1024';
    try {
      const result = prepareConversationForRequest(conversation, 'compaction-verbatim-test');
      expect(result.compacted).toBe(true);
      expect(result.archivedMessages.length).toBeGreaterThan(0);

      // The protected messages survive as verbatim messages, not only as summary prose.
      expect(conversation.some((item) => item.role === 'user' && item.content === originalObjective)).toBe(true);
      expect(conversation.some((item) => item.role === 'user' && item.content === currentGoal)).toBe(true);

      const toolMessages = conversation.filter((item) => item.role === 'tool');
      expect(toolMessages.at(-1)?.content).toBe(failedToolContent);
      expect(toolMessages.at(-1)?.content).toContain('Status: failure');
      expect(toolMessages.at(-1)?.content).toContain('Module not found: cannot resolve ./missing-module');

      // Older unprotected content is archived; the failed diagnostic is not.
      expect(result.archivedMessages.some((item) => item.role === 'tool' && item.content === olderToolContent)).toBe(true);
      expect(result.archivedMessages.some((item) => item.content === failedToolContent)).toBe(false);
    } finally {
      if (previousWindow === undefined) delete process.env.AGENT_TERMO_CONTEXT_WINDOW;
      else process.env.AGENT_TERMO_CONTEXT_WINDOW = previousWindow;
      if (previousOutput === undefined) delete process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
      else process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = previousOutput;
    }
  });

  it('produces identical results for two identical copies of the same input (regression: deterministic compaction)', () => {
    const source: ConversationMessage[] = [
      message('system', 'Base system prompt'),
      message('user', 'Original objective: build the payment service.'),
    ];
    for (let index = 0; index < 8; index++) {
      source.push(message('user', 'request ' + index + ' ' + 'x'.repeat(2_500)));
      source.push(message('assistant', 'result ' + index + ' ' + 'y'.repeat(2_000)));
    }
    source.push(message('user', 'Current goal: add tests.'));
    const first = structuredClone(source);
    const second = structuredClone(source);

    const previousWindow = process.env.AGENT_TERMO_CONTEXT_WINDOW;
    const previousOutput = process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
    process.env.AGENT_TERMO_CONTEXT_WINDOW = '8192';
    process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = '1024';
    try {
      const resultA = prepareConversationForRequest(first, 'determinism-test');
      const resultB = prepareConversationForRequest(second, 'determinism-test');
      expect(resultA.compacted).toBe(true);
      expect(resultA.archivedMessages.length).toBeGreaterThan(0);
      expect(resultA.estimatedBeforeTokens).toBe(resultB.estimatedBeforeTokens);
      expect(resultA.estimatedAfterTokens).toBe(resultB.estimatedAfterTokens);
      expect(resultA.compacted).toBe(resultB.compacted);
      expect(resultA.archivedMessages).toEqual(resultB.archivedMessages);
    } finally {
      if (previousWindow === undefined) delete process.env.AGENT_TERMO_CONTEXT_WINDOW;
      else process.env.AGENT_TERMO_CONTEXT_WINDOW = previousWindow;
      if (previousOutput === undefined) delete process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS;
      else process.env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS = previousOutput;
    }
  });
});
