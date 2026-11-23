import { describe, expect, it } from 'vitest';
import { applySecretPaste } from '../../src/ui/tui.js';

describe('applySecretPaste', () => {
  it('appends pasted text to an existing masked draft', () => {
    expect(applySecretPaste('sk-', 'test-1234')).toBe('sk-test-1234');
  });

  it('decodes a UTF-8 byte payload from a PasteEvent', () => {
    expect(applySecretPaste('', new TextEncoder().encode('sk-test-5678'))).toBe('sk-test-5678');
    expect(applySecretPaste('', new TextEncoder().encode('sk-test-é'))).toBe('sk-test-é');
  });

  it('leaves the draft unchanged when the paste is empty', () => {
    expect(applySecretPaste('sk-test-', '')).toBe('sk-test-');
    expect(applySecretPaste('sk-test-', new Uint8Array())).toBe('sk-test-');
  });

  it('preserves a long pasted API key intact and in order', () => {
    const suffix = 'a1b2c3d4'.repeat(8);
    const key = `sk-test-${suffix}`;
    const result = applySecretPaste('sk-test-', new TextEncoder().encode(suffix));
    expect(key.length).toBeGreaterThanOrEqual(60);
    expect(result).toBe(key);
  });
});
