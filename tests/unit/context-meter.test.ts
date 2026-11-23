import { describe, expect, it } from 'vitest';
import { formatContextMeter, formatTokenCount } from '../../src/ui/tui.js';

describe('formatContextMeter', () => {
  it('renders an empty meter at 0%', () => {
    expect(formatContextMeter(0, 1_000)).toBe('▱▱▱▱▱▱▱ 0%');
  });

  it('rounds to four filled cells at 50%', () => {
    expect(formatContextMeter(500, 1_000)).toBe('▰▰▰▰▱▱▱ 50%');
  });

  it('clamps usage above the budget to 100%', () => {
    expect(formatContextMeter(2_000, 1_000)).toBe('▰▰▰▰▰▰▰ 100%');
  });

  it('renders the 43% example with three filled cells', () => {
    expect(formatContextMeter(43_000, 100_000)).toBe('▰▰▰▱▱▱▱ 43%');
  });

  it('keeps a fixed shape of seven bar cells, a space, and a percent', () => {
    const output = formatContextMeter(43_000, 100_000);
    expect(output).toMatch(/^[▰▱]{7} \d+%$/);
    const [bar = '', percent = ''] = output.split(' ');
    expect([...bar]).toHaveLength(7);
    expect(percent).toMatch(/^\d+%$/);
  });
});

describe('formatTokenCount', () => {
  it('shows small counts verbatim', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(943)).toBe('943');
  });

  it('abbreviates thousands and millions', () => {
    expect(formatTokenCount(11_243)).toBe('11k');
    expect(formatTokenCount(22_528)).toBe('23k');
    expect(formatTokenCount(1_200_000)).toBe('1.2M');
  });

  it('treats non-finite input as zero', () => {
    expect(formatTokenCount(Number.NaN)).toBe('0');
  });
});
