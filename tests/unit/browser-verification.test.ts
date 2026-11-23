import { describe, expect, it } from 'vitest';
import { parseBrowserActions, runBrowserVerification } from '../../src/runtime/browser-verification.js';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const hasInstalledChromium = (() => {
  try {
    const requireFromProject = createRequire(resolve(process.cwd(), 'package.json'));
    const playwright = requireFromProject('playwright') as { chromium: { executablePath(): string } };
    return existsSync(playwright.chromium.executablePath());
  } catch {
    return false;
  }
})();

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

  it.skipIf(!hasInstalledChromium && process.env.CI !== 'true')('runs a real user interaction in desktop, tablet, and mobile Chromium viewports', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<!doctype html>
        <html><body>
          <h1>Task board</h1>
          <button id="increment" onclick="document.querySelector('#count').textContent = '1'">Add one</button>
          <output id="count">0</output>
        </body></html>`);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not start browser test server.');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      for (const viewport of ['desktop', 'tablet', 'mobile']) {
        const result = await runBrowserVerification({
          base_url: baseUrl,
          viewport,
          screenshot: false,
          actions: JSON.stringify([
            { type: 'click', selector: '#increment' },
            { type: 'expect_text', selector: '#count', text: '1' },
          ]),
        }, process.cwd());
        expect(result.success, result.error ?? result.output).toBe(true);
        expect(result.output).toContain(`Viewport: ${viewport}`);
        expect(result.output).toContain('Browser diagnostics: 0');
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }, 30_000);


  it('allows no extra actions', () => {
    expect(parseBrowserActions(undefined)).toEqual([]);
  });
});
