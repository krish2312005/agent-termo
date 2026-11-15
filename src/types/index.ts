// =============================================================================
// Agent-Termo Type Definitions
// =============================================================================

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
	role: Role;
	content: string;
}

export interface ConversationMessage extends Message {
	id: string;
	timestamp: Date;
	agent?: string; // which agent produced this (for display badge)
	/** Native tool calls attached to an assistant message. Required before tool results. */
	toolCalls?: ToolCall[];
}

export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export interface ToolResult {
	id: string; // matches the ToolCall.id
	name: string;
	success: boolean;
	output?: string;
	error?: string;
	durationMs: number;
}

// ── Diff / Change Review Types ──────────────────────────────────────────────

export type DiffLineType = 'add' | 'remove' | 'context';

export interface DiffLine {
	type: DiffLineType;
	lineNumber: number; // 1-based line number in the proposed file (0 for ellipsis)
	content: string;
}

export interface DiffResult {
	file: string;
	lines: DiffLine[];
	additions: number;
	deletions: number;
}

export interface ProposedFileChange {
	path: string;
	originalContent: string;
	proposedContent: string;
	diff: DiffResult;
	isNewFile: boolean;       // true if file didn't exist before
	isDeletion: boolean;      // true if proposedContent is empty (delete)
}

export type ReviewAction = 'accept' | 'reject' | 'edit' | 'batch';

export interface ReviewPrompt {
	changes: ProposedFileChange[];
	action: ReviewAction;
}

// LLM Types
export interface LLMConfig {
	apiKey: string;
	baseUrl: string;
	model: string;
	timeout: number;
}

export interface LLMResponse {
	content: string;
	finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
	toolCalls: ToolCall[];
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

// Tool Schema Types (OpenAI function calling format)
export interface ToolParameterProperty {
	type: string;
	description?: string;
	default?: unknown;
	enum?: string[];
}

export interface ToolParameter {
	type: 'object';
	properties: Record<string, ToolParameterProperty>;
	required?: string[];
}

export interface ToolDef {
	name: string;
	description: string;
	parameters: ToolParameter;
}

export interface Tool {
	name: string;
	description: string;
	execute(args: Record<string, unknown>): Promise<ToolResult>;
}

// Session
export interface Session {
	id: string;
	projectRoot: string;
	startedAt: Date;
	messages: ConversationMessage[];
	currentAgent: string;
}

// Agent
export interface Agent {
	name: string;
	description: string;
	systemPrompt: string;
	tools: string[]; // tool names this agent can use
}

// UI Types
export interface RenderOptions {
	timestamp?: boolean;
	agentBadge?: string;
	color?: 'user' | 'assistant' | 'error' | 'success' | 'info' | 'warning';
}

export interface InputHistory {
	history: string[];
	index: number;
}

// Config
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
