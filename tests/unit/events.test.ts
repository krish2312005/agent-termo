import { describe, expect, it } from 'vitest';
import { AgentEventHub, type AgentEvent } from '../../src/runtime/events.js';

describe('AgentEventHub', () => {
  it('delivers a published event to a subscriber with the exact payload', () => {
    const hub = new AgentEventHub();
    const received: AgentEvent[] = [];
    hub.subscribe((event) => received.push(event));
    const event: AgentEvent = {
      type: 'turn.started',
      sessionId: 'session-1',
      turnId: 'turn-1',
      goal: 'ship the tests',
      at: 1_700_000_000_000,
    };

    hub.publish(event);

    expect(received).toEqual([event]);
  });

  it('stops delivering after unsubscribe and allows the handle to be called twice', () => {
    const hub = new AgentEventHub();
    const turnIds: string[] = [];
    const unsubscribe = hub.subscribe((event) => {
      if (event.type === 'turn.started') turnIds.push(event.turnId);
    });

    hub.publish({ type: 'turn.started', sessionId: 's', turnId: 'turn-before', goal: 'before', at: 1 });
    unsubscribe();
    hub.publish({ type: 'turn.started', sessionId: 's', turnId: 'turn-after', goal: 'after', at: 2 });

    expect(turnIds).toEqual(['turn-before']);
    expect(() => unsubscribe()).not.toThrow();
  });

  it('isolates a throwing listener so later listeners still receive the event', () => {
    const hub = new AgentEventHub();
    const received: AgentEvent[] = [];
    hub.subscribe(() => {
      throw new Error('boom');
    });
    hub.subscribe((event) => received.push(event));
    const event: AgentEvent = {
      type: 'turn.completed',
      sessionId: 's',
      turnId: 'turn-1',
      status: 'completed',
      at: 3,
    };

    expect(() => hub.publish(event)).not.toThrow();
    expect(received).toEqual([event]);
  });
});
