import { describe, expect, it } from 'vitest';
import {
  shouldUseTools,
  shouldRequireInitialToolCall,
  shouldLoadProjectContext,
  shouldLoadSessionHistory,
  getExecutableToolCalls,
  isToolRequestTimeoutError,
  isToolProtocolUnsupportedError,
  getMissingRequiredToolArguments,
  createRejectedFileChangeResult,
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
    expect(shouldUseTools('Please fix the login bug')).toBe(true);
    expect(shouldUseTools('Could you implement drag and drop?')).toBe(true);
    expect(shouldUseTools('Can you please go ahead and fix this issue completely?')).toBe(true);
    expect(shouldUseTools('do coding changes on this branch')).toBe(true);
  });

  it('does not mistake first-person descriptions or general conversation for coding requests', () => {
    const introduction = 'I am Krish Patel, creator of Agent-Termo, and I am making this agent-termo an efficient software.';
    expect(shouldUseTools(introduction)).toBe(false);
    expect(shouldRequireInitialToolCall(introduction)).toBe(false);
    expect(shouldLoadProjectContext(introduction)).toBe(false);

    expect(shouldUseTools('I am building a Kanban app for my class.')).toBe(false);
    expect(shouldUseTools('I am creating a website for a personal project.')).toBe(false);
    expect(shouldUseTools('What is a Kanban board?')).toBe(false);
    expect(shouldUseTools('Explain how context windows work.')).toBe(false);
    expect(shouldUseTools('Hello', '', false, true, true)).toBe(false);
    expect(shouldRequireInitialToolCall('What is a Kanban board?')).toBe(false);
  });

  it('activates tools for explicit file operations without loading the whole project', () => {
    expect(shouldUseTools('Read package.json')).toBe(true);
    expect(shouldRequireInitialToolCall('Read package.json')).toBe(true);
    expect(shouldLoadProjectContext('Read package.json')).toBe(false);
    expect(shouldUseTools('Summarize the README.md file')).toBe(true);
    expect(shouldRequireInitialToolCall('Summarize the README.md file')).toBe(true);
    expect(shouldLoadProjectContext('Summarize the README.md file')).toBe(false);
  });

  it('activates tools and project context for explicit work requests', () => {
    expect(shouldUseTools('Build a simple Kanban application')).toBe(true);
    expect(shouldUseTools('Can you please fix the login bug?')).toBe(true);
    expect(shouldUseTools('Can you please go ahead and fix this issue completely?')).toBe(true);
    expect(shouldUseTools('I want you to implement drag and drop')).toBe(true);
    expect(shouldUseTools('do coding changes on this branch')).toBe(true);
    expect(shouldRequireInitialToolCall('Can you please fix the login bug?')).toBe(true);
    expect(shouldLoadProjectContext('Build a simple Kanban application')).toBe(true);
  });

  it('loads project context for repository questions and previous-work questions', () => {
    expect(shouldUseTools('How does authentication work in this project?')).toBe(true);
    expect(shouldLoadProjectContext('How does authentication work in this project?')).toBe(true);
    expect(shouldLoadProjectContext('What did we implement previously?')).toBe(false);
    expect(shouldLoadSessionHistory('What did we implement previously?')).toBe(true);
    expect(shouldLoadSessionHistory('Show me our conversation history')).toBe(true);
    expect(shouldLoadSessionHistory('Explain the history of computer science')).toBe(false);
    expect(shouldLoadSessionHistory('Hello there')).toBe(false);
  });

  it('does not execute model-generated tool calls when tool mode was not enabled', () => {
    const calls = [{ id: 'call-1', name: 'file:read', arguments: { path: 'README.md' } }];
    expect(getExecutableToolCalls(calls, false)).toEqual([]);
    expect(getExecutableToolCalls(calls, true)).toEqual(calls);
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

  it('does not tell the model that a rejected file proposal was written', () => {
    expect(createRejectedFileChangeResult('docs/ARCHITECTURE.md')).toEqual({
      success: false,
      error: 'Change rejected by user; docs/ARCHITECTURE.md was not modified.',
    });
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
