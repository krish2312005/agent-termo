import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export type BrowserAction =
  | { type: 'click' | 'check' | 'uncheck' | 'wait_for'; selector: string; timeout_ms?: number }
  | { type: 'fill' | 'select'; selector: string; value: string; timeout_ms?: number }
  | { type: 'press'; selector: string; key: string; timeout_ms?: number }
  | { type: 'expect_text'; selector: string; text: string; timeout_ms?: number }
  | { type: 'expect_url'; url: string }
  | { type: 'goto'; url: string };

const MAX_ACTIONS = 30;
const MAX_DIAGNOSTICS = 100;
const DEFAULT_ACTION_TIMEOUT = 8_000;

export function parseBrowserActions(value: unknown): BrowserAction[] {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value !== 'string') throw new Error('actions must be a JSON-encoded array of browser actions.');
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('actions must contain valid JSON.'); }
  if (!Array.isArray(parsed)) throw new Error('actions must be a JSON array.');
  if (parsed.length > MAX_ACTIONS) throw new Error(`A browser run can contain at most ${MAX_ACTIONS} actions.`);
  const supported = new Set(['click', 'fill', 'select', 'check', 'uncheck', 'press', 'expect_text', 'expect_url', 'wait_for', 'goto']);
  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Action ${index + 1} must be an object.`);
    const action = item as Record<string, unknown>;
    if (typeof action.type !== 'string' || !supported.has(action.type)) throw new Error(`Action ${index + 1} has an unsupported type.`);
    if (['click', 'fill', 'select', 'check', 'uncheck', 'press', 'expect_text', 'wait_for'].includes(action.type)) {
      if (typeof action.selector !== 'string' || !action.selector.trim()) throw new Error(`Action ${index + 1} requires a selector.`);
    }
    if (['fill', 'select'].includes(action.type) && typeof action.value !== 'string') throw new Error(`Action ${index + 1} requires a string value.`);
    if (action.type === 'press' && typeof action.key !== 'string') throw new Error(`Action ${index + 1} requires a key.`);
    if (action.type === 'expect_text' && typeof action.text !== 'string') throw new Error(`Action ${index + 1} requires expected text.`);
    if (['expect_url', 'goto'].includes(action.type) && typeof action.url !== 'string') throw new Error(`Action ${index + 1} requires a URL.`);
    if (action.timeout_ms !== undefined && (typeof action.timeout_ms !== 'number' || !Number.isFinite(action.timeout_ms) || action.timeout_ms < 1 || action.timeout_ms > 30_000)) {
      throw new Error(`Action ${index + 1} timeout_ms must be between 1 and 30000.`);
    }
    return action as unknown as BrowserAction;
  });
}

function validHttpUrl(value: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

export async function runBrowserVerification(args: Record<string, unknown>, projectRoot: string): Promise<{ success: boolean; output: string; error?: string }> {
  const baseUrl = String(args.base_url ?? '').trim();
  if (!validHttpUrl(baseUrl)) return { success: false, output: '', error: 'base_url must be a valid http:// or https:// URL.' };

  let actions: BrowserAction[];
  try { actions = parseBrowserActions(args.actions); } catch (error) {
    return { success: false, output: '', error: error instanceof Error ? error.message : String(error) };
  }

  const timeoutMs = Math.min(120_000, Math.max(5_000, Number(args.timeout_ms) || 60_000));
  const viewportName = String(args.viewport ?? 'desktop');
  const viewports: Record<string, { width: number; height: number }> = {
    desktop: { width: 1440, height: 900 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 390, height: 844 },
  };
  const viewport = viewports[viewportName];
  if (!viewport) return { success: false, output: '', error: 'viewport must be desktop, tablet, or mobile.' };
  const requireFromProject = createRequire(resolve(projectRoot, 'package.json'));
  let playwright: any;
  try {
    try { playwright = requireFromProject('playwright'); }
    catch { playwright = requireFromProject('@playwright/test'); }
  } catch {
    return {
      success: false,
      output: '',
      error: 'Playwright is not installed in this project. Install it with the project package manager (for example: bun add -d playwright), then install Chromium with: bunx playwright install chromium. Re-run browser:verify after installation.',
    };
  }

  let browser: any;
  let page: any;
  let screenshotPath = '';
  const diagnostics: string[] = [];
  const actionResults: string[] = [];
  const startedAt = Date.now();
  const addDiagnostic = (message: string): void => {
    if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(message.slice(0, 1_000));
  };

  try {
    browser = await playwright.chromium.launch({ headless: true, timeout: Math.min(timeoutMs, 30_000) });
    page = await browser.newPage({ viewport });
    page.setDefaultTimeout(Math.min(timeoutMs, DEFAULT_ACTION_TIMEOUT));
    page.on('console', (message: any) => {
      if (message.type() === 'error') addDiagnostic('console.error: ' + message.text());
    });
    page.on('pageerror', (error: Error) => addDiagnostic('page error: ' + error.message));
    page.on('requestfailed', (request: any) => {
      const failure = request.failure()?.errorText ?? 'unknown network failure';
      if (!failure.includes('ERR_ABORTED')) addDiagnostic(`request failed: ${request.method()} ${request.url()} — ${failure}`);
    });
    page.on('response', (response: any) => {
      if (response.status() >= 400) addDiagnostic(`HTTP ${response.status()}: ${response.request().method()} ${response.url()}`);
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 20_000) });
    actionResults.push(`Opened ${page.url()}`);

    for (let index = 0; index < actions.length; index++) {
      if (Date.now() - startedAt > timeoutMs) throw new Error(`Browser verification exceeded its ${timeoutMs}ms time budget.`);
      const action = actions[index]!;
      const requestedActionTimeout = 'timeout_ms' in action ? action.timeout_ms : undefined;
      const actionTimeout = Math.min(requestedActionTimeout ?? DEFAULT_ACTION_TIMEOUT, Math.max(1, timeoutMs - (Date.now() - startedAt)));
      const locator = 'selector' in action ? page.locator(action.selector) : undefined;
      switch (action.type) {
        case 'goto':
          if (!validHttpUrl(action.url)) throw new Error(`Action ${index + 1}: goto URL must use http or https.`);
          await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: actionTimeout });
          actionResults.push(`Opened ${page.url()}`);
          break;
        case 'click':
          await locator!.click({ timeout: actionTimeout });
          actionResults.push(`Clicked ${action.selector}`);
          break;
        case 'fill':
          await locator!.fill(action.value, { timeout: actionTimeout });
          actionResults.push(`Filled ${action.selector}`);
          break;
        case 'select':
          await locator!.selectOption(action.value, { timeout: actionTimeout });
          actionResults.push(`Selected ${action.value} in ${action.selector}`);
          break;
        case 'check':
          await locator!.check({ timeout: actionTimeout });
          actionResults.push(`Checked ${action.selector}`);
          break;
        case 'uncheck':
          await locator!.uncheck({ timeout: actionTimeout });
          actionResults.push(`Unchecked ${action.selector}`);
          break;
        case 'press':
          await locator!.press(action.key, { timeout: actionTimeout });
          actionResults.push(`Pressed ${action.key} on ${action.selector}`);
          break;
        case 'wait_for':
          await locator!.waitFor({ state: 'visible', timeout: actionTimeout });
          actionResults.push(`Found visible element ${action.selector}`);
          break;
        case 'expect_text': {
          await locator!.waitFor({ state: 'visible', timeout: actionTimeout });
          const actual = await locator!.innerText({ timeout: actionTimeout });
          if (!actual.includes(action.text)) throw new Error(`Action ${index + 1}: expected ${JSON.stringify(action.text)} in ${action.selector}, received ${JSON.stringify(actual.slice(0, 300))}.`);
          actionResults.push(`Text assertion passed for ${action.selector}`);
          break;
        }
        case 'expect_url':
          if (!page.url().includes(action.url)) throw new Error(`Action ${index + 1}: expected URL to contain ${action.url}, received ${page.url()}.`);
          actionResults.push(`URL assertion passed: ${action.url}`);
          break;
      }
    }

    await page.waitForLoadState('networkidle', { timeout: Math.min(2_000, Math.max(250, timeoutMs - (Date.now() - startedAt))) }).catch(() => undefined);
    if (args.screenshot !== false) {
      const artifactDirectory = resolve(projectRoot, '.agent-termo', 'browser-artifacts');
      await mkdir(artifactDirectory, { recursive: true });
      screenshotPath = resolve(artifactDirectory, `verification-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 10_000 });
    }

    const lines = [
      `URL: ${page.url()}`,
      `Viewport: ${viewportName} (${viewport.width}x${viewport.height})`,
      `Actions: ${actionResults.length}/${actions.length} passed`,
      ...actionResults.map((item) => 'PASS ' + item),
      `Browser diagnostics: ${diagnostics.length}`,
      ...diagnostics.map((item) => 'ERROR ' + item),
      screenshotPath ? `Screenshot: ${screenshotPath}` : '',
      diagnostics.length >= MAX_DIAGNOSTICS ? `Diagnostics capped at ${MAX_DIAGNOSTICS} entries.` : '',
    ].filter(Boolean);
    const success = diagnostics.length === 0;
    return { success, output: lines.join('\n'), ...(success ? {} : { error: 'Browser verification found console, page, or network errors. Fix them and run browser:verify again.' }) };
  } catch (error) {
    if (page && args.screenshot !== false && !screenshotPath) {
      try {
        const artifactDirectory = resolve(projectRoot, '.agent-termo', 'browser-artifacts');
        await mkdir(artifactDirectory, { recursive: true });
        screenshotPath = resolve(artifactDirectory, `verification-failed-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 5_000 });
      } catch { screenshotPath = ''; }
    }
    return {
      success: false,
      output: [
        ...actionResults.map((item) => 'PASS ' + item),
        ...diagnostics.map((item) => 'ERROR ' + item),
        screenshotPath ? `Failure screenshot: ${screenshotPath}` : '',
      ].filter(Boolean).join('\n'),
      error: (error instanceof Error ? error.message : String(error)) + ((error instanceof Error && /Executable doesn't exist|browserType\.launch/i.test(error.message)) ? ' Install the browser binary with: bunx playwright install chromium.' : ''),
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
