import { describe, expect, it } from 'vitest';
import {
  commandApprovalKey,
  isCommandApprovalRequired,
  supportsPersistentApproval,
} from '../../src/runtime/permissions.js';

describe('isCommandApprovalRequired', () => {
  it('requires approval for terminal execution, background sessions, browser verification, git writes and MCP', () => {
    for (const toolName of [
      'bash:execute',
      'bash:start',
      'bash:stop',
      'browser:verify',
      'git:commit',
      'git:push',
      'mcp_playwright_navigate',
      'mcp_server_tool',
      'mcp_',
    ]) {
      expect(isCommandApprovalRequired(toolName), toolName).toBe(true);
    }
  });

  it('does not require approval for read-only or non-command tools', () => {
    for (const toolName of [
      'bash:read',
      'file:read',
      'file:write',
      'file:edit',
      'file:delete',
      'git:status',
      'git:log',
      'git:diff',
      'grep',
      'glob',
      'web:fetch',
      'mcp',
      'bash',
      'bash:execute_all',
      'not_mcp_tool',
      '',
    ]) {
      expect(isCommandApprovalRequired(toolName), JSON.stringify(toolName)).toBe(false);
    }
  });

  it('gates every background bash session action that starts, polls or stops a process', () => {
    // SEC-02: bash:start launches arbitrary code; bash:stop mutates live processes.
    expect(isCommandApprovalRequired('bash:start')).toBe(true);
    expect(isCommandApprovalRequired('bash:stop')).toBe(true);
    expect(isCommandApprovalRequired('bash:read')).toBe(false);
  });
});

describe('supportsPersistentApproval', () => {
  it('allows exact commands to be remembered for bash execute/start and git', () => {
    for (const toolName of ['bash:execute', 'bash:start', 'git:commit', 'git:push', 'file:write', 'bash:read']) {
      expect(supportsPersistentApproval(toolName), toolName).toBe(true);
    }
  });

  it('never persists MCP calls or action-style tools whose args are not exact commands', () => {
    for (const toolName of ['mcp_playwright_navigate', 'mcp_server_tool', 'mcp_', 'bash:stop', 'browser:verify']) {
      expect(supportsPersistentApproval(toolName), toolName).toBe(false);
    }
  });

  it('agrees with the approval gate on the action-only tools', () => {
    for (const toolName of ['bash:stop', 'browser:verify']) {
      expect(isCommandApprovalRequired(toolName), toolName).toBe(true);
      expect(supportsPersistentApproval(toolName), toolName).toBe(false);
    }
  });
});

describe('commandApprovalKey', () => {
  it('uses the exact trimmed command for bash:execute and bash:start', () => {
    expect(commandApprovalKey('bash:execute', { command: '  bun test  ' })).toBe('bash:execute|bun test');
    expect(commandApprovalKey('bash:execute', { command: 'rm -rf dist' })).toBe('bash:execute|rm -rf dist');
    expect(commandApprovalKey('bash:start', { command: 'npm run dev', cwd: 'sub' })).toBe('bash:start|npm run dev');
  });

  it('scopes the same command to the tool that would run it', () => {
    const args = { command: 'bun run dangerous' };
    const executeKey = commandApprovalKey('bash:execute', args);
    const startKey = commandApprovalKey('bash:start', args);
    expect(executeKey).not.toBe(startKey);
  });

  it('keys bash:stop by the terminal session id', () => {
    expect(commandApprovalKey('bash:stop', { session_id: ' term-1 ' })).toBe('bash:stop|session_id=term-1');
    expect(commandApprovalKey('bash:stop', { session_id: 'term-2' })).toBe('bash:stop|session_id=term-2');
    expect(commandApprovalKey('bash:stop', { session_id: 'term-1' })).not.toBe(
      commandApprovalKey('bash:stop', { session_id: 'term-2' }),
    );
    expect(commandApprovalKey('bash:stop', {})).toBe('bash:stop|session_id=');
  });

  it('keys browser:verify by the base URL', () => {
    expect(commandApprovalKey('browser:verify', { base_url: ' http://localhost:3000 ' })).toBe(
      'browser:verify|base_url=http://localhost:3000',
    );
    expect(commandApprovalKey('browser:verify', { base_url: 'https://example.test' })).toBe(
      'browser:verify|base_url=https://example.test',
    );
    expect(commandApprovalKey('browser:verify', {})).toBe('browser:verify|base_url=');
  });

  it('preserves the existing git message keys', () => {
    expect(commandApprovalKey('git:commit', { message: 'fix: escape the path' })).toBe(
      'git:commit|git:commit:fix: escape the path',
    );
    expect(commandApprovalKey('git:push', {})).toBe('git:push|git:push:');
  });

  it('preserves the existing MCP JSON-argument keys', () => {
    const args = { url: 'https://example.test', method: 'GET' };
    expect(commandApprovalKey('mcp_demo', args)).toBe('mcp_demo|{"url":"https://example.test","method":"GET"}');
    expect(commandApprovalKey('mcp_demo', {})).toBe('mcp_demo|{}');
    expect(commandApprovalKey('mcp_one', { a: 1 })).not.toBe(commandApprovalKey('mcp_two', { a: 1 }));
  });

  it('always prefixes the tool name so a command cannot be replayed across tools', () => {
    for (const [tool, args] of [
      ['bash:execute', { command: 'x' }],
      ['bash:start', { command: 'x' }],
      ['bash:stop', { session_id: 'x' }],
      ['browser:verify', { base_url: 'x' }],
      ['git:commit', { message: 'x' }],
      ['git:push', {}],
      ['mcp_x', { a: 1 }],
    ] as const) {
      expect(commandApprovalKey(tool, args).startsWith(tool + '|'), tool).toBe(true);
    }
  });
});
