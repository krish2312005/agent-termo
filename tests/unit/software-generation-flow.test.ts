import { describe, expect, it } from 'vitest';
import {
  shouldUseTools,
  shouldRequireInitialToolCall,
  isToolRequestTimeoutError,
  isToolProtocolUnsupportedError,
  getMissingRequiredToolArguments,
} from '../../src/main.js';
import { buildNemotronRequestOverrides } from '../../src/llm/client.js';
import { TOOL_DEFINITIONS } from '../../src/llm/tools.js';

describe('software-generation tool routing', () => {
  it('enables tools for natural software-creation requests', () => {
    expect(shouldUseTools('Make a simple software like a Kanban board')).toBe(true);
    expect(shouldUseTools('Making a Kanban app with vanilla JavaScript')).toBe(true);
    expect(shouldRequireInitialToolCall('Making a Kanban app with vanilla JavaScript')).toBe(true);
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
      chat_template_kwargs: {
        enable_thinking: true,
        force_nonempty_content: true,
      },
    });
  });

  it('does not treat an unrelated unsupported parameter as a tool-protocol failure', () => {
    expect(isToolProtocolUnsupportedError({
      status: 400,
      message: '400 Validation: Unsupported parameter(s): extra_body',
    })).toBe(false);
    expect(isToolProtocolUnsupportedError({
      status: 400,
      message: 'Unsupported parameter(s): tools',
    })).toBe(true);
    expect(isToolProtocolUnsupportedError({
      status: 503,
      message: 'Tools are not supported',
    })).toBe(false);
  });

  it('detects missing required tool arguments before execution', () => {
    expect(getMissingRequiredToolArguments('bash:execute', {}, TOOL_DEFINITIONS)).toEqual(['command']);
    expect(getMissingRequiredToolArguments('bash:execute', { command: '  ' }, TOOL_DEFINITIONS)).toEqual(['command']);
    expect(getMissingRequiredToolArguments('file:write', { path: 'app.ts' }, TOOL_DEFINITIONS)).toEqual(['content']);
    expect(getMissingRequiredToolArguments('bash:execute', { command: 'npm test' }, TOOL_DEFINITIONS)).toEqual([]);
  });

  it('does not alter other models or requests without tools', () => {
    expect(buildNemotronRequestOverrides('some/other-model', true)).toEqual({});
    expect(buildNemotronRequestOverrides(model, false)).toEqual({});
  });
});
