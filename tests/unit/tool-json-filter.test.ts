import { describe, expect, it } from 'vitest';
import { stripToolCallJson, ToolCallTextFilter } from '../../src/llm/client.js';

const SAMPLE = '{"tool_calls":[{"id":"call_1","name":"file:read","arguments":{"path":"src/llm/models.ts"}}]}';

function run(chunks: string[]): string {
  const filter = new ToolCallTextFilter();
  let out = '';
  for (const chunk of chunks) out += filter.push(chunk);
  out += filter.flush();
  return out;
}

describe('ToolCallTextFilter', () => {
  it('suppresses a JSON tool-call line that follows prose', () => {
    const out = run(['Let me verify the model limits.\n', SAMPLE + '\n']);
    expect(out).toContain('Let me verify the model limits.');
    expect(out).not.toContain('tool_calls');
  });

  it('suppresses adjacent JSON tool-call lines (no duplication in the transcript)', () => {
    const out = run([SAMPLE + '\n' + SAMPLE + '\n']);
    expect(out.trim()).toBe('');
  });

  it('suppresses a tool call split across stream chunks', () => {
    const half = Math.floor(SAMPLE.length / 2);
    const out = run(['Checking\n', SAMPLE.slice(0, half), SAMPLE.slice(half) + '\n']);
    expect(out).toContain('Checking');
    expect(out).not.toContain('file:read');
  });

  it('suppresses pretty-printed multi-line JSON tool calls', () => {
    const pretty = '{\n  "tool_calls": [\n    {"id":"c1","name":"file:read","arguments":{"path":"a.ts"}}\n  ]\n}\n';
    expect(run([pretty]).trim()).toBe('');
  });

  it('keeps normal prose and non-tool JSON untouched', () => {
    const out = run(['Use this config:\n{"foo":1}\n']);
    expect(out).toContain('Use this config:');
    expect(out).toContain('{"foo":1}');
  });

  it('stripToolCallJson removes payloads from a completed response', () => {
    const out = stripToolCallJson('Let me verify.\n' + SAMPLE + '\n' + SAMPLE + '\n');
    expect(out).toContain('Let me verify.');
    expect(out).not.toContain('"tool_calls"');
  });
});
