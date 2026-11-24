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
  return toolName.startsWith('mcp_')
    || toolName === 'bash:execute'
    || toolName === 'bash:start'
    || toolName === 'bash:stop'
    || toolName === 'browser:verify'
    || toolName === 'git:commit'
    || toolName === 'git:push';
}

/** Only exact commands may be remembered; action-style tools are approved per call. */
export function supportsPersistentApproval(toolName: string): boolean {
  return !toolName.startsWith('mcp_') && toolName !== 'bash:stop' && toolName !== 'browser:verify';
}

export function commandApprovalKey(toolName: string, args: Record<string, unknown>): string {
  const command = toolName.startsWith('mcp_')
    ? JSON.stringify(args)
    : typeof args.command === 'string'
      ? args.command.trim()
      : toolName === 'bash:stop'
        ? `session_id=${String(args.session_id ?? '').trim()}`
        : toolName === 'browser:verify'
          ? `base_url=${String(args.base_url ?? '').trim()}`
          : `${toolName}:${String(args.message ?? '').trim()}`;
  return `${toolName}|${command}`;
}

export function hasPermissionsFile(projectRoot: string): boolean {
  return existsSync(permissionsPath(projectRoot));
}
