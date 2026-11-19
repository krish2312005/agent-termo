import { describe, expect, it } from 'vitest';
import { formatIssues, scanForPlaceholders, verifyCompletion, verifyCompletionWithChecks } from '../../src/runtime/verify.js';

describe('verify', () => {
  it('flags a stub function that only returns null', () => {
    const issues = scanForPlaceholders('src/Transactions.tsx', 'export function Transactions() { return null; }');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe('placeholder');
    expect(issues[0]?.detail).toContain('Transactions.tsx');
  });

  it('flags a stub arrow function, NotImplementedError and TODO markers', () => {
    expect(scanForPlaceholders('a.ts', 'export const f = () => { return undefined; }')).toHaveLength(1);
    expect(scanForPlaceholders('a.py', 'def f():\n    raise NotImplementedError')).toHaveLength(1);
    expect(scanForPlaceholders('a.ts', '// TODO: implement this\nexport function f() { return 1; }')).toHaveLength(1);
  });

  it('does not flag a real implementation', () => {
    expect(scanForPlaceholders('src/Transactions.tsx', 'export function Transactions() { return <ul>{items.map(renderItem)}</ul>; }')).toHaveLength(0);
  });

  it('ignores non-code files', () => {
    expect(scanForPlaceholders('README.md', 'return null;')).toHaveLength(0);
  });

  it('rejects completion when a changed file is a stub, even with a passing report', () => {
    const files = new Map([['src/Budgets.tsx', 'export function Budgets() { return null; }']]);
    const result = verifyCompletion('implement the budgets component', files, ['npm run test']);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('placeholder');
    expect(formatIssues(result.issues)).toContain('Budgets.tsx');
  });

  it('rejects completion when code was changed for an implementation task but nothing was ever run to check it', () => {
    const files = new Map([['src/api.ts', 'export function handler() { return doWork(); }']]);
    const result = verifyCompletion('fix the login endpoint bug', files, ['ls -la']);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('unverified');
  });

  it('accepts completion when a real implementation was written and a check command ran', () => {
    const files = new Map([['src/api.ts', 'export function handler() { return doWork(); }']]);
    const result = verifyCompletion('fix the login endpoint bug', files, ['npm run typecheck && npm test']);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('does not require a check command for tasks that are not implementation work', () => {
    const files = new Map([['docs/NOTES.md', 'some notes']]);
    const result = verifyCompletion('write up notes on the architecture', files, []);
    expect(result.ok).toBe(true);
  });
});

describe('verifyCompletionWithChecks', () => {
  const files = new Map([['src/api.ts', 'export function handler() { return doWork(); }']]);

  it('runs the project\'s own checks instead of just flagging "unverified", and accepts a passing result', async () => {
    const runChecks = async () => [{ command: 'npm run test', success: true, output: 'ok' }];
    const result = await verifyCompletionWithChecks('fix the login endpoint bug', files, [], runChecks);
    expect(result.ok).toBe(true);
  });

  it('rejects completion with the real command output when the project\'s own check fails', async () => {
    const runChecks = async () => [{ command: 'npm run test', success: false, output: 'Expected 200, got 500 (login.test.ts:12)' }];
    const result = await verifyCompletionWithChecks('fix the login endpoint bug', files, [], runChecks);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('check-failed');
    expect(result.issues[0]?.detail).toContain('npm run test');
    expect(result.issues[0]?.detail).toContain('login.test.ts');
  });

  it('falls back to the heuristic flag when the project defines no checks to run', async () => {
    const result = await verifyCompletionWithChecks('fix the login endpoint bug', files, [], async () => []);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('unverified');
  });

  it('never calls runChecks when the agent already ran a matching command itself', async () => {
    let called = false;
    const runChecks = async () => { called = true; return []; };
    const result = await verifyCompletionWithChecks('fix the login endpoint bug', files, ['npm run test'], runChecks);
    expect(called).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('never calls runChecks for a placeholder-only failure (nothing to re-verify by running tests)', async () => {
    let called = false;
    const stubFiles = new Map([['src/Budgets.tsx', 'export function Budgets() { return null; }']]);
    const runChecks = async () => { called = true; return []; };
    const result = await verifyCompletionWithChecks('implement the budgets component', stubFiles, ['npm run test'], runChecks);
    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('placeholder');
  });
});
