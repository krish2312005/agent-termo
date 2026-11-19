// =============================================================================
// Session Engine — Durable session management with event sourcing
// =============================================================================

import {
  SessionState,
  SessionStatus,
  ConversationMessage,
  ToolCall,
  ToolResult,
  TaskState,
  TaskPlan,
  RunEvent,
  SessionEngine,
  RunResult,
} from './types.js';
import { EventBus, FileEventStore, FileSessionStore, createEvent, reconstructSessionFromEvents } from './events.js';
import { ToolRegistry, createBuiltinTools, PermissionChecker } from './tools.js';
import { randomUUID } from 'node:crypto';

export interface SessionEngineOptions {
  projectRoot: string;
  sessionId?: string;
  model?: string;
  thinkingCapacity?: string;
  permissionMode?: 'ask' | 'files' | 'auto';
  allowedCommands?: Set<string>;
  customTools?: ToolRegistryEntry[];
}

import { ToolRegistryEntry, ToolExecutionContext } from './types.js';

// Main Session Engine Implementation
export class DefaultSessionEngine implements SessionEngine {
  private projectRoot: string;
  private sessionId: string;
  private eventStore: FileEventStore;
  private sessionStore: FileSessionStore;
  private eventBus: EventBus;
  private toolRegistry: ToolRegistry;
  private permissionChecker: PermissionChecker;
  
  // Current state
  private state: SessionState;
  private currentGoal: string = '';
  private activeAgentName: string = '';
  private model: string;
  private thinkingCapacity: string;
  private permissionMode: 'ask' | 'files' | 'auto';
  private allowedCommands: Set<string>;
  private taskState: TaskState | undefined;
  private taskPlan: TaskPlan | undefined;
  private status: SessionStatus = 'idle';
  
  // Run state
  private abortController: AbortController | null = null;
  private isRunning = false;
  
  constructor(options: SessionEngineOptions) {
    this.projectRoot = options.projectRoot;
    this.sessionId = options.sessionId ?? randomUUID();
    this.model = options.model ?? 'stepfun-ai/step-3.7-flash';
    this.thinkingCapacity = options.thinkingCapacity ?? 'auto';
    this.permissionMode = options.permissionMode ?? 'ask';
    this.allowedCommands = options.allowedCommands ?? new Set();
    
    // Initialize stores
    this.eventStore = new FileEventStore(this.projectRoot);
    this.sessionStore = new FileSessionStore(this.projectRoot);
    this.eventBus = new EventBus(this.eventStore);
    
    // Initialize tool registry
    this.toolRegistry = new ToolRegistry(this.eventBus, this.sessionId);
    const builtinTools = createBuiltinTools(this.projectRoot);
    for (const tool of builtinTools) {
      this.toolRegistry.register(tool);
    }
    if (options.customTools) {
      for (const tool of options.customTools) {
        this.toolRegistry.register(tool);
      }
    }
    
    // Initialize permission checker
    this.permissionChecker = new PermissionChecker(
      this.eventBus,
      this.sessionId,
      this.allowedCommands,
      this.permissionMode
    );
    
    // Initialize empty state
    this.state = {
      id: this.sessionId,
      projectRoot: this.projectRoot,
      title: 'New session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      status: 'idle',
    };
  }
  
  async initialize(): Promise<void> {
    // Try to load existing session
    const existing = await this.sessionStore.load(this.sessionId);
    if (existing) {
      this.state = existing;
      this.currentGoal = existing.currentGoal ?? '';
      this.activeAgentName = existing.activeAgentName ?? '';
      this.model = existing.model ?? this.model;
      this.thinkingCapacity = existing.thinkingCapacity ?? this.thinkingCapacity;
      this.taskState = existing.taskState;
      this.taskPlan = existing.taskPlan;
      this.status = existing.status;
      
      // Reconstruct from events for full fidelity
      const events = await this.eventStore.getEvents(this.sessionId);
      if (events.length > 0) {
        this.state = reconstructSessionFromEvents(this.sessionId, this.projectRoot, events);
      }
    } else {
      // Create new session with system prompt
      const systemPrompt = this.buildSystemPrompt();
      this.state.messages = [{
        id: randomUUID(),
        role: 'system',
        content: systemPrompt,
        timestamp: new Date(),
      }];
      await this.save();
    }
  }
  
  getState(): SessionState {
    return this.state;
  }
  
  async getEvents(): Promise<RunEvent[]> {
    return this.eventStore.getEvents(this.sessionId);
  }
  
  async save(): Promise<void> {
    this.state.updatedAt = new Date().toISOString();
    this.state.currentGoal = this.currentGoal || undefined;
    this.state.activeAgentName = this.activeAgentName || undefined;
    this.state.model = this.model;
    this.state.thinkingCapacity = this.thinkingCapacity;
    this.state.taskState = this.taskState;
    this.state.taskPlan = this.taskPlan;
    this.state.status = this.status;
    
    await this.sessionStore.save(this.state);
    await this.eventStore.flush(this.sessionId);
  }
  
  async fork(): Promise<SessionEngine> {
    const forked = new DefaultSessionEngine({
      projectRoot: this.projectRoot,
      model: this.model,
      thinkingCapacity: this.thinkingCapacity,
      permissionMode: this.permissionMode,
      allowedCommands: new Set(this.allowedCommands),
    });
    
    // Copy state
    forked.state = JSON.parse(JSON.stringify(this.state));
    forked.state.id = randomUUID();
    forked.state.parentId = this.sessionId;
    forked.state.title = (this.state.title === 'New session' ? 'Forked session' : this.state.title + ' (fork)').slice(0, 80);
    forked.state.createdAt = new Date().toISOString();
    forked.state.updatedAt = new Date().toISOString();
    forked.sessionId = forked.state.id;
    
    await forked.save();
    return forked;
  }
  
  private buildSystemPrompt(): string {
    let prompt = `You are Agent-Termo, a terminal-based AI coding assistant.

## Working Directory
${this.projectRoot}

## Available Tools
You have access to the following tools. Use them to read, write, and modify files, run commands, and complete tasks.

`;
    
    const tools = this.toolRegistry.getAll();
    for (const tool of tools) {
      prompt += `### ${tool.name}
${tool.description}

`;
    }
    
    if (this.currentGoal) {
      prompt += `\n## Current Goal\n${this.currentGoal}\n`;
    }
    
    if (this.taskPlan?.status === 'in_progress') {
      prompt += `\n## Active Plan\n${this.formatPlan(this.taskPlan)}\n`;
    }
    
    return prompt;
  }
  
  private formatPlan(plan: TaskPlan): string {
    let out = `**${plan.title}**\n${plan.summary}\n\n`;
    for (const step of plan.steps) {
      const status = step.status === 'completed' ? '✓' : step.status === 'in_progress' ? '▶' : '○';
      out += `${status} Step ${step.id}: ${step.title}\n`;
      if (step.description) out += `  ${step.description}\n`;
      if (step.affectedFiles.length > 0) out += `  Files: ${step.affectedFiles.join(', ')}\n`;
    }
    return out;
  }
  
  async addUserMessage(content: string): Promise<void> {
    const message: ConversationMessage = {
      id: randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    
    this.state.messages.push(message);
    await this.eventBus.publish(createEvent(this.sessionId, 'user.prompt', { content }));
    await this.save();
  }
  
  async addAssistantMessage(content: string, toolCalls?: ToolCall[]): Promise<void> {
    const message: ConversationMessage = {
      id: randomUUID(),
      role: 'assistant',
      content,
      timestamp: new Date(),
      agent: this.activeAgentName || undefined,
      toolCalls,
    };
    
    this.state.messages.push(message);
    
    if (toolCalls && toolCalls.length > 0) {
      await this.eventBus.publish(createEvent(this.sessionId, 'assistant.started', {
        agent: this.activeAgentName,
        toolCalls: toolCalls.map(tc => ({ id: tc.id, name: tc.name, arguments: tc.arguments })),
      }));
      
      for (const tc of toolCalls) {
        await this.eventBus.publish(createEvent(this.sessionId, 'tool.called', {
          toolCallId: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        }));
      }
    }
    
    await this.save();
  }
  
  async addToolResult(toolCallId: string, result: ToolResult): Promise<void> {
    const message: ConversationMessage = {
      id: randomUUID(),
      role: 'tool',
      content: this.formatToolResultForModel(result),
      timestamp: new Date(),
      toolCallId,
    };
    
    this.state.messages.push(message);
    
    if (result.success) {
      await this.eventBus.publish(createEvent(this.sessionId, 'tool.completed', {
        toolCallId,
        result,
        metadata: {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          durationMs: result.durationMs,
          command: result.command,
          cwd: result.cwd,
        },
      }));
    } else {
      await this.eventBus.publish(createEvent(this.sessionId, 'tool.failed', {
        toolCallId,
        error: result.error,
        metadata: {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          durationMs: result.durationMs,
          command: result.command,
          cwd: result.cwd,
        },
      }));
    }
    
    await this.save();
  }
  
  private formatToolResultForModel(result: ToolResult): string {
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
  
  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    // Check permissions first
    const entry = this.toolRegistry.get(name);
    if (entry) {
      const permission = await this.permissionChecker.check(
        name,
        args,
        entry.permissions.required[0] || 'execute',
        this.getResourceName(name, args)
      );
      
      if (permission === 'deny') {
        return { success: false, error: 'Permission denied', durationMs: 0 };
      }
    }
    
    const toolCallId = randomUUID();
    const context: ToolExecutionContext = {
      projectRoot: this.projectRoot,
      sessionId: this.sessionId,
      toolCallId,
      signal: this.abortController?.signal ?? new AbortSignal(),
      permissions: this.permissionMode,
      allowedCommands: this.allowedCommands,
    };
    
    return this.toolRegistry.execute(name, args, context);
  }
  
  private getResourceName(toolName: string, args: Record<string, unknown>): string {
    if (toolName.startsWith('file:')) {
      return `file:${args.path}`;
    }
    if (toolName === 'bash:execute') {
      return `command:${args.command}`;
    }
    if (toolName.startsWith('git:')) {
      return `command:${toolName}`;
    }
    return toolName;
  }
  
  async run(userInput: string): Promise<RunResult> {
    if (this.isRunning) {
      return { success: false, error: 'Already running' };
    }
    
    this.isRunning = true;
    this.status = 'running';
    this.abortController = new AbortController();
    
    // Initialize task state
    this.taskState = {
      goal: userInput.slice(0, 300),
      status: 'running',
      reason: '',
      lastActions: [],
      completedOperations: [],
    };
    this.currentGoal = userInput;
    
    await this.addUserMessage(userInput);
    await this.save();
    
    try {
      // This is where the main run loop would go
      // For now, return a placeholder
      const result = await this.runLoop(userInput);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.pause(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }
  
  async continue(): Promise<RunResult> {
    if (!this.taskState || this.taskState.status === 'idle') {
      return { success: false, error: 'Nothing to continue' };
    }
    
    this.taskState.status = 'running';
    this.taskState.reason = '';
    this.status = 'running';
    
    return this.run(this.taskState.goal);
  }
  
  async pause(reason: string): Promise<void> {
    this.status = 'interrupted';
    if (this.taskState) {
      this.taskState.status = 'interrupted';
      this.taskState.reason = reason;
    }
    
    await this.eventBus.publish(createEvent(this.sessionId, 'run.paused', {
      taskState: this.taskState,
      reason,
    }));
    
    await this.save();
  }
  
  private async runLoop(_userInput: string): Promise<RunResult> {
    // This would be the main agent loop
    // For now, return a placeholder
    return {
      success: true,
      content: 'Run loop not yet implemented',
    };
  }
  
  setModel(model: string): void {
    this.model = model;
  }
  
  setThinkingCapacity(capacity: string): void {
    this.thinkingCapacity = capacity;
  }
  
  setPermissionMode(mode: 'ask' | 'files' | 'auto'): void {
    this.permissionMode = mode;
    this.permissionChecker.setMode(mode);
  }
  
  subscribe(subscriber: (event: RunEvent) => void): () => void {
    return this.eventBus.subscribe(subscriber);
  }
  
  async destroy(): Promise<void> {
    await this.save();
    // Cleanup resources
  }
}

// Factory function
export async function createSessionEngine(options: SessionEngineOptions): Promise<SessionEngine> {
  const engine = new DefaultSessionEngine(options);
  await engine.initialize();
  return engine;
}