import { describe, expect, it } from 'vitest';
import { formatContextBar } from '../../src/runtime/context-display.js';

describe('formatContextBar', () => {
  it('shows an empty bar at zero usage', () => {
    expect(formatContextBar(0, 100)).toBe('░'.repeat(24));
  });
  it('shows half the bar at 50 percent', () => {
    expect(formatContextBar(50, 100)).toBe('█'.repeat(12) + '░'.repeat(12));
  });
  it('fills the bar and clamps usage above the context window', () => {
    expect(formatContextBar(150, 100)).toBe('█'.repeat(24));
  });
  it('uses the requested width within safe bounds', () => {
    expect(formatContextBar(25, 100, 8)).toBe('██░░░░░░');
    expect(formatContextBar(25, 100, 0)).toBe('░');
  });
  it('treats invalid context sizes as full to avoid a misleading empty meter', () => {
    expect(formatContextBar(0, 0)).toBe('█'.repeat(24));
  });
});
