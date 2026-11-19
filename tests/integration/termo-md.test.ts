import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureTermoFile, loadTermoInstructions } from '../../src/runtime/termo-md.js';

describe('TERMO.md instructions', () => {
  it('creates a starter file once and never overwrites user instructions', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-instructions-'));
    try {
      expect(ensureTermoFile(projectRoot)).toBe(true);
      const file = join(projectRoot, 'TERMO.md');
      expect(readFileSync(file, 'utf-8')).toContain('# Agent-Termo Project Instructions');
      writeFileSync(file, '# My project rules\n', 'utf-8');
      expect(ensureTermoFile(projectRoot)).toBe(false);
      expect(readFileSync(file, 'utf-8')).toBe('# My project rules\n');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('loads ancestor, project-local, and .agent-termo instructions in order', () => {
    const parent = mkdtempSync(join(tmpdir(), 'agent-termo-parent-'));
    const projectRoot = join(parent, 'project');
    mkdirSync(join(projectRoot, '.agent-termo'), { recursive: true });
    try {
      writeFileSync(join(parent, 'TERMO.md'), '# Parent rules\n', 'utf-8');
      writeFileSync(join(projectRoot, 'TERMO.md'), '# Project rules\n', 'utf-8');
      writeFileSync(join(projectRoot, 'TERMO.local.md'), '# Personal project rules\n', 'utf-8');
      writeFileSync(join(projectRoot, '.agent-termo', 'TERMO.md'), '# Agent-Termo folder rules\n', 'utf-8');

      const loaded = loadTermoInstructions(projectRoot);
      expect(loaded.indexOf('Parent rules')).toBeLessThan(loaded.indexOf('Project rules'));
      expect(loaded.indexOf('Project rules')).toBeLessThan(loaded.indexOf('Personal project rules'));
      expect(loaded).toContain('Agent-Termo folder rules');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('expands recursive imports while leaving code spans and fenced blocks literal', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-import-'));
    try {
      writeFileSync(join(projectRoot, 'extra.md'), '# Imported rule\nUse strict types.\n', 'utf-8');
      writeFileSync(
        join(projectRoot, 'TERMO.md'),
        [
          '# Main rules',
          '@extra.md',
          '',
          '\x60@extra.md\x60 is literal',
          '',
          '\x60\x60\x60md',
          '@extra.md',
          '\x60\x60\x60',
          '',
          '<!-- maintainer note -->',
          '<!--',
          'another maintainer note',
          '-->',
        ].join('\n'),
        'utf-8',
      );

      const loaded = loadTermoInstructions(projectRoot);
      expect(loaded).toContain('Imported rule');
      expect(loaded).toContain('Use strict types.');
      expect(loaded).toContain('\x60@extra.md\x60 is literal');
      expect(loaded).toContain('\x60\x60\x60md\n@extra.md\n\x60\x60\x60');
      expect(loaded).not.toContain('maintainer note');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
