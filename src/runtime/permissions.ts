import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface StoredPermissions {
  allowedCommands?: unknown;
}

export function permissionsPath(projectRoot: string): string {
  return resolve(projectRoot, '.agent-termo', 'permissions.json');
}

export function loadAllowedCommands(projectRoot: string): Set<string> {
  try {
    const parsed = JSON.parse(readFileSync(permissionsPath(projectRoot), 'utf-8')) as StoredPermissions;
    return new Set(Array.isArray(parsed.allowedCommands) ? parsed.allowedCommands.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : []);
  } catch {
    return new Set();
  }
}

export function saveAllowedCommands(projectRoot: string, commands: Set<string>): void {
  const path = permissionsPath(projectRoot);
  mkdirSync(resolve(projectRoot, '.agent-termo'), { recursive: true, mode: 0o700 });
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(temporary, JSON.stringify({ allowedCommands: [...commands].sort() }, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
    renameSync(temporary, path);
    if (process.platform !== 'win32') chmodSync(path, 0o600);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* Temporary file may not exist. */ }
    throw error;
  }
}

export function isCommandApprovalRequired(toolName: string): boolean {
  return toolName.startsWith('mcp_') || toolName === 'bash:execute' || toolName === 'git:commit' || toolName === 'git:push';
}

export function commandApprovalKey(toolName: string, args: Record<string, unknown>): string {
  const command = toolName.startsWith('mcp_')
    ? JSON.stringify(args)
    : typeof args.command === 'string' ? args.command.trim() : toolName === 'git:commit'
      ? `git:commit:${String(args.message ?? '').trim()}:${String(args.paths ?? '').trim()}`
      : `${toolName}:${String(args.message ?? '').trim()}`;
  return `${toolName}|${command}`;
}

export function hasPermissionsFile(projectRoot: string): boolean {
  return existsSync(permissionsPath(projectRoot));
}
