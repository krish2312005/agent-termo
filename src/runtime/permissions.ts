import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  mkdirSync(resolve(projectRoot, '.agent-termo'), { recursive: true });
  writeFileSync(path, JSON.stringify({ allowedCommands: [...commands].sort() }, null, 2) + '\n', 'utf-8');
}

export function isCommandApprovalRequired(toolName: string): boolean {
  return toolName === 'bash:execute' || toolName === 'git:commit' || toolName === 'git:push';
}

export function commandApprovalKey(toolName: string, args: Record<string, unknown>): string {
  const command = typeof args.command === 'string' ? args.command.trim() : `${toolName}:${String(args.message ?? '').trim()}`;
  return `${toolName}|${command}`;
}

export function hasPermissionsFile(projectRoot: string): boolean {
  return existsSync(permissionsPath(projectRoot));
}
