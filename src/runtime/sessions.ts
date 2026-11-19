// =============================================================================
// Local conversation sessions
//
// Complete conversation snapshots are stored privately under
// .agent-termo/sessions so tool calls and results survive process restarts.
// =============================================================================

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConversationMessage } from '../types/index.js';
import { normalizeTaskPlan, type TaskPlan } from './plans.js';
import { agentTermoSessionsDir } from './paths.js';
import { loadRunHistory } from './engine.js';

export interface SessionTaskState {
  goal: string;
  status: 'idle' | 'running' | 'interrupted';
  reason: string;
  lastActions: string[];
  completedOperations: string[];
  checkpointId?: string;
}

export interface StoredSession {
  id: string;
  projectRoot: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  parentId?: string;
  messages: ConversationMessage[];
  currentGoal?: string;
  activeAgentName?: string;
  model?: string;
  thinkingCapacity?: string;
  taskState?: SessionTaskState;
  taskPlan?: TaskPlan;
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  parentId?: string;
}

const SESSION_ID_PATTERN = /^[a-f0-9-]{8,64}$/i;

function sessionPath(projectRoot: string, id: string): string {
  if (!SESSION_ID_PATTERN.test(id)) throw new Error('Invalid session ID.');
  return resolve(agentTermoSessionsDir(projectRoot), id + '.json');
}

function sessionTitle(messages: ConversationMessage[]): string {
  const firstRequest = messages.find((message) => message.role === 'user')?.content?.trim();
  return firstRequest ? firstRequest.replace(/\\s+/g, ' ').slice(0, 80) : 'New session';
}

function formatPersistedToolResult(tool: {
  callId: string;
  name: string;
  status: 'completed' | 'failed' | 'interrupted';
  completedAt?: string;
  result?: Record<string, unknown>;
}): ConversationMessage {
  const result = tool.result ?? {};
  const success = tool.status === 'completed';
  const stringValue = (value: unknown): string => typeof value === 'string' ? value : '';
  const stdout = stringValue(result.stdout);
  const stderr = stringValue(result.stderr);
  const lines = [
    `Tool: ${tool.name}`,
    `Status: ${success ? 'success' : tool.status === 'interrupted' ? 'interrupted' : 'failure'}`,
    stringValue(result.command) ? `Command: ${stringValue(result.command)}` : '',
    stringValue(result.cwd) ? `Working directory: ${stringValue(result.cwd)}` : '',
    result.exitCode !== undefined ? `Exit code: ${String(result.exitCode)}` : '',
    stdout ? `stdout:\n${stdout}` : '',
    stderr ? `stderr:\n${stderr}` : '',
    stringValue(result.output) && !stdout && !stderr ? `Output:\n${stringValue(result.output)}` : '',
    !success ? `Error:\n${stringValue(result.error) || (tool.status === 'interrupted' ? 'The process stopped before this tool finished.' : 'The tool reported a failure without details.')}` : '',
  ];
  return {
    id: tool.callId,
    role: 'tool',
    content: lines.filter(Boolean).join('\n'),
    timestamp: new Date(tool.completedAt ?? Date.now()),
  };
}

function loadPersistedToolResults(projectRoot: string, sessionId: string): Map<string, ConversationMessage> {
  const results = new Map<string, ConversationMessage>();
  try {
    for (const run of loadRunHistory(projectRoot, sessionId)) {
      for (const tool of run.tools) {
        if (tool.status !== 'completed' && tool.status !== 'failed' && tool.status !== 'interrupted') continue;
        results.set(tool.callId, formatPersistedToolResult({
          callId: tool.callId,
          name: tool.name,
          status: tool.status,
          completedAt: tool.completedAt,
          result: {
            ...(tool.result ?? {}),
            stdout: typeof tool.result?.stdout === 'string' ? tool.result.stdout : tool.stdout,
            stderr: typeof tool.result?.stderr === 'string' ? tool.result.stderr : tool.stderr,
            error: tool.result?.error ?? tool.result?.reason,
          },
        }));
      }
    }
  } catch {
    // A corrupt journal must not make the last valid session snapshot unusable.
  }
  return results;
}

function repairPendingToolCalls(
  messages: ConversationMessage[],
  persistedResults: ReadonlyMap<string, ConversationMessage> = new Map(),
): ConversationMessage[] {
  const repaired: ConversationMessage[] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    repaired.push(message);
    if (message.role !== 'assistant' || !message.toolCalls?.length) continue;

    const savedResults = new Map<string, ConversationMessage>();
    let next = index + 1;
    while (next < messages.length && messages[next]?.role === 'tool') {
      savedResults.set(messages[next]!.id, messages[next]!);
      next++;
    }
    for (const call of message.toolCalls) {
      repaired.push(savedResults.get(call.id) ?? persistedResults.get(call.id) ?? {
        id: call.id,
        role: 'tool',
        content: "No tool result was saved before the session stopped. Verify the action's current state before attempting it again.",
        timestamp: new Date(),
      });
    }
    index = next - 1;
  }
  return repaired;
}

function parseSession(projectRoot: string, input: string): StoredSession | undefined {
  try {
    const value = JSON.parse(input) as Record<string, unknown>;
    if (
      value.projectRoot !== resolve(projectRoot) ||
      typeof value.id !== 'string' ||
      !SESSION_ID_PATTERN.test(value.id) ||
      typeof value.createdAt !== 'string' ||
      typeof value.updatedAt !== 'string' ||
      !Array.isArray(value.messages)
    ) return undefined;

    const messages = value.messages
      .filter((item): item is Record<string, unknown> =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).id === 'string' &&
        ['system', 'user', 'assistant', 'tool'].includes(String((item as Record<string, unknown>).role)) &&
        typeof (item as Record<string, unknown>).content === 'string',
      )
      .map((item) => {
        const time = new Date(item.timestamp as string | number);
        return { ...item, timestamp: Number.isNaN(time.getTime()) ? new Date() : time };
      }) as unknown as ConversationMessage[];

    const savedTask = value.taskState as Partial<SessionTaskState> | undefined;
    const taskState: SessionTaskState | undefined = savedTask && typeof savedTask === 'object'
      ? {
          goal: typeof savedTask.goal === 'string' ? savedTask.goal : '',
          status: savedTask.status === 'running' || savedTask.status === 'interrupted' ? savedTask.status : 'idle',
          reason: typeof savedTask.reason === 'string' ? savedTask.reason : '',
          lastActions: Array.isArray(savedTask.lastActions) ? savedTask.lastActions.filter((item): item is string => typeof item === 'string') : [],
          completedOperations: Array.isArray(savedTask.completedOperations) ? savedTask.completedOperations.filter((item): item is string => typeof item === 'string') : [],
          checkpointId: typeof savedTask.checkpointId === 'string' ? savedTask.checkpointId : undefined,
        }
      : undefined;

    return {
      id: value.id,
      projectRoot: resolve(projectRoot),
      title: typeof value.title === 'string' ? value.title : 'New session',
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      parentId: typeof value.parentId === 'string' ? value.parentId : undefined,
      messages: repairPendingToolCalls(messages, loadPersistedToolResults(projectRoot, value.id)),
      currentGoal: typeof value.currentGoal === 'string' ? value.currentGoal : undefined,
      activeAgentName: typeof value.activeAgentName === 'string' ? value.activeAgentName : undefined,
      model: typeof value.model === 'string' ? value.model : undefined,
      thinkingCapacity: typeof value.thinkingCapacity === 'string' ? value.thinkingCapacity : undefined,
      taskState,
      taskPlan: normalizeTaskPlan(value.taskPlan),
    };
  } catch {
    return undefined;
  }
}

export function createSession(projectRoot: string, messages: ConversationMessage[] = []): StoredSession {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    projectRoot: resolve(projectRoot),
    title: sessionTitle(messages),
    createdAt: now,
    updatedAt: now,
    messages,
  };
}

export function saveSession(projectRoot: string, session: StoredSession): StoredSession {
  const directory = agentTermoSessionsDir(projectRoot);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = sessionPath(projectRoot, session.id);
  const next: StoredSession = {
    ...session,
    projectRoot: resolve(projectRoot),
    title: session.title === 'New session' ? sessionTitle(session.messages) : session.title,
    updatedAt: new Date().toISOString(),
  };
  const temporaryPath = path + '.' + process.pid + '.tmp';
  try {
    writeFileSync(temporaryPath, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
    renameSync(temporaryPath, path);
  } catch (error) {
    try { unlinkSync(temporaryPath); } catch { /* Temporary file may not exist. */ }
    throw error;
  }
  return next;
}

export function loadSession(projectRoot: string, id: string): StoredSession | undefined {
  try {
    const path = sessionPath(projectRoot, id);
    if (!existsSync(path)) return undefined;
    return parseSession(projectRoot, readFileSync(path, 'utf-8'));
  } catch {
    return undefined;
  }
}

export function listSessions(projectRoot: string): SessionSummary[] {
  const directory = agentTermoSessionsDir(projectRoot);
  if (!existsSync(directory)) return [];
  const sessions: SessionSummary[] = [];
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.json')) continue;
    const session = loadSession(projectRoot, file.slice(0, -5));
    if (!session) continue;
    sessions.push({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.filter((message) => message.role !== 'system').length,
      parentId: session.parentId,
    });
  }
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadLatestSession(projectRoot: string): StoredSession | undefined {
  const latest = listSessions(projectRoot)[0];
  return latest ? loadSession(projectRoot, latest.id) : undefined;
}

export function forkSession(projectRoot: string, source: StoredSession): StoredSession {
  const clone = JSON.parse(JSON.stringify(source)) as StoredSession;
  const now = new Date().toISOString();
  const forked: StoredSession = {
    ...clone,
    id: randomUUID(),
    projectRoot: resolve(projectRoot),
    title: (source.title === 'New session' ? 'Forked session' : source.title + ' (fork)').slice(0, 80),
    createdAt: now,
    updatedAt: now,
    parentId: source.id,
    messages: clone.messages.map((message) => ({ ...message, timestamp: new Date(message.timestamp) })),
  };
  return saveSession(projectRoot, forked);
}
