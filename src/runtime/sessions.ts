// =============================================================================
// Local conversation sessions
//
// Each session is a private JSON snapshot under .agent-termo/sessions/. The
// complete message array is stored so native tool calls and their results can
// be restored exactly after a process restart.
// =============================================================================

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConversationMessage } from '../types/index.js';
import { agentTermoSessionsDir } from './paths.js';

export interface SessionTaskState {
  goal: string;
  status: 'idle' | 'running' | 'interrupted';
  reason: string;
  lastActions: string[];
  completedOperations: string[];
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
  if (!firstRequest) return 'New session';
  return firstRequest.replace(/\s+/g, ' ').slice(0, 80);
}

function repairPendingToolCalls(messages: ConversationMessage[]): ConversationMessage[] {
  const repaired: ConversationMessage[] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    repaired.push(message);
    if (message.role !== 'assistant' || !message.toolCalls?.length) continue;

    const savedResults = new Set<string>();
    let next = index + 1;
    while (next < messages.length && messages[next]?.role === 'tool') {
      savedResults.add(messages[next]!.id);
      repaired.push(messages[next]!);
      next++;
    }
    for (const call of message.toolCalls) {
      if (savedResults.has(call.id)) continue;
      repaired.push({
        id: call.id,
        role: 'tool',
        content: 'No tool result was saved before the session stopped. Verify the action\'s current state before attempting it again.',
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
      .filter((message): message is Record<string, unknown> =>
        Boolean(message) &&
        typeof message === 'object' &&
        ['system', 'user', 'assistant', 'tool'].includes(String((message as Record<string, unknown>).role)) &&
        typeof (message as Record<string, unknown>).content === 'string',
      )
      .map((message) => ({
        ...message,
        timestamp: new Date(typeof message.timestamp === 'string' || typeof message.timestamp === 'number'
          ? message.timestamp
          : Date.now()),
      })) as unknown as ConversationMessage[];

    const savedTask = value.taskState as Partial<SessionTaskState> | undefined;
    const taskState: SessionTaskState | undefined = savedTask && typeof savedTask === 'object'
      ? {
          goal: typeof savedTask.goal === 'string' ? savedTask.goal : '',
          status: savedTask.status === 'running' || savedTask.status === 'interrupted' ? savedTask.status : 'idle',
          reason: typeof savedTask.reason === 'string' ? savedTask.reason : '',
          lastActions: Array.isArray(savedTask.lastActions) ? savedTask.lastActions.filter((item): item is string => typeof item === 'string') : [],
          completedOperations: Array.isArray(savedTask.completedOperations) ? savedTask.completedOperations.filter((item): item is string => typeof item === 'string') : [],
        }
      : undefined;

    const session: StoredSession = {
      id: value.id,
      projectRoot: resolve(projectRoot),
      title: typeof value.title === 'string' ? value.title : 'New session',
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      parentId: typeof value.parentId === 'string' ? value.parentId : undefined,
      messages: repairPendingToolCalls(messages),
      currentGoal: typeof value.currentGoal === 'string' ? value.currentGoal : undefined,
      activeAgentName: typeof value.activeAgentName === 'string' ? value.activeAgentName : undefined,
      model: typeof value.model === 'string' ? value.model : undefined,
      thinkingCapacity: typeof value.thinkingCapacity === 'string' ? value.thinkingCapacity : undefined,
      taskState,
    };
    return session;
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
    try {
      if (existsSync(temporaryPath)) {
        const { unlinkSync } = awaitImportFsFallback();
        unlinkSync(temporaryPath);
      }
    } catch {
      // Preserve the original persistence error.
    }
    throw error;
  }
  return next;
}

function awaitImportFsFallback(): { unlinkSync: (path: string) => void } {
  // Kept as a small static wrapper so cleanup remains synchronous on Node 20.
  return { unlinkSync: (path) => {
    try {
      const { unlinkSync } = requireFs();
      unlinkSync(path);
    } catch {
      // A stale temporary file is harmless and ignored by the session loader.
    }
  } };
}

function requireFs(): typeof import('node:fs') {
  // createRequire is unnecessary here; this helper is replaced by a direct
  // unlinkSync import in the module's normal build.
  return fsModule;
}

import * as fsModule from 'node:fs';

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
    messages: clone.messages.map((message) => ({
      ...message,
      timestamp: new Date(message.timestamp),
    })),
  };
  return saveSession(projectRoot, forked);
}
