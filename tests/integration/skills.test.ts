import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeTool } from '../../src/tools/index.js';
import {
  createSkill,
  deleteSkill,
  findSkill,
  importSkill,
  listSkills,
  loadSkillCatalogPrompt,
  loadSkillInstructions,
  readSkillFile,
} from '../../src/runtime/skills.js';

function writeSkill(directory: string, name: string, description: string, extra = ''): string {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, 'SKILL.md');
  writeFileSync(file, [
    '---',
    'name: ' + name,
    'description: ' + description,
    extra,
    '---',
    '',
    '# ' + name,
    '',
    'Follow these instructions.',
    '',
  ].filter(Boolean).join('\n'), 'utf-8');
  return file;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Agent-Termo skills', () => {
  it('creates a project skill and loads its instructions', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-skills-create-'));
    try {
      const file = createSkill(projectRoot, 'api-review');
      expect(file).toBe(join(projectRoot, '.agent-termo', 'skills', 'api-review', 'SKILL.md'));
      expect(existsSync(file)).toBe(true);
      writeSkill(join(projectRoot, '.agent-termo', 'skills', 'api-review'), 'api-review', 'Reviews API contracts and endpoint behavior.');
      expect(loadSkillInstructions(projectRoot, 'api-review').instructions).toContain('Follow these instructions.');
      expect(findSkill(projectRoot, 'api-review')?.scope).toBe('project');
      expect(() => createSkill(projectRoot, 'api-review')).toThrow(/already exists/);
      expect(() => createSkill(projectRoot, '../unsafe')).toThrow(/kebab-case/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('discovers Claude Code and Codex skill directories', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-skills-compat-'));
    const home = mkdtempSync(join(tmpdir(), 'agent-termo-skills-home-'));
    try {
      vi.stubEnv('HOME', home);
      vi.stubEnv('USERPROFILE', home);
      writeSkill(join(projectRoot, '.agents', 'skills', 'codex-lint'), 'codex-lint', 'Runs lint checks and reviews code style.');
      writeSkill(join(projectRoot, '.claude', 'skills', 'claude-review'), 'claude-review', 'Reviews source code for correctness and security.');

      const skills = listSkills(projectRoot);
      expect(skills.map((skill) => skill.name)).toEqual(['codex-lint', 'claude-review']);
      expect(skills.find((skill) => skill.name === 'codex-lint')?.source).toBe('codex');
      expect(skills.find((skill) => skill.name === 'claude-review')?.source).toBe('claude');
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('loads project skills before same-named user skills and filters model-disabled skills', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-skills-scope-'));
    const home = mkdtempSync(join(tmpdir(), 'agent-termo-skills-home-'));
    try {
      vi.stubEnv('HOME', home);
      vi.stubEnv('USERPROFILE', home);
      writeSkill(join(projectRoot, '.agent-termo', 'skills', 'shared'), 'shared', 'Project-specific review of backend changes.');
      writeSkill(join(home, '.agent-termo', 'skills', 'shared'), 'shared', 'User-wide review of backend changes.');
      const globalFile = createSkill(projectRoot, 'daily-brief', 'user');
      expect(globalFile).toBe(join(home, '.agent-termo', 'skills', 'daily-brief', 'SKILL.md'));
      writeSkill(
        join(projectRoot, '.agent-termo', 'skills', 'multiline-guide'),
        'multiline-guide',
        '>',
        '  Writes clear technical documentation.\n  Maintains release notes and changelogs.',
      );
      writeSkill(
        join(projectRoot, '.agent-termo', 'skills', 'private-runbook'),
        'private-runbook',
        'A runbook that must only be explicitly invoked.',
        'disable-model-invocation: true',
      );

      const shared = findSkill(projectRoot, 'shared');
      expect(shared?.scope).toBe('project');
      expect(shared?.description).toContain('Project-specific');
      const catalog = loadSkillCatalogPrompt(projectRoot);
      expect(catalog).toContain('shared');
      expect(catalog).not.toContain('private-runbook');
      expect(findSkill(projectRoot, 'multiline-guide')?.description).toBe('Writes clear technical documentation. Maintains release notes and changelogs.');
      expect(listSkills(projectRoot).some((skill) => skill.name === 'private-runbook')).toBe(true);
      writeSkill(
        join(projectRoot, '.agent-termo', 'skills', 'internal-notes'),
        'internal-notes',
        'Private notes for operators.',
        'user-invocable: false',
      );
      expect(findSkill(projectRoot, 'internal-notes')?.userInvocable).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('imports full skill folders, reads supporting files, and deletes only the selected skill', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-skills-import-'));
    const source = mkdtempSync(join(tmpdir(), 'agent-termo-skill-source-'));
    const home = mkdtempSync(join(tmpdir(), 'agent-termo-skills-home-'));
    try {
      vi.stubEnv('HOME', home);
      vi.stubEnv('USERPROFILE', home);
      writeSkill(source, 'security-audit', 'Audits application security and authentication.');
      mkdirSync(join(source, 'references'), { recursive: true });
      writeFileSync(join(source, 'references', 'checklist.md'), '# Security checklist\n', 'utf-8');

      const imported = importSkill(projectRoot, source);
      expect(imported.name).toBe('security-audit');
      expect(readSkillFile(projectRoot, 'security-audit', 'references/checklist.md')).toContain('Security checklist');
      const toolRead = await executeTool('skill_read', { name: 'security-audit', path: 'references/checklist.md' }, projectRoot);
      expect(toolRead.success).toBe(true);
      expect(toolRead.output).toContain('Security checklist');

      expect(() => readSkillFile(projectRoot, 'security-audit', '../outside.md')).toThrow(/relative paths/);
      expect(readFileSync(imported.filePath, 'utf-8')).toContain('Audits application security');

      const skill = findSkill(projectRoot, 'security-audit');
      expect(skill).toBeDefined();
      deleteSkill(projectRoot, skill!);
      expect(existsSync(join(projectRoot, '.agent-termo', 'skills', 'security-audit'))).toBe(false);
      expect(listSkills(projectRoot)).toHaveLength(0);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(source, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('refuses to read skill symlinks that point outside the skill folder', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-skills-symlink-'));
    try {
      const skillDirectory = join(projectRoot, '.agent-termo', 'skills', 'safe-skill');
      writeSkill(skillDirectory, 'safe-skill', 'A safe example skill.');
      mkdirSync(join(skillDirectory, 'references'), { recursive: true });
      const outsideFile = join(projectRoot, 'outside.md');
      writeFileSync(outsideFile, 'private data', 'utf-8');

      try {
        symlinkSync(outsideFile, join(skillDirectory, 'references', 'external.md'));
        const unsafeDirectory = join(projectRoot, '.agent-termo', 'skills', 'unsafe-skill');
        mkdirSync(unsafeDirectory, { recursive: true });
        symlinkSync(outsideFile, join(unsafeDirectory, 'SKILL.md'));
      } catch {
        return;
      }

      expect(() => readSkillFile(projectRoot, 'safe-skill', 'references/external.md')).toThrow(/Access denied/);
      expect(listSkills(projectRoot).some((skill) => skill.name === 'unsafe-skill')).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('does not import a duplicate name into a scope that already contains it', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'agent-termo-skills-duplicate-'));
    const source = mkdtempSync(join(tmpdir(), 'agent-termo-skills-duplicate-source-'));
    try {
      createSkill(projectRoot, 'same-skill');
      writeSkill(source, 'same-skill', 'A duplicate skill.');
      expect(() => importSkill(projectRoot, source)).toThrow(/already exists/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(source, { recursive: true, force: true });
    }
  });
});
