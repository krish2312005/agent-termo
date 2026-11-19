import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProjectChecks } from '../../src/runtime/checks.js';

function makeProject(scripts: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'agent-termo-checks-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', scripts }));
  return dir;
}

describe('runProjectChecks', () => {
  it('returns nothing when the project defines no check scripts', async () => {
    const dir = makeProject({ start: 'node index.js' });
    expect(await runProjectChecks(dir)).toEqual([]);
  });

  it('returns no scripts at all when there is no package.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-termo-checks-'));
    expect(await runProjectChecks(dir)).toEqual([]);
  });

  it('runs a real test script and reports success', async () => {
    const dir = makeProject({ test: 'node -e "console.log(1)"' });
    const runs = await runProjectChecks(dir, 10_000);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.kind).toBe('test');
    expect(runs[0]?.success).toBe(true);
    expect(runs[0]?.command).toContain('npm run test');
  }, 15_000);

  it('runs a real failing script and captures its output', async () => {
    const dir = makeProject({ test: 'node -e "console.error(\'boom\'); process.exit(1)"' });
    const runs = await runProjectChecks(dir, 10_000);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.success).toBe(false);
    expect(runs[0]?.output).toContain('boom');
  }, 15_000);

  it('stops at the first failing kind instead of running the rest', async () => {
    const dir = makeProject({
      typecheck: 'node -e "process.exit(1)"',
      test: 'node -e "console.log(1)"',
    });
    const runs = await runProjectChecks(dir, 10_000);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.kind).toBe('typecheck');
  }, 15_000);
});
