import { describe, expect, it } from 'vitest';
import { parseBrowserActions, runBrowserVerification } from '../../src/runtime/browser-verification.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('browser verification action parsing', () => {
  it('accepts a supported end-to-end user flow', () => {
    const actions = parseBrowserActions(JSON.stringify([
      { type: 'fill', selector: 'input[name=email]', value: 'test@example.com' },
      { type: 'click', selector: 'button[type=submit]' },
      { type: 'expect_text', selector: '[role=alert]', text: 'Saved' },
      { type: 'expect_url', url: '/dashboard' },
    ]));
    expect(actions).toHaveLength(4);
    expect(actions[2]?.type).toBe('expect_text');
  });

  it('rejects invalid JSON and non-array input', () => {
    expect(() => parseBrowserActions('{')).toThrow('valid JSON');
    expect(() => parseBrowserActions('{"type":"click"}')).toThrow('JSON array');
  });

  it('rejects unsupported actions and missing selectors', () => {
    expect(() => parseBrowserActions('[{"type":"evaluate","script":"alert(1)"}]')).toThrow('unsupported type');
    expect(() => parseBrowserActions('[{"type":"click"}]')).toThrow('requires a selector');
  });

  it('rejects invalid values, timeouts, and too many actions', () => {
    expect(() => parseBrowserActions('[{"type":"fill","selector":"#email"}]')).toThrow('string value');
    expect(() => parseBrowserActions('[{"type":"click","selector":"#save","timeout_ms":40000}]')).toThrow('timeout_ms');
    expect(() => parseBrowserActions(JSON.stringify(Array.from({ length: 31 }, () => ({ type: 'click', selector: 'button' }))))).toThrow('at most 30');
  });

  it('rejects invalid URLs and viewport names before launching a browser', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-termo-browser-test-'));
    try {
      expect(await runBrowserVerification({ base_url: 'file:///etc/passwd' }, root)).toMatchObject({ success: false });
      expect(await runBrowserVerification({ base_url: 'http://localhost:3000', viewport: 'cinema' }, root)).toMatchObject({ success: false, error: 'viewport must be desktop, tablet, or mobile.' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows no extra actions', () => {
    expect(parseBrowserActions(undefined)).toEqual([]);
  });
});
