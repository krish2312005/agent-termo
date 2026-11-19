import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const TERMO_TEMPLATE = `# Agent-Termo Instructions

Add project-specific instructions for Agent-Termo here.

## Project conventions
- Describe the architecture, coding standards, and important commands.
- Include rules that should apply to every task in this project.

## Workflow
- Inspect existing code before making changes.
- Run the relevant tests and checks after editing files.
`;

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

function expandImports(
  source: string,
  sourceFile: string,
  projectRoot: string,
  stack: Set<string>,
  depth: number,
): string {
  if (depth >= MAX_IMPORT_DEPTH) return source;

  const homeInstructions = resolve(homedir(), '.agent-termo');
  let inFence = false;

  return source.split(/\r?\n/).map((line) => {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;

    const segments = line.split(/(`[^`]*`)/g);
    return segments.map((segment, index) => {
      if (index % 2 === 1) return segment;

      return segment.replace(/@((?:\\ |[^\s`])+)/g, (match, rawPath: string) => {
        const candidate = rawPath.replace(/[),;!?]+$/, '');
        const importedPath = resolveImportPath(candidate, sourceFile);
        if (
          !existsSync(importedPath) ||
          !isWithinDirectory(importedPath, projectRoot) &&
            !isWithinDirectory(importedPath, homeInstructions) ||
          stack.has(importedPath)
        ) return match;

        try {
          const imported = readFileSync(importedPath, 'utf-8');
          stack.add(importedPath);
          const expanded = expandImports(imported, importedPath, projectRoot, stack, depth + 1);
          stack.delete(importedPath);
          return `\n\n<!-- Imported from ${importedPath} -->\n${expanded}\n<!-- End import -->\n`;
        } catch {
          return match;
        }
      });
    }).join('');
  }).join('\n');
}

function instructionFiles(projectRoot: string): string[] {
  const files: string[] = [resolve(homedir(), '.agent-termo', 'TERMO.md')];
  const ancestors: string[] = [];
  let current = resolve(projectRoot);

  while (true) {
    ancestors.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  for (const directory of ancestors.reverse()) {
    files.push(resolve(directory, 'TERMO.md'), resolve(directory, 'TERMO.local.md'));
    if (directory === resolve(projectRoot)) {
      files.push(
        resolve(directory, '.agent-termo', 'TERMO.md'),
        resolve(directory, '.agent-termo', 'TERMO.local.md'),
      );
    }
  }

  return [...new Set(files)];
}

/** Load persistent instructions from the user config and project directory hierarchy. */
export function loadTermoInstructions(projectRoot: string): string {
  const sections: string[] = [];

  for (const file of instructionFiles(projectRoot)) {
    if (!existsSync(file)) continue;

    try {
      const stack = new Set([resolve(file)]);
      const content = expandImports(readFileSync(file, 'utf-8'), file, resolve(projectRoot), stack, 0)
        .replace(/<!--([\s\S]*?)-->/g, '')
        .trim();
      if (content) sections.push(`### ${file}\n\n${content}`);
    } catch {
      // A missing or unreadable instruction file must not prevent startup.
    }
  }

  return sections.join('\n\n---\n\n');
}

/** Create the project instruction file without replacing existing user content. */
export function ensureTermoFile(projectRoot: string): boolean {
  const file = resolve(projectRoot, 'TERMO.md');
  if (existsSync(file)) return false;
  writeFileSync(file, TERMO_TEMPLATE, { encoding: 'utf-8', flag: 'wx' });
  return true;
}
