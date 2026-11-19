import { existsSync, realpathSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const TERMO_TEMPLATE = [
  '# Agent-Termo Project Instructions',
  '',
  'Add project-specific instructions for Agent-Termo here.',
  '',
  '## Project conventions',
  '- Describe the architecture, coding standards, and important commands.',
  '- Include rules that should apply to every task in this project.',
  '',
  '## Workflow',
  '- Inspect existing code before making changes.',
  '- Run the relevant tests and checks after editing files.',
  '',
].join('\n');

const MAX_IMPORT_DEPTH = 4;

function isWithinDirectory(filePath: string, directory: string): boolean {
  const path = relative(resolve(directory), resolve(filePath));
  return path === '' || (path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path));
}

function resolveImportPath(importPath: string, sourceFile: string): string {
  const expanded = importPath.replace(/\\ /g, ' ');
  if (expanded === '~') return homedir();
  if (expanded.startsWith('~/')) return resolve(homedir(), expanded.slice(2));
  return isAbsolute(expanded) ? resolve(expanded) : resolve(dirname(sourceFile), expanded);
}

function isAllowedImport(importedPath: string, projectRoot: string, userConfigDir: string): boolean {
  try {
    const realPath = realpathSync(importedPath);
    return isWithinDirectory(realPath, realpathSync(projectRoot)) ||
      isWithinDirectory(realPath, realpathSync(userConfigDir));
  } catch {
    return false;
  }
}

function expandImports(
  source: string,
  sourceFile: string,
  projectRoot: string,
  userConfigDir: string,
  stack: Set<string>,
  depth: number,
): string {
  if (depth >= MAX_IMPORT_DEPTH) return source;

  let fenceCharacter = '';
  let fenceLength = 0;

  return source.split(/\r?\n/).map((line) => {
    const fence = /^\s*(\x60{3,}|~{3,})/.exec(line);
    if (fence) {
      const marker = fence[1]![0]!;
      if (!fenceCharacter) {
        fenceCharacter = marker;
        fenceLength = fence[1]!.length;
      } else if (marker === fenceCharacter && fence[1]!.length >= fenceLength) {
        fenceCharacter = '';
        fenceLength = 0;
      }
      return line;
    }
    if (fenceCharacter) return line;

    return line.split(/(\x60[^\x60]*\x60)/g).map((segment, index) => {
      if (index % 2 === 1) return segment;

      return segment.replace(/@((?:\\ |[^\s\x60])+)/g, (match, rawPath: string) => {
        const candidate = rawPath.replace(/[),;!?]+$/, '');
        const importedPath = resolveImportPath(candidate, sourceFile);
        if (!existsSync(importedPath) || !isAllowedImport(importedPath, projectRoot, userConfigDir)) return match;

        let resolvedPath: string;
        try {
          resolvedPath = realpathSync(importedPath);
        } catch {
          return match;
        }
        if (stack.has(resolvedPath)) return match;

        try {
          const imported = readFileSync(resolvedPath, 'utf-8');
          stack.add(resolvedPath);
          const expanded = expandImports(imported, resolvedPath, projectRoot, userConfigDir, stack, depth + 1);
          stack.delete(resolvedPath);
          return '\n\n' + expanded + '\n';
        } catch {
          return match;
        }
      });
    }).join('');
  }).join('\n');
}

function stripHtmlComments(source: string): string {
  let fenceCharacter = '';
  let fenceLength = 0;
  let inComment = false;
  const output: string[] = [];

  for (const originalLine of source.split(/\r?\n/)) {
    const fence = /^\s*(\x60{3,}|~{3,})/.exec(originalLine);
    if (fence) {
      const marker = fence[1]![0]!;
      if (!fenceCharacter) {
        fenceCharacter = marker;
        fenceLength = fence[1]!.length;
      } else if (marker === fenceCharacter && fence[1]!.length >= fenceLength) {
        fenceCharacter = '';
        fenceLength = 0;
      }
      output.push(originalLine);
      continue;
    }
    if (fenceCharacter) {
      output.push(originalLine);
      continue;
    }

    let line = originalLine;
    let visible = '';
    while (line.length > 0) {
      if (inComment) {
        const close = line.indexOf('-->');
        if (close < 0) {
          line = '';
        } else {
          line = line.slice(close + 3);
          inComment = false;
        }
        continue;
      }

      const open = line.indexOf('<!--');
      if (open < 0) {
        visible += line;
        line = '';
      } else {
        visible += line.slice(0, open);
        line = line.slice(open + 4);
        inComment = true;
      }
    }
    output.push(visible);
  }

  return output.join('\n');
}

function instructionFiles(projectRoot: string): string[] {
  const userConfigDir = resolve(homedir(), '.agent-termo');
  const files: string[] = [resolve(userConfigDir, 'TERMO.md')];
  const ancestors: string[] = [];
  let current = resolve(projectRoot);

  while (true) {
    ancestors.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  for (const directory of ancestors.reverse()) {
    if (dirname(directory) === directory) continue;
    files.push(resolve(directory, 'TERMO.md'));
    if (directory === resolve(projectRoot)) {
      files.push(resolve(directory, '.agent-termo', 'TERMO.md'));
    }
    files.push(resolve(directory, 'TERMO.local.md'));
    if (directory === resolve(projectRoot)) {
      files.push(resolve(directory, '.agent-termo', 'TERMO.local.md'));
    }
  }

  return [...new Set(files)];
}

/** Load user and project instructions, including recursive @file imports. */
export function loadTermoInstructions(projectRoot: string): string {
  const project = resolve(projectRoot);
  const userConfigDir = resolve(homedir(), '.agent-termo');
  const sections: string[] = [];

  for (const file of instructionFiles(project)) {
    if (!existsSync(file)) continue;

    try {
      const resolvedFile = realpathSync(file);
      const stack = new Set([resolvedFile]);
      const imported = expandImports(
        readFileSync(resolvedFile, 'utf-8'),
        resolvedFile,
        project,
        userConfigDir,
        stack,
        0,
      );
      const content = stripHtmlComments(imported).trim();
      if (content) sections.push('### ' + file + '\n\n' + content);
    } catch {
      // Missing or unreadable instruction files must not prevent startup.
    }
  }

  return sections.join('\n\n---\n\n');
}

/** Create the project instruction file without replacing existing content. */
export function ensureTermoFile(projectRoot: string): boolean {
  const file = resolve(projectRoot, 'TERMO.md');
  if (existsSync(file)) return false;
  try {
    writeFileSync(file, TERMO_TEMPLATE, { encoding: 'utf-8', flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}
