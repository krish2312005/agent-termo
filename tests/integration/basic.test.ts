/**
 * Basic Integration Test — tool executor
 *
 * Tests that the tool system correctly executes the file:read tool
 * against real files in the project.
 */

import { describe, it, expect } from 'vitest';
import { executeTool } from '../../src/tools/index.js';

const PROJECT_ROOT = process.cwd();

describe('executeTool', () => {
  it('file:read — reads package.json successfully', async () => {
    const result = await executeTool('file:read', { path: 'package.json' }, PROJECT_ROOT);

    expect(result.success).toBe(true);
    expect(result.name).toBe('file:read');
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.output).toBeDefined();
    expect(result.output).toContain('"name": "agent-termo"');
    expect(result.error).toBeUndefined();
  });

  it('file:read — returns error for missing file', async () => {
    const result = await executeTool('file:read', { path: 'DOES_NOT_EXIST.json' }, PROJECT_ROOT);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.output).toBeUndefined();
  });

  it('file:read — returns error when path is missing', async () => {
    const result = await executeTool('file:read', {}, PROJECT_ROOT);

    expect(result.success).toBe(false);
    expect(result.error).toContain('path is required');
  });

  it('file:read — rejects path traversal outside project', async () => {
    const result = await executeTool(
      'file:read',
      { path: '../../../etc/passwd' },
      PROJECT_ROOT,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Access denied');
  });

  it('file:glob — finds TypeScript files', async () => {
    const result = await executeTool('file:glob', { pattern: 'src/**/*.ts' }, PROJECT_ROOT);

    expect(result.success).toBe(true);
    expect(result.name).toBe('file:glob');
    expect(result.output).toBeDefined();
    expect(result.output).toContain('src/cli.ts');
  });

  it('file:glob — returns error when pattern is missing', async () => {
    const result = await executeTool('file:glob', {}, PROJECT_ROOT);

    expect(result.success).toBe(false);
    expect(result.error).toContain('pattern is required');
  });

  it('bash:execute — runs a simple echo command', async () => {
    const result = await executeTool(
      'bash:execute',
      { command: 'echo hello' },
      PROJECT_ROOT,
    );

    expect(result.success).toBe(true);
    expect(result.name).toBe('bash:execute');
    expect(result.output).toContain('hello');
  });

  it('bash:execute — blocks dangerous commands', async () => {
    const result = await executeTool(
      'bash:execute',
      { command: 'rm -rf /' },
      PROJECT_ROOT,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Dangerous command blocked');
  });

  it('git:status — returns repository status without errors', async () => {
    const result = await executeTool('git:status', {}, PROJECT_ROOT);

    // Success or failure depends on whether this is a git repo
    // We just verify it returns a valid ToolResult shape
    expect(result).toHaveProperty('name', 'git:status');
    expect(typeof result.durationMs).toBe('number');
    expect(typeof result.success).toBe('boolean');
  });

  it('returns error for unknown tool', async () => {
    const result = await executeTool('unknown:tool', {}, PROJECT_ROOT);

    expect(result.success).toBe(false);
    expect(result.name).toBe('unknown:tool');
    expect(result.error).toContain('Unknown tool');
  });
});