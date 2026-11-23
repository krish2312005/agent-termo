import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runBrowserVerification } from '../../src/runtime/browser-verification.js';

const hasPlaywright = (() => {
  try {
    createRequire(import.meta.url).resolve('playwright');
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasPlaywright)('Playwright browser verification integration', () => {
  let server: Server;
  let projectRoot: string;
  let baseUrl: string;

  beforeAll(async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-browser-e2e-'));
    symlinkSync(resolve(process.cwd(), 'node_modules'), join(projectRoot, 'node_modules'), 'junction');
    server = createServer((request, response) => {
      if (request.url === '/favicon.ico') {
        response.writeHead(204).end();
        return;
      }
      if (request.url === '/missing.js') {
        response.writeHead(404, { 'content-type': 'text/plain' }).end('missing asset');
        return;
      }
      const broken = request.url === '/broken';
      response.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html>
        <html><body>
          <label>Email <input name="email"></label>
          <button id="save">Save</button>
          <p role="status"></p>
          <script>
            document.querySelector('#save').addEventListener('click', () => {
              document.querySelector('[role=status]').textContent = 'Saved ' + document.querySelector('[name=email]').value;
            });
          </script>
          ${broken ? '<script src="/missing.js"></script>' : ''}
        </body></html>`);
    });
    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolveListen());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 10_000);

  afterAll(async () => {
    await new Promise<void>((resolveClose) => server?.close(() => resolveClose()));
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  });

  it('executes real browser actions and reports failed network responses', async () => {
    const success = await runBrowserVerification({
      base_url: baseUrl,
      viewport: 'mobile',
      screenshot: false,
      actions: JSON.stringify([
        { type: 'fill', selector: '[name=email]', value: 'qa@example.com' },
        { type: 'click', selector: '#save' },
        { type: 'expect_text', selector: '[role=status]', text: 'Saved qa@example.com' },
      ]),
    }, projectRoot);
    expect(success.success).toBe(true);
    expect(success.output).toContain('Actions: 4/3 passed');
    expect(success.output).toContain('390x844');

    const failure = await runBrowserVerification({
      base_url: baseUrl + '/broken',
      screenshot: false,
    }, projectRoot);
    expect(failure.success).toBe(false);
    expect(failure.output).toContain('HTTP 404');
    expect(failure.error).toContain('console, page, or network errors');
  }, 30_000);
});
