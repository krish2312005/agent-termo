import { describe, expect, it } from 'vitest';
import { ToolCallStreamAccumulator } from '../../src/llm/client.js';

describe('streamed tool-call parsing', () => {
  it('joins fragmented names, IDs, and JSON arguments by tool index', () => {
    const calls = new ToolCallStreamAccumulator();
    calls.add({ index: 0, id: 'call_1', function: { name: 'file_', arguments: '{"path":' } });
    calls.add({ index: 0, function: { name: 'read', arguments: '"src/main.ts"}' } });
    calls.add({ index: 1, id: 'call_2', function: { name: 'grep', arguments: '{"pattern":"plan"}' } });

    expect(calls.toToolCalls()).toEqual([
      { id: 'call_1', name: 'file:read', arguments: { path: 'src/main.ts' } },
      { id: 'call_2', name: 'grep', arguments: { pattern: 'plan' } },
    ]);
  });

  it('keeps incomplete arguments available as raw input rather than dropping the call', () => {
    const calls = new ToolCallStreamAccumulator();
    calls.add({ index: 0, id: 'call_1', function: { name: 'file_read', arguments: '{"path":' } });
    expect(calls.toToolCalls()[0]?.arguments).toEqual({ _raw: '{"path":' });
  });
});
