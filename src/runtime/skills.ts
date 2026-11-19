import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export type SkillScope = 'project' | 'user';
export type SkillSource = 'agent-termo' | 'codex' | 'claude';

export interface SkillDefinition {
  name: string;
  description: string;
  scope: SkillScope;
  source: SkillSource;
  directory: string;
  filePath: string;
  disableModelInvocation: boolean;
  userInvocable: boolean;
}

interface SkillRoot {
  path: string;
  scope: SkillScope;
  source: SkillSource;
}

interface SkillFrontmatter {
  name: string;
  description: string;
  disableModelInvocation: boolean;
  userInvocable: boolean;
  body: string;
}

const SKILL_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const MAX_SKILL_FILE_BYTES = 128 * 1024;

function skillRoots(projectRoot: string): SkillRoot[] {
  const home = homedir();
  return [
    { path: resolve(projectRoot, '.agent-termo', 'skills'), scope: 'project', source: 'agent-termo' },
    { path: resolve(projectRoot, '.agents', 'skills'), scope: 'project', source: 'codex' },
    { path: resolve(projectRoot, '.claude', 'skills'), scope: 'project', source: 'claude' },
    { path: resolve(home, '.agent-termo', 'skills'), scope: 'user', source: 'agent-termo' },
    { path: resolve(home, '.agents', 'skills'), scope: 'user', source: 'codex' },
    { path: resolve(home, '.claude', 'skills'), scope: 'user', source: 'claude' },
  ];
}

function withinDirectory(filePath: string, directory: string): boolean {
  const relativePath = relative(resolve(directory), resolve(filePath));
  return relativePath === '' || (
    relativePath !== '..' &&
    !relativePath.startsWith('..' + sep) &&
    !isAbsolute(relativePath)
  );
}

function frontmatterValue(lines: string[], key: string): string {
  const start = lines.findIndex((line) => new RegExp('^' + key + ':').test(line));
  if (start < 0) return '';

  const match = new RegExp('^' + key + ':\\s*(.*)$').exec(lines[start] ?? '');
  const raw = match?.[1]?.trim() ?? '';
  if (!raw.startsWith('|') && !raw.startsWith('>')) return raw.replace(/^['"]|['"]$/g, '');

  const parts: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index] ?? '';
    if (line.trim() && !/^\s/.test(line)) break;
    if (line.trim()) parts.push(line.trim());
  }
  return raw.startsWith('>') ? parts.join(' ') : parts.join('\n');
}

function parseSkillFrontmatter(content: string): SkillFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  const body = match ? content.slice(match[0].length).trim() : content.trim();
  if (!match) {
    return { name: '', description: '', disableModelInvocation: false, userInvocable: true, body };
  }

  const lines = match[1]!.split(/\r?\n/);
  const disabled = frontmatterValue(lines, 'disable-model-invocation').toLowerCase() === 'true';
  const userInvocable = frontmatterValue(lines, 'user-invocable').toLowerCase() !== 'false';
  return {
    name: frontmatterValue(lines, 'name'),
    description: frontmatterValue(lines, 'description'),
    disableModelInvocation: disabled,
    userInvocable,
    body,
  };
}

function validateSkillName(name: string): string {
  const normalized = name.trim();
  if (!SKILL_NAME.test(normalized)) {
    throw new Error('Skill names must be lowercase kebab-case (letters, numbers, and hyphens only).');
  }
  return normalized;
}

function expandHomePath(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/') || path.startsWith('~\\')) return resolve(homedir(), path.slice(2));
  return path;
}

function nativeSkillRoot(projectRoot: string, scope: SkillScope): string {
  return scope === 'project'
    ? resolve(projectRoot, '.agent-termo', 'skills')
    : resolve(homedir(), '.agent-termo', 'skills');
}

function readDefinition(directory: string, root: SkillRoot): SkillDefinition | null {
  const filePath = resolve(directory, 'SKILL.md');
  if (!existsSync(filePath)) return null;

  try {
    const metadata = parseSkillFrontmatter(readFileSync(filePath, 'utf-8'));
    return {
      name: basename(directory),
      description: metadata.description || 'No description provided.',
      scope: root.scope,
      source: root.source,
      directory,
      filePath,
      disableModelInvocation: metadata.disableModelInvocation,
      userInvocable: metadata.userInvocable,
    };
  } catch {
    return null;
  }
}

/** Discover standard SKILL.md folders in Agent-Termo, Codex, and Claude Code locations. */
export function listSkills(projectRoot: string): SkillDefinition[] {
  const skills: SkillDefinition[] = [];
  for (const root of skillRoots(projectRoot)) {
    if (!existsSync(root.path)) continue;
    try {
      const entries = readdirSync(root.path, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const skill = readDefinition(resolve(root.path, entry.name), root);
        if (skill) skills.push(skill);
      }
    } catch {
      // An unreadable skill directory must not prevent the REPL from starting.
    }
  }
  return skills;
}

/** Project skills take precedence over user skills with the same name. */
export function findSkill(projectRoot: string, name: string): SkillDefinition | undefined {
  return listSkills(projectRoot).find((skill) => skill.name === name);
}

/** Read SKILL.md or a supporting text file contained by the selected skill folder. */
export function readSkillFile(projectRoot: string, name: string, relativePath = 'SKILL.md', skillDirectory?: string): string {
  const skill = skillDirectory
    ? listSkills(projectRoot).find((item) => item.name === name && item.directory === skillDirectory)
    : findSkill(projectRoot, name);
  if (!skill) throw new Error('Unknown skill: ' + name);

  const requestedPath = relativePath.trim() || 'SKILL.md';
  if (isAbsolute(requestedPath) || requestedPath.split(/[\\/]+/).includes('..')) {
    throw new Error('Skill files must be relative paths inside the skill directory.');
  }

  const rootRealPath = realpathSync(skill.directory);
  const filePath = resolve(skill.directory, requestedPath);
  const realFilePath = realpathSync(filePath);
  if (!withinDirectory(realFilePath, rootRealPath)) {
    throw new Error('Access denied: skill files must stay inside the selected skill directory.');
  }

  const stat = statSync(realFilePath);
  if (!stat.isFile()) throw new Error('Skill path is not a file: ' + requestedPath);
  if (stat.size > MAX_SKILL_FILE_BYTES) throw new Error('Skill file is too large to load (maximum 128 KB).');
  return readFileSync(realFilePath, 'utf-8');
}

/** Return the instruction body without YAML frontmatter for explicit /skill use. */
export function loadSkillInstructions(projectRoot: string, name: string, skillDirectory?: string): { skill: SkillDefinition; instructions: string } {
  const skill = skillDirectory
    ? listSkills(projectRoot).find((item) => item.name === name && item.directory === skillDirectory)
    : findSkill(projectRoot, name);
  if (!skill) throw new Error('Unknown skill: ' + name);
  const metadata = parseSkillFrontmatter(readSkillFile(projectRoot, name, 'SKILL.md', skill.directory));
  if (!metadata.body) throw new Error('Skill "' + name + '" has no instructions in its SKILL.md file.');
  return { skill, instructions: metadata.body };
}

/** Build a compact prompt catalog. Skill content itself is loaded on demand with skill:read. */
export function loadSkillCatalogPrompt(projectRoot: string): string {
  const byName = new Map<string, SkillDefinition>();
  for (const skill of listSkills(projectRoot)) {
    if (!byName.has(skill.name)) byName.set(skill.name, skill);
  }
  const available = [...byName.values()].filter((skill) => !skill.disableModelInvocation);
  if (available.length === 0) return '';

  const lines = available.map((skill) => {
    const location = skill.scope + ', ' + skill.source;
    return '- ' + skill.name + ' [' + location + ']: ' + skill.description;
  });
  return [
    '## Available Skills',
    'Skills are task-specific playbooks. When a user request matches one of these descriptions, read that skill before acting with skill:read(name=<exact skill name>). Load supporting files through the same tool using a relative path. Do not load unrelated skills.',
    ...lines,
  ].join('\n');
}

/** Create a starter skill in the native Agent-Termo project or user directory. */
export function createSkill(
  projectRoot: string,
  name: string,
  scope: SkillScope = 'project',
): string {
  const skillName = validateSkillName(name);
  const root = nativeSkillRoot(projectRoot, scope);
  const directory = resolve(root, skillName);
  mkdirSync(root, { recursive: true });
  mkdirSync(directory);
  const content = [
    '---',
    'name: ' + skillName,
    'description: Describe what this skill does and when it should be used.',
    '---',
    '',
    '# ' + skillName,
    '',
    'Write focused instructions for this skill here.',
    'Keep supporting references and scripts in this directory and refer to them with relative paths.',
    '',
  ].join('\n');

  try {
    writeFileSync(resolve(directory, 'SKILL.md'), content, { encoding: 'utf-8', flag: 'wx' });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return resolve(directory, 'SKILL.md');
}

/** Import an existing skill folder or a path to its SKILL.md into native storage. */
export function importSkill(
  projectRoot: string,
  sourcePath: string,
  scope: SkillScope = 'project',
): { name: string; filePath: string } {
  const expandedSource = expandHomePath(sourcePath);
  const source = realpathSync(isAbsolute(expandedSource) ? expandedSource : resolve(projectRoot, expandedSource));
  const sourceStats = statSync(source);
  const sourceDirectory = sourceStats.isDirectory() ? source : dirname(source);
  const sourceSkillFile = resolve(sourceDirectory, 'SKILL.md');
  if (!sourceStats.isDirectory() && basename(source) !== 'SKILL.md') {
    throw new Error('Import a skill folder or its SKILL.md file.');
  }
  if (!existsSync(sourceSkillFile)) throw new Error('The selected folder does not contain SKILL.md.');

  const metadata = parseSkillFrontmatter(readFileSync(sourceSkillFile, 'utf-8'));
  const name = validateSkillName(metadata.name || basename(sourceDirectory));
  const destinationRoot = nativeSkillRoot(projectRoot, scope);
  const destination = resolve(destinationRoot, name);
  mkdirSync(destinationRoot, { recursive: true });
  if (existsSync(destination)) throw new Error('Skill already exists in ' + scope + ' storage: ' + name);

  try {
    cpSync(sourceDirectory, destination, {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter: (entry) => basename(entry) !== '.git' && basename(entry) !== '.DS_Store',
    });
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }

  return { name, filePath: resolve(destination, 'SKILL.md') };
}

/** Delete exactly the discovered skill entry; callers must request confirmation first. */
export function deleteSkill(projectRoot: string, skill: SkillDefinition): void {
  const allowedRoot = skillRoots(projectRoot).find((root) => withinDirectory(skill.directory, root.path));
  if (!allowedRoot || !existsSync(skill.directory)) throw new Error('Skill is no longer available: ' + skill.name);

  const rootRealPath = realpathSync(allowedRoot.path);
  const skillRealPath = realpathSync(skill.directory);
  if (!withinDirectory(skillRealPath, rootRealPath) || skillRealPath === rootRealPath) {
    throw new Error('Refusing to delete a skill outside its skills directory.');
  }
  rmSync(skillRealPath, { recursive: true, force: false });
}
