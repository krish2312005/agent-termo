import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getSelectedAgentId,
  resetAgentSelection,
  setSelectedAgentId,
  subscribeAgentSelection,
} from '../../src/runtime/agent-selection.js';
import { MAIN_AGENT_ID, getSubAgent, listSubAgents, resetSubAgents, spawnSubAgent } from '../../src/runtime/subagents.js';

beforeEach(() => {
  resetAgentSelection();
  resetSubAgents();
});

afterEach(() => {
  resetAgentSelection();
  resetSubAgents();
});

describe('agent selection', () => {
  it('starts at main and exposes the last selected id', () => {
    expect(getSelectedAgentId()).toBe(MAIN_AGENT_ID);
    setSelectedAgentId('agent-1');
    expect(getSelectedAgentId()).toBe('agent-1');
    setSelectedAgentId('agent-2');
    expect(getSelectedAgentId()).toBe('agent-2');
  });

  it('notifies subscribers once per real change and ignores empty or same ids', () => {
    const seen: string[] = [];
    const unsubscribe = subscribeAgentSelection((id) => seen.push(id));

    setSelectedAgentId('agent-1');
    setSelectedAgentId('agent-1');
    setSelectedAgentId('');
    setSelectedAgentId(undefined as unknown as string);
    setSelectedAgentId('agent-2');

    expect(seen).toEqual(['agent-1', 'agent-2']);
    unsubscribe();
  });

  it('stops notifying after unsubscribe and isolates a throwing subscriber', () => {
    const seen: string[] = [];
    const unsubscribe = subscribeAgentSelection(() => {
      throw new Error('broken view');
    });
    const second = subscribeAgentSelection((id) => seen.push(id));

    expect(() => setSelectedAgentId('agent-1')).not.toThrow();
    expect(seen).toEqual(['agent-1']);

    unsubscribe();
    second();
    setSelectedAgentId('agent-2');
    expect(seen).toEqual(['agent-1']);
    expect(() => second()).not.toThrow();
  });

  it('resets to main and only notifies when the selection actually changes', () => {
    const seen: string[] = [];
    subscribeAgentSelection((id) => seen.push(id));

    resetAgentSelection();
    expect(getSelectedAgentId()).toBe(MAIN_AGENT_ID);
    expect(seen).toEqual([]);

    setSelectedAgentId('agent-1');
    resetAgentSelection();
    expect(getSelectedAgentId()).toBe(MAIN_AGENT_ID);
    expect(seen).toEqual(['agent-1', MAIN_AGENT_ID]);
  });
});

describe('navigation-only contract', () => {
  it('never mutates the runtime registry when selection changes', () => {
    const id = spawnSubAgent('call-1', 'frontend-expert', 'build the navigator', 8, MAIN_AGENT_ID);
    const before = JSON.parse(JSON.stringify(listSubAgents())) as unknown;

    setSelectedAgentId(id);
    expect(getSelectedAgentId()).toBe(id);
    expect(JSON.parse(JSON.stringify(listSubAgents()))).toEqual(before);
    expect(getSubAgent(id)).toMatchObject({
      id,
      agent: 'frontend-expert',
      status: 'running',
      activity: 'starting',
      queued: 0,
    });
  });

  it('keeps every registered row present when switching back and forth', () => {
    const first = spawnSubAgent('call-1', 'qa', 'first task');
    const second = spawnSubAgent('call-2', 'qa', 'second task');

    setSelectedAgentId(first);
    setSelectedAgentId(second);
    resetAgentSelection();

    expect(listSubAgents().map((agent) => agent.id)).toEqual([first, second]);
  });
});
