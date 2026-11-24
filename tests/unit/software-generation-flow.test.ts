import { describe, expect, it } from 'vitest';
import { shouldUseTools, shouldRequireInitialToolCall, isToolRequestTimeoutError } from '../../src/main.js';
import { buildNemotronRequestOverrides } from '../../src/llm/client.js';

describe('software-generation tool routing', () => {
  it('enables tools for natural software-creation requests', () => {
    expect(shouldUseTools('Make a simple software like a Kanban board')).toBe(true);
    expect(shouldUseTools('Build an app with HTML, CSS, and JavaScript')).toBe(true);
    expect(shouldUseTools('Create a website')).toBe(true);
    expect(shouldRequireInitialToolCall('Make a simple software like a Kanban board')).toBe(true);
  });

  it('does not force tool execution for ordinary questions', () => {
    expect(shouldUseTools('What is a Kanban board?')).toBe(false);
    expect(shouldRequireInitialToolCall('What is a Kanban board?')).toBe(false);
  });

  it('recognizes tool request timeouts separately from other provider failures', () => {
    expect(isToolRequestTimeoutError({ name: 'APITimeoutError', message: 'Request timed out' })).toBe(true);
    expect(isToolRequestTimeoutError({ status: 503, message: 'Service unavailable' })).toBe(false);
  });
});

describe('Nemotron 3 Ultra tool request configuration', () => {
  const model = 'nvidia/nemotron-3-ultra-550b-a55b';

  it('uses the documented template options and requires the first action when requested', () => {
    expect(buildNemotronRequestOverrides(model, true, { requireToolCall: true })).toEqual({
      tool_choice: 'required',
      extra_body: {
        chat_template_kwargs: {
          enable_thinking: true,
          force_nonempty_content: true,
        },
      },
    });
  });

  it('does not alter other models or requests without tools', () => {
    expect(buildNemotronRequestOverrides('some/other-model', true)).toEqual({});
    expect(buildNemotronRequestOverrides(model, false)).toEqual({});
  });
});
