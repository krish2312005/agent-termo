import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, resolveDelegation } from '../../src/agents/index.js';
import { fromWireToolName } from '../../src/llm/client.js';
import type { Agent } from '../../src/types/index.js';

const agents: Agent[] = ['project-manager', 'Backend Developer', 'qa-tester'].map((name) => ({ name, description: `${name} agent`, systemPrompt: '', tools: [] }));

describe('delegation', () => {
  it('maps Task-style tool names the bundled prompts use onto agent:delegate', () => {
    for (const name of ['Task', 'delegate', 'spawn_agent', 'subagent', 'agent_delegate', 'agent:delegate']) {
      expect(fromWireToolName(name)).toBe('agent:delegate');
    }
    expect(fromWireToolName('file_read')).toBe('file:read');
  });

  it('accepts alternate argument names and loosely written agent names', () => {
    const r = resolveDelegation({ subagent_type: '@Backend_Developer', prompt: ' build it ' }, agents);
    expect(r.agent?.name).toBe('Backend Developer');
    expect(r.task).toBe('build it');
    expect(resolveDelegation({ agent: 'QA-Tester', task: 't', context: 'c' }, agents)).toMatchObject({ context: 'c', agent: { name: 'qa-tester' } });
  });

  it('reports an unknown agent and empty task without throwing', () => {
    expect(resolveDelegation({ agent: 'nope', task: 't' }, agents)).toMatchObject({ agent: undefined, requested: 'nope' });
    expect(resolveDelegation({}, agents)).toMatchObject({ agent: undefined, task: '' });
  });

  it('includes mandatory verification and repair requirements in every agent prompt', () => {
    const prompt = buildSystemPrompt('', '', '/workspace', '', agents);
    expect(prompt).toContain('QUALITY GATE — MANDATORY');
    expect(prompt).toContain('test-agent');
    expect(prompt).toContain('code-reviewer');
    expect(prompt).toContain('Repeat up to three repair rounds');
    expect(prompt).toContain('Never make checks green by deleting tests');
  });

  it('lists the available agents in the system prompt', () => {
    const prompt = buildSystemPrompt('', '', '/tmp/x', '', agents);
    expect(prompt).toContain('## Available Sub-Agents');
    expect(prompt).toContain('- qa-tester: qa-tester agent');
    expect(buildSystemPrompt('', '', '/tmp/x', '')).not.toContain('Available Sub-Agents');
  });
});
