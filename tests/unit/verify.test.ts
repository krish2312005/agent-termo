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
    const result = verifyCompletion('implement the budgets component', files, [{ command: 'npm run test', success: true, output: 'ok' }]);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('placeholder');
    expect(formatIssues(result.issues)).toContain('Budgets.tsx');
  });

  it('rejects completion when code was changed for an implementation task but nothing was ever run to check it', () => {
    const files = new Map([['src/api.ts', 'export function handler() { return doWork(); }']]);
    const result = verifyCompletion('fix the login endpoint bug', files, [{ command: 'ls -la', success: true, output: '' }]);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('unverified');
  });

  it('accepts completion when a real implementation was written and a check command ran', () => {
    const files = new Map([['src/api.ts', 'export function handler() { return doWork(); }']]);
    const result = verifyCompletion('fix the login endpoint bug', files, [{ command: 'npm run typecheck && npm test', success: true, output: 'passed' }]);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });


  it('rejects completion when an executed check command failed', () => {
    const files = new Map([['src/api.ts', 'export function handler() { return doWork(); }']]);
    const result = verifyCompletion('fix the login endpoint bug', files, [
      { command: 'npm run test', success: false, output: 'Expected 200, got 500' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('check-failed');
    expect(result.issues[0]?.detail).toContain('Expected 200, got 500');
  });

  it('accepts a successful rerun of a previously failed check command', () => {
    const files = new Map([['src/api.ts', 'export function handler() { return doWork(); }']]);
    const result = verifyCompletion('fix the login endpoint bug', files, [
      { command: 'npm run test', success: false, output: 'flaky first run' },
      { command: 'npm run test', success: true, output: 'second run passed' },
    ]);
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


  it('does not let a later automatic check hide a failed check the agent already ran', async () => {
    let fallbackCalled = false;
    const result = await verifyCompletionWithChecks(
      'fix the login endpoint bug',
      files,
      [{ command: 'npm run test', success: false, output: 'test assertion failed' }],
      async () => {
        fallbackCalled = true;
        return [{ command: 'npm run test', success: true, output: 'ok' }];
      },
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('check-failed');
    expect(result.issues[0]?.detail).toContain('test assertion failed');
    expect(fallbackCalled).toBe(false);
  });


  it('does not treat an arbitrary command mentioning test as verification', async () => {
    const result = await verifyCompletionWithChecks(
      'fix the login endpoint bug',
      files,
      [{ command: 'echo test', success: true, output: 'test' }],
      async () => [],
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('unverified');
  });

  it('falls back to the heuristic flag when the project defines no checks to run', async () => {
    const result = await verifyCompletionWithChecks('fix the login endpoint bug', files, [], async () => []);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('unverified');
  });

  it('never calls runChecks when the agent already ran a matching command itself', async () => {
    let called = false;
    const runChecks = async () => { called = true; return []; };
    const result = await verifyCompletionWithChecks('fix the login endpoint bug', files, [{ command: 'npm run test', success: true, output: 'ok' }], runChecks);
    expect(called).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('never calls runChecks for a placeholder-only failure (nothing to re-verify by running tests)', async () => {
    let called = false;
    const stubFiles = new Map([['src/Budgets.tsx', 'export function Budgets() { return null; }']]);
    const runChecks = async () => { called = true; return []; };
    const result = await verifyCompletionWithChecks('implement the budgets component', stubFiles, [{ command: 'npm run test', success: true, output: 'ok' }], runChecks);
    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.kind).toBe('placeholder');
  });
});
