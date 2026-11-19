// =============================================================================
// Event System — Durable event sourcing for session state
// =============================================================================

import {
  RunEvent,
  RunEventType,
  ConversationMessage,
  ToolCall,
  ToolResult,
  SessionState,
  TaskState,
  ToolCallMetadata,
} from './types.js';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';

const EVENTS_DIR = '.agent-termo/events';
const SESSIONS_DIR = '.agent-termo/sessions';

export interface EventStore {
  append(event: RunEvent): Promise<void>;
  getEvents(sessionId: string): Promise<RunEvent[]>;
  getEventsSince(sessionId: string, cursor: string): Promise<RunEvent[]>;
  getLatestCursor(sessionId: string): Promise<string | null>;
}

export interface SessionStore {
  save(session: SessionState): Promise<void>;
  load(sessionId: string): Promise<SessionState | null>;
  list(projectRoot: string): Promise<SessionSummary[]>;
  delete(sessionId: string): Promise<void>;
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status: SessionState['status'];
  parentId?: string;
}

// In-memory event store with file persistence
export class FileEventStore implements EventStore {
  private projectRoot: string;
  private buffers: Map<string, RunEvent[]> = new Map();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    const dir = resolve(projectRoot, EVENTS_DIR);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  private getEventFile(sessionId: string): string {
    return resolve(this.projectRoot, EVENTS_DIR, `${sessionId}.jsonl`);
  }

  async append(event: RunEvent): Promise<void> {
    // Buffer in memory for performance
    const buffer = this.buffers.get(event.sessionId) ?? [];
    buffer.push(event);
    this.buffers.set(event.sessionId, buffer);
    
    // Flush periodically or on critical events
    if (buffer.length >= 10 || this.isCriticalEvent(event.type)) {
      await this.flush(event.sessionId);
    }
  }

  private isCriticalEvent(type: RunEventType): boolean {
    return [
      'tool.completed',
      'tool.failed',
      'run.completed',
      'run.failed',
      'run.paused',
      'permission.granted',
      'permission.denied',
      'checkpoint.created',
      'checkpoint.restored',
    ].includes(type);
  }

  async flush(sessionId: string): Promise<void> {
    const buffer = this.buffers.get(sessionId);
    if (!buffer || buffer.length === 0) return;
    
    const file = this.getEventFile(sessionId);
    const lines = buffer.map(e => JSON.stringify(e) + '\n').join('');
    
    // Atomic write
    const tmpFile = file + '.tmp';
    writeFileSync(tmpFile, lines, { flag: 'a', encoding: 'utf-8', mode: 0o600 });
    // Append to main file
    const existing = existsSync(file) ? readFileSync(file, 'utf-8') : '';
    writeFileSync(file, existing + lines, { encoding: 'utf-8', mode: 0o600 });
    
    this.buffers.set(sessionId, []);
  }

  async getEvents(sessionId: string): Promise<RunEvent[]> {
    await this.flush(sessionId);
    const file = this.getEventFile(sessionId);
    if (!existsSync(file)) return [];
    
    const content = readFileSync(file, 'utf-8');
    return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  }

  async getEventsSince(sessionId: string, cursor: string): Promise<RunEvent[]> {
    const events = await this.getEvents(sessionId);
    const index = events.findIndex(e => e.id === cursor);
    return index >= 0 ? events.slice(index + 1) : events;
  }

  async getLatestCursor(sessionId: string): Promise<string | null> {
    const events = await this.getEvents(sessionId);
    return events.length > 0 ? events[events.length - 1]!.id : null;
  }
}

// File-based session store
export class FileSessionStore implements SessionStore {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    const dir = resolve(projectRoot, SESSIONS_DIR);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  private getSessionFile(sessionId: string): string {
    return resolve(this.projectRoot, SESSIONS_DIR, `${sessionId}.json`);
  }

  async save(session: SessionState): Promise<void> {
    const file = this.getSessionFile(session.id);
    const tmpFile = file + '.tmp';
    
    const data = {
      ...session,
      updatedAt: new Date().toISOString(),
      messages: session.messages.map(m => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
    };
    
    writeFileSync(tmpFile, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
    // Atomic rename
    const { renameSync } = await import('node:fs');
    renameSync(tmpFile, file);
  }

  async load(sessionId: string): Promise<SessionState | null> {
    const file = this.getSessionFile(sessionId);
    if (!existsSync(file)) return null;
    
    try {
      const data = JSON.parse(readFileSync(file, 'utf-8'));
      return {
        ...data,
        messages: data.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        })),
      };
    } catch {
      return null;
    }
  }

  async list(projectRoot: string): Promise<SessionSummary[]> {
    const dir = resolve(projectRoot, SESSIONS_DIR);
    if (!existsSync(dir)) return [];
    
    const sessions: SessionSummary[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const session = await this.load(file.slice(0, -5));
      if (session) {
        sessions.push({
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messages.filter(m => m.role !== 'system').length,
          status: session.status,
          parentId: session.parentId,
        });
      }
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async delete(sessionId: string): Promise<void> {
    const file = this.getSessionFile(sessionId);
    if (existsSync(file)) {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(file);
    }
    // Also delete events
    const eventFile = resolve(this.projectRoot, EVENTS_DIR, `${sessionId}.jsonl`);
    if (existsSync(eventFile)) {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(eventFile);
    }
  }
}

// Event Factory
export function createEvent(
  sessionId: string,
  type: RunEventType,
  payload: Record<string, unknown>
): RunEvent {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    sessionId,
    payload,
  };
}

// Session State Reconstruction from Events
export function reconstructSessionFromEvents(
  sessionId: string,
  projectRoot: string,
  events: RunEvent[]
): SessionState {
  // Start with minimal session
  let session: SessionState = {
    id: sessionId,
    projectRoot,
    title: 'New session',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    status: 'idle',
  };
  
  const messages: ConversationMessage[] = [];
  const toolCallsById = new Map<string, ToolCall>();
  
  for (const event of events) {
    switch (event.type) {
      case 'user.prompt': {
        const msg: ConversationMessage = {
          id: randomUUID(),
          role: 'user',
          content: event.payload.content as string,
          timestamp: new Date(event.timestamp),
        };
        messages.push(msg);
        break;
      }
      case 'assistant.started': {
        const msg: ConversationMessage = {
          id: randomUUID(),
          role: 'assistant',
          content: '',
          timestamp: new Date(event.timestamp),
          agent: event.payload.agent as string,
          toolCalls: [],
        };
        messages.push(msg);
        break;
      }
      case 'assistant.text.delta': {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.content += event.payload.delta as string;
        }
        break;
      }
      case 'tool.called': {
        const toolCall: ToolCall = {
          id: event.payload.toolCallId as string,
          name: event.payload.name as string,
          arguments: event.payload.arguments as Record<string, unknown>,
          status: 'pending',
          startedAt: event.timestamp,
        };
        toolCallsById.set(toolCall.id, toolCall);
        
        // Attach to last assistant message
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.toolCalls = lastMsg.toolCalls ?? [];
          lastMsg.toolCalls.push(toolCall);
        }
        break;
      }
      case 'tool.started': {
        const tc = toolCallsById.get(event.payload.toolCallId as string);
        if (tc) {
          tc.status = 'running';
          tc.startedAt = event.timestamp;
        }
        break;
      }
      case 'tool.output.delta': {
        // Streaming output - could update UI
        break;
      }
      case 'tool.completed': {
        const tc = toolCallsById.get(event.payload.toolCallId as string);
        if (tc) {
          tc.status = 'completed';
          tc.completedAt = event.timestamp;
          tc.result = event.payload.result as ToolResult;
          tc.metadata = event.payload.metadata as ToolCallMetadata;
        }
        // Add tool result message
        const resultMsg: ConversationMessage = {
          id: randomUUID(),
          role: 'tool',
          content: formatToolResultForModel(event.payload.result as ToolResult),
          timestamp: new Date(event.timestamp),
          toolCallId: event.payload.toolCallId as string,
        };
        messages.push(resultMsg);
        break;
      }
      case 'tool.failed': {
        const tc = toolCallsById.get(event.payload.toolCallId as string);
        if (tc) {
          tc.status = 'failed';
          tc.completedAt = event.timestamp;
          tc.error = event.payload.error as string;
          tc.metadata = event.payload.metadata as ToolCallMetadata;
        }
        // Add tool error message
        const errorMsg: ConversationMessage = {
          id: randomUUID(),
          role: 'tool',
          content: `Tool failed: ${event.payload.error}`,
          timestamp: new Date(event.timestamp),
          toolCallId: event.payload.toolCallId as string,
        };
        messages.push(errorMsg);
        break;
      }
      case 'assistant.continued': {
        // Model continues after tool results
        break;
      }
      case 'run.completed': {
        session.status = 'completed';
        session.taskState = event.payload.taskState as TaskState;
        break;
      }
      case 'run.failed': {
        session.status = 'interrupted';
        session.taskState = event.payload.taskState as TaskState;
        break;
      }
      case 'run.paused': {
        session.status = 'interrupted';
        session.taskState = event.payload.taskState as TaskState;
        break;
      }
      case 'checkpoint.created': {
        if (session.taskState) {
          session.taskState.checkpointId = event.payload.checkpointId as string;
        }
        break;
      }
      case 'checkpoint.restored': {
        // Task state restored
        break;
      }
      case 'compact.triggered': {
        // Conversation was compacted
        break;
      }
      case 'model.switched': {
        session.model = event.payload.model as string;
        break;
      }
    }
  }
  
  // Set title from first user message
  const firstUser = messages.find(m => m.role === 'user');
  if (firstUser) {
    session.title = firstUser.content.replace(/\s+/g, ' ').slice(0, 80);
  }
  
  session.messages = messages;
  return session;
}

function formatToolResultForModel(result: ToolResult): string {
  const lines = [
    `Tool: ${result.command ?? 'unknown tool'}`,
    `Status: ${result.success ? 'success' : 'failure'}`,
    result.command ? `Command: ${result.command}` : '',
    result.cwd ? `Working directory: ${result.cwd}` : '',
    result.exitCode !== undefined ? `Exit code: ${result.exitCode ?? 'unknown'}` : '',
    result.stdout ? `stdout:\n${result.stdout}` : '',
    result.stderr ? `stderr:\n${result.stderr}` : '',
    result.output && !result.stdout && !result.stderr ? `Output:\n${result.output}` : '',
    !result.success ? `Error:\n${result.error?.trim() || 'The tool reported a failure without details.'}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

// Event Subscriber for UI
export type EventSubscriber = (event: RunEvent) => void;

export class EventBus {
  private subscribers: Set<EventSubscriber> = new Set();
  private eventStore: EventStore;
  
  constructor(eventStore: EventStore) {
    this.eventStore = eventStore;
  }
  
  subscribe(subscriber: EventSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }
  
  async publish(event: RunEvent): Promise<void> {
    await this.eventStore.append(event);
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch {
        // Ignore subscriber errors
      }
    }
  }
  
  async replay(sessionId: string, fromCursor?: string): Promise<void> {
    const events = fromCursor 
      ? await this.eventStore.getEventsSince(sessionId, fromCursor)
      : await this.eventStore.getEvents(sessionId);
    
    for (const event of events) {
      for (const subscriber of this.subscribers) {
        try {
          subscriber(event);
        } catch {
          // Ignore
        }
      }
    }
  }
}