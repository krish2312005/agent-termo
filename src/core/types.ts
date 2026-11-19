// =============================================================================
// Agent-Termo Core Types — OpenCode-style durable event-driven architecture
// =============================================================================

export type Role = 'system' | 'user' | 'assistant' | 'tool';

// Thinking Capacity
export type ThinkingCapacity = 'off' | 'auto' | 'low' | 'medium' | 'high';

// Tool Lifecycle States (durable, persisted)
export type ToolCallStatus =
  | 'pending'    // Tool call created, awaiting execution
  | 'running'    // Tool is currently executing
  | 'completed'  // Tool finished successfully
  | 'failed'     // Tool failed with error
  | 'interrupted'; // Tool was interrupted (user cancel, timeout, etc.)

// Tool Call with durable lifecycle
export interface ToolCall {
  id: string;                    // Stable ID across restarts
  name: string;                  // Tool name (e.g., "bash:execute")
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  startedAt?: string;            // ISO timestamp
  completedAt?: string;          // ISO timestamp
  result?: ToolResult;           // Final result (when completed/failed)
  error?: string;                // Error message (when failed/interrupted)
  metadata?: ToolCallMetadata;   // Additional execution metadata
}

export interface ToolCallMetadata {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  truncated?: boolean;
  fullOutputPath?: string;       // Path to full output file if truncated
  command?: string;
  cwd?: string;
}

// Tool Result returned to model
export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  command?: string;
  cwd?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  durationMs: number;
}

// Conversation Message (includes tool calls/results)
export interface ConversationMessage {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  agent?: string;
  toolCalls?: ToolCall[];        // For assistant messages with tool calls
  toolCallId?: string;           // For tool messages, links to tool call
}

// Session State
export type SessionStatus = 'idle' | 'running' | 'interrupted' | 'completed';

export interface SessionState {
  id: string;
  projectRoot: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  parentId?: string;
  messages: ConversationMessage[];
  status: SessionStatus;
  currentGoal?: string;
  activeAgentName?: string;
  model?: string;
  thinkingCapacity?: string;
  taskState?: TaskState;
  taskPlan?: TaskPlan;
}

// Task State (for continuation)
export interface TaskState {
  goal: string;
  status: 'idle' | 'running' | 'interrupted';
  reason: string;
  lastActions: string[];
  completedOperations: string[];
  checkpointId?: string;
}

// Run Events (event sourcing)
export type RunEventType =
  | 'user.prompt'
  | 'assistant.started'
  | 'assistant.text.delta'
  | 'assistant.text.done'
  | 'tool.called'
  | 'tool.started'
  | 'tool.output.delta'
  | 'tool.completed'
  | 'tool.failed'
  | 'assistant.continued'
  | 'run.paused'
  | 'run.completed'
  | 'run.failed'
  | 'permission.requested'
  | 'permission.granted'
  | 'permission.denied'
  | 'checkpoint.created'
  | 'checkpoint.restored'
  | 'compact.triggered'
  | 'model.switched';

export interface RunEvent {
  id: string;
  type: RunEventType;
  timestamp: string;
  sessionId: string;
  payload: Record<string, unknown>;
}

// Permission System
export type PermissionMode = 'ask' | 'files' | 'auto';

export interface PermissionRequest {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  resource: string;           // e.g., "file:src/main.ts", "command:npm test"
  action: 'read' | 'write' | 'execute' | 'delete';
  timestamp: string;
}

export interface PermissionDecision {
  requestId: string;
  decision: 'allow' | 'deny' | 'always';
  timestamp: string;
}

// Provider-native tool execution
export interface ProviderToolDef {
  name: string;
  description: string;
  parameters: ToolParameter;
}

// ToolDef for OpenAI function calling schema (backward compatible)
export interface ToolDef {
  name: string;
  description: string;
  parameters: ToolParameter;
}

export interface ToolParameter {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolParameterProperty {
  type: string;
  description?: string;
  default?: unknown;
  enum?: string[];
}

// Tool Registry Entry
export interface ToolRegistryEntry {
  name: string;
  description: string;
  parameters: ToolParameter;
  execute: ToolExecutor;
  permissions: ToolPermissions;
}

export interface ToolPermissions {
  required: PermissionRequest['action'][];
  resources: string[];  // Patterns like "file:*", "command:*"
}

export type ToolExecutor = (
  args: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<ToolResult>;

export interface ToolExecutionContext {
  projectRoot: string;
  sessionId: string;
  toolCallId: string;
  signal: AbortSignal;
  onOutput?: (output: ToolOutputDelta) => void;
  permissions: PermissionMode;
  allowedCommands: Set<string>;
}

export interface ToolOutputDelta {
  type: 'stdout' | 'stderr' | 'exit' | 'metadata';
  data: string | number | Record<string, unknown>;
}

// Completion Verification
export interface VerificationResult {
  ok: boolean;
  issues: VerificationIssue[];
  evidence: VerificationEvidence;
}

export interface VerificationIssue {
  type: 'missing_test' | 'stub_implementation' | 'type_error' | 'lint_error' | 'build_failure' | 'custom';
  message: string;
  file?: string;
  line?: number;
  severity: 'error' | 'warning' | 'info';
}

export interface VerificationEvidence {
  filesWritten: Map<string, string>;    // path -> content
  commandsRun: string[];
  checksPassed: string[];
  checksFailed: string[];
}

// Task Plan
export interface TaskPlan {
  id: string;
  title: string;
  summary: string;
  request: string;
  status: 'draft' | 'approved' | 'in_progress' | 'completed' | 'cancelled' | 'saved';
  steps: TaskStep[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskStep {
  id: number;
  title: string;
  description: string;
  affectedFiles: string[];
  risks: string[];
  dependsOn: number[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  summary?: string;
}

// Agent Definition
export interface Agent {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];  // Tool names this agent can use
}

// Model Info
export interface ModelInfo {
  id: string;
  note?: string;
}

// Token Usage
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// LLM Response
export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  usage?: TokenUsage;
}

// Session Engine Interface
export interface SessionEngine {
  getState(): SessionState;
  getEvents(): Promise<RunEvent[]>;
  initialize(): Promise<void>;
  save(): Promise<void>;
  fork(): Promise<SessionEngine>;
  addUserMessage(content: string): Promise<void>;
  addAssistantMessage(content: string, toolCalls?: ToolCall[]): Promise<void>;
  addToolResult(toolCallId: string, result: ToolResult): Promise<void>;
  executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  run(userInput: string): Promise<RunResult>;
  continue(): Promise<RunResult>;
  pause(reason: string): Promise<void>;
  setModel(model: string): void;
  setThinkingCapacity(capacity: string): void;
  setPermissionMode(mode: 'ask' | 'files' | 'auto'): void;
  subscribe(subscriber: (event: RunEvent) => void): () => void;
  destroy(): Promise<void>;
}

export interface RunResult {
  success: boolean;
  content?: string;
  toolCalls?: ToolCall[];
  error?: string;
  interrupted?: boolean;
  verification?: VerificationResult;
}

// Configuration
export interface AppConfig {
  nimApiKey: string;
  nimBaseUrl: string;
  nimModel: string;
  agentTermoDir: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  confirmDestructive: boolean;
  allowedCommands: string[];
  llmTimeout: number;
  bashTimeout: number;
}