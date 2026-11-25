// =============================================================================
// Nvidia NIM LLM Client — Stepfun + OpenAI-compatible models
// =============================================================================

import OpenAI from 'openai';
import type { ToolCall, ConversationMessage, ToolDef, TokenUsage } from '../types/index.js';
import { mergeModels, type ModelInfo } from './models.js';
import { estimateContextTokens, recordContextTokenUsage, resolveContextBudget } from '../runtime/context.js';
import { getProviderDefinition, type StoredProviderConfig } from './providers.js';
import { listSavedProviders } from '../utils/config.js';

type NIMTool = OpenAI.Chat.ChatCompletionTool;
type NIMFunctionTool = Extract<NIMTool, { type: 'function' }>;

export type ThinkingCapacity = 'off' | 'auto' | 'low' | 'medium' | 'high';

export interface CompletionRequestOptions {
  requireToolCall?: boolean;
}

const NEMOTRON_3_ULTRA_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';

/** NVIDIA's documented chat-template settings for Nemotron 3 Ultra tool use. */
export function buildNemotronRequestOverrides(model: string, hasTools: boolean, options: CompletionRequestOptions = {}): Record<string, unknown> {
  if (!hasTools || model.toLowerCase() !== NEMOTRON_3_ULTRA_MODEL) return {};
  return {
    ...(options.requireToolCall ? { tool_choice: 'required' } : {}),
    chat_template_kwargs: { enable_thinking: true, force_nonempty_content: true },
  };
}

function resolveToolRequestTimeoutMs(messages: ConversationMessage[], tools: NIMTool[], model: string): number {
  const configured = Number.parseInt(process.env.AGENT_TERMO_TOOL_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(configured) && configured > 0) return Math.min(300_000, Math.max(15_000, configured));
  return Math.min(180_000, 60_000 + Math.ceil(estimateContextTokens(messages, tools, model) / 100_000) * 15_000);
}

const TOOL_NAME_ALIASES: Record<string, string> = {
	'skill:read': 'skill_read',
	'docs:write': 'docs_write',
	'memory:remember': 'memory_remember',
	'file:read': 'file_read',
	'file:write': 'file_write',
	'file:edit': 'file_edit',
	'file:delete': 'file_delete',
	'file:glob': 'file_glob',
	'grep': 'grep',
	'bash:execute': 'bash_execute',
	'bash:start': 'bash_start',
	'bash:read': 'bash_read',
	'bash:stop': 'bash_stop',
	'browser:verify': 'browser_verify',
	'git:status': 'git_status',
	'git:commit': 'git_commit',
	'git:push': 'git_push',
	'git:log': 'git_log',
	'agent:delegate': 'agent_delegate',
	'plan:update': 'plan_update',
};

/** Names other models commonly use for the same actions. */
const EXTRA_TOOL_ALIASES: Record<string, string> = {
	read: 'file:read',
	read_file: 'file:read',
	write: 'file:write',
	write_file: 'file:write',
	create_file: 'file:write',
	edit: 'file:edit',
	edit_file: 'file:edit',
	replace_in_file: 'file:edit',
	delete: 'file:delete',
	delete_file: 'file:delete',
	remove_file: 'file:delete',
	glob: 'file:glob',
	glob_files: 'file:glob',
	list_files: 'file:glob',
	find_files: 'file:glob',
	search: 'grep',
	search_files: 'grep',
	grep_search: 'grep',
	bash: 'bash:execute',
	shell: 'bash:execute',
	run_command: 'bash:execute',
	execute_command: 'bash:execute',
	terminal: 'bash:execute',
	delegate: 'agent:delegate',
	delegate_to_agent: 'agent:delegate',
	// The bundled agent prompts are written Claude Code-style ("Task: <agent>"),
	// so models call these names for the same action.
	task: 'agent:delegate',
	agent: 'agent:delegate',
	subagent: 'agent:delegate',
	spawn_agent: 'agent:delegate',
	spawn_subagent: 'agent:delegate',
	delegate_task: 'agent:delegate',
	plan_update: 'plan:update',
	run_agent: 'agent:delegate',
	invoke_agent: 'agent:delegate',
	call_agent: 'agent:delegate',
	launch_agent: 'agent:delegate',
};

const WIRE_TO_CANONICAL: Record<string, string> = {
	...Object.fromEntries(Object.entries(EXTRA_TOOL_ALIASES)),
	...Object.fromEntries(Object.entries(TOOL_NAME_ALIASES).map(([canonical, wire]) => [wire, canonical])),
};

export function toWireToolName(name: string): string {
	return TOOL_NAME_ALIASES[name] ?? name.replace(/:/g, '_');
}

/** Accepts canonical, wire (`file_read`) and common model names (`read_file`). */
export function fromWireToolName(name: string): string {
	const key = String(name ?? '').trim().toLowerCase().replace(/[.:\-\s]+/g, '_');
	return WIRE_TO_CANONICAL[key] ?? name;
}

const RAW_CONTROL_TOKEN = /<\|(?:open|close|sep)\|>/;
const REPEATED_CLOSING_MESSAGE = /<\|close\|>message<\|sep\|>/g;
const DEGENERATE_REPEAT_THRESHOLD = 6;

/** Non-retryable failure for models that echo raw chat-template tokens as text. */
export class MalformedModelOutputError extends Error {
	readonly retryable = false;

	constructor(message: string) {
		super(message);
		this.name = 'MalformedModelOutputError';
	}
}

export const MALFORMED_MODEL_OUTPUT_MESSAGE =
	'The model emitted raw chat-template tokens instead of a valid tool call and began repeating. ' +
	'This usually means the model does not support tool calling through this endpoint. ' +
	'Switch models (e.g. /model) or use a tool-capable model.';

/**
 * Detect raw chat-template control tokens echoed as plain text with runaway
 * repetition. Native tool-call markup (`<tool_call>`) does not match the
 * control-token pattern, so legitimate markup is never treated as degenerate.
 */
export function isDegenerateModelOutput(text: string): boolean {
	if (!text || !RAW_CONTROL_TOKEN.test(text)) return false;

	let previous = '';
	let run = 0;
	for (const line of text.split(/\r?\n/)) {
		if (line && line === previous) run += 1;
		else {
			previous = line;
			run = line ? 1 : 0;
		}
		if (run >= DEGENERATE_REPEAT_THRESHOLD) return true;
	}

	return (text.match(REPEATED_CLOSING_MESSAGE)?.length ?? 0) >= DEGENERATE_REPEAT_THRESHOLD;
}

function parseMarkupToolCalls(text: string): ToolCall[] {
	const calls: ToolCall[] = [];
	const pattern = /<tool_call>\s*<function=([^>]+)>\s*([\s\S]*?)\s*<\/function>\s*<\/tool_call>/gi;
	for (const match of text.matchAll(pattern)) {
		const body = (match[2] ?? '').trim();
		let args: Record<string, unknown> = {};
		try {
			const parsed = JSON.parse(body) as unknown;
			if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>;
		} catch {
			for (const parameter of body.matchAll(/<parameter(?:\s+name=["']([^"']+)["'])?>([\s\S]*?)<\/parameter>/gi)) {
				args[parameter[1] ?? 'input'] = parameter[2] ?? '';
			}
		}
		calls.push({ id: crypto.randomUUID(), name: fromWireToolName(match[1]!.trim()), arguments: args });
	}
	return calls;
}

function removeToolCallMarkup(text: string): string {
	return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
}

/** Parse adjacent JSON objects/arrays emitted when a model repeats its tool payload. */
function parseAdjacentJsonValues(text: string): unknown[] {
	const values: unknown[] = [];
	let start = -1;
	let closers: string[] = [];
	let inString = false;
	let escaped = false;

	for (let index = 0; index < text.length; index++) {
		const character = text[index]!;
		if (start < 0) {
			if (character === '{' || character === '[') {
				start = index;
				closers = [character === '{' ? '}' : ']'];
			}
			continue;
		}
		if (inString) {
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === '"') inString = false;
			continue;
		}
		if (character === '"') inString = true;
		else if (character === '{') closers.push('}');
		else if (character === '[') closers.push(']');
		else if (character === '}' || character === ']') {
			if (closers.at(-1) !== character) {
				start = -1;
				closers = [];
				continue;
			}
			closers.pop();
			if (closers.length === 0) {
				try {
					values.push(JSON.parse(text.slice(start, index + 1)));
				} catch {
					// Ignore an invalid candidate and continue looking for the next value.
				}
				start = -1;
			}
		}
	}
	return values;
}

/**
 * Parse JSON tool calls a model may emit as plain text instead of native
 * tool_calls, e.g. {"tool_calls":[{"name":"file:write","arguments":{...}}]}.
 * Also accepts a bare array and a single {"name","arguments"} object.
 */
export function parseToolCallsFromText(text: string): ToolCall[] {
	let cleaned = (text ?? '').trim();
	cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
	if (!cleaned) return [];
	const markupCalls = parseMarkupToolCalls(cleaned);
	if (markupCalls.length > 0) return markupCalls;

	const readJson = (value: string): unknown => {
		try {
			return JSON.parse(value);
		} catch {
			const objectStart = value.indexOf('{');
			const objectEnd = value.lastIndexOf('}');
			if (objectStart !== -1 && objectEnd > objectStart) {
				try { return JSON.parse(value.slice(objectStart, objectEnd + 1)); } catch { /* try array */ }
			}
			const arrayStart = value.indexOf('[');
			const arrayEnd = value.lastIndexOf(']');
			if (arrayStart !== -1 && arrayEnd > arrayStart) {
				try { return JSON.parse(value.slice(arrayStart, arrayEnd + 1)); } catch { /* give up */ }
			}
			return undefined;
		}
	};

	const parsed = readJson(cleaned);
	const parsedValues = parsed && typeof parsed === 'object' ? [parsed] : parseAdjacentJsonValues(cleaned);
	if (parsedValues.length === 0) return [];

	const calls: ToolCall[] = [];
	for (const value of parsedValues) {
		const containers = Array.isArray(value) ? value : [value];
		for (const item of containers) {
			if (!item || typeof item !== 'object') continue;
			const container = item as { tool_calls?: unknown; toolCalls?: unknown; name?: unknown; arguments?: unknown; parameters?: unknown; input?: unknown; function?: { name?: unknown; arguments?: unknown } };
			const isSingleCall = Boolean(
				(container.name && (container.arguments !== undefined || container.parameters !== undefined || container.input !== undefined)) ||
				(container.function?.name && container.function.arguments !== undefined),
			);
			const rawCalls: unknown[] = Array.isArray(container.tool_calls)
				? container.tool_calls
				: Array.isArray(container.toolCalls)
					? container.toolCalls
					: isSingleCall
						? [container]
						: Array.isArray(value) ? [container] : [];

			for (const raw of rawCalls) {
				if (!raw || typeof raw !== 'object') continue;
				const tc = raw as { id?: unknown; name?: unknown; arguments?: unknown; parameters?: unknown; input?: unknown; function?: { name?: unknown; arguments?: unknown } };
				const name = fromWireToolName(String(tc.name ?? tc.function?.name ?? ''));
				if (!name) continue;
				const rawArgs = tc.arguments ?? tc.parameters ?? tc.input ?? tc.function?.arguments ?? {};
				let args: Record<string, unknown> = {};
				if (typeof rawArgs === 'string') {
					try {
						const parsedArgs = JSON.parse(rawArgs) as unknown;
						args = parsedArgs && typeof parsedArgs === 'object' ? (parsedArgs as Record<string, unknown>) : { _raw: rawArgs };
					} catch { args = { _raw: rawArgs }; }
				} else if (rawArgs && typeof rawArgs === 'object') {
					args = rawArgs as Record<string, unknown>;
				}
				let id = typeof tc.id === 'string' && tc.id ? tc.id : crypto.randomUUID();
				const duplicate = calls.find((call) => call.id === id);
				if (duplicate) {
					if (duplicate.name === name && JSON.stringify(duplicate.arguments) === JSON.stringify(args)) continue;
					id = id + '-' + calls.length;
				}
				calls.push({ id, name, arguments: args });
			}
		}
	}
	return calls;
}

/**
 * Lines that may begin a tool call a model emitted as plain text. Models that
 * do not support native tool calling print JSON like {"tool_calls":[...]};
 * this keeps it out of the visible transcript while the runtime still parses
 * and executes the call.
 */
const TOOL_JSON_START = /^[\[{]\s*"(?:tool_calls|toolCalls|name|function)"/;

function isBalancedJson(text: string): boolean {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (const ch of text) {
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') inString = true;
		else if (ch === '{' || ch === '[') depth++;
		else if (ch === '}' || ch === ']') depth--;
	}
	return depth === 0 && !inString;
}

/**
 * Streaming filter that suppresses JSON tool-call payloads from visible text.
 * Works line by line and also holds multi-line (pretty-printed) JSON until it
 * is complete. Non-tool JSON and normal prose pass through unchanged.
 */
export class ToolCallTextFilter {
	private partialLine = '';
	private pending = '';

	push(chunk: string): string {
		this.partialLine += chunk;
		let out = '';
		let newline = this.partialLine.indexOf('\n');
		while (newline !== -1) {
			const line = this.partialLine.slice(0, newline);
			this.partialLine = this.partialLine.slice(newline + 1);
			out += this.acceptLine(line);
			newline = this.partialLine.indexOf('\n');
		}
		return out;
	}

	flush(): string {
		let out = '';
		if (this.partialLine) {
			out += this.acceptLine(this.partialLine);
			this.partialLine = '';
		}
		if (this.pending) out += this.finishPending();
		return out;
	}

	private acceptLine(line: string): string {
		const trimmed = line.trim();
		if (this.pending) {
			this.pending += '\n' + line;
			return isBalancedJson(this.pending) ? this.finishPending() : '';
		}
		if (!trimmed || !TOOL_JSON_START.test(trimmed)) {
			// A bare opener may start a multi-line (pretty-printed) JSON payload.
			if (/^[\[{]$/.test(trimmed)) {
				this.pending = line;
				return '';
			}
			return line + '\n';
		}
		if (isBalancedJson(trimmed)) return parseToolCallsFromText(trimmed).length > 0 ? '' : line + '\n';
		this.pending = line;
		return '';
	}

	private finishPending(): string {
		const block = this.pending;
		this.pending = '';
		return parseToolCallsFromText(block).length > 0 ? '' : block;
	}
}

/** Remove recognized JSON tool-call payloads from a completed response. */
export function stripToolCallJson(text: string): string {
	if (!text) return text;
	const filter = new ToolCallTextFilter();
	return filter.push(text) + filter.flush();
}


export interface StreamedToolCallDelta {
  index?: number;
  id?: string | null;
  function?: { name?: string | null; arguments?: string | null };
}

/** Accumulates provider tool-call fragments without assuming chunk boundaries. */
export class ToolCallStreamAccumulator {
  private readonly calls = new Map<number, { id?: string; name: string; arguments: string }>();

  add(delta: StreamedToolCallDelta): void {
    const index = Number.isInteger(delta.index) ? delta.index! : 0;
    const current = this.calls.get(index) ?? { name: '', arguments: '' };
    if (delta.id) current.id = delta.id;
    current.name += delta.function?.name ?? '';
    current.arguments += delta.function?.arguments ?? '';
    this.calls.set(index, current);
  }

  toToolCalls(): ToolCall[] {
    return [...this.calls.entries()].sort(([a], [b]) => a - b).flatMap(([, call]) => {
      if (!call.name) return [];
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(call.arguments || '{}') as unknown;
        args = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : { _raw: call.arguments };
      } catch {
        args = { _raw: call.arguments };
      }
      return [{ id: call.id ?? crypto.randomUUID(), name: fromWireToolName(call.name), arguments: args }];
    });
  }
}

export class NimClient {
	private client: OpenAI;
	private provider: StoredProviderConfig;
	private model: string;
	private thinkingCapacity: ThinkingCapacity;
	private activeController: AbortController | null = null;
	private usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
	private inFlightUsage: TokenUsage | null = null;
	private inFlightEstimatedPromptTokens = 0;
	private inFlightModel = '';

  constructor(_projectRoot?: string) {
    const inferredProvider = [
      ['ANTHROPIC_API_KEY', 'anthropic'],
      ['OPENROUTER_API_KEY', 'openrouter'],
      ['OPENAI_API_KEY', 'openai'],
      ['GEMINI_API_KEY', 'google'],
      ['GOOGLE_API_KEY', 'google'],
      ['DEEPSEEK_API_KEY', 'deepseek'],
      ['GROQ_API_KEY', 'groq'],
      ['MISTRAL_API_KEY', 'mistral'],
      ['XAI_API_KEY', 'xai'],
      ['TOGETHER_API_KEY', 'together'],
      ['FIREWORKS_API_KEY', 'fireworks'],
      ['CEREBRAS_API_KEY', 'cerebras'],
    ].find(([key]) => Boolean(process.env[key!]?.trim()))?.[1];
    const providerId = process.env.AGENT_TERMO_PROVIDER ?? inferredProvider ?? 'nvidia';
    const saved = listSavedProviders().find((item) => item.id === providerId);
    const definition = getProviderDefinition(providerId) ?? getProviderDefinition('custom')!;
    const isNim = providerId === 'nvidia';
    const providerEnvKey = process.env[providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_API_KEY']
      ?? (providerId === 'google' ? process.env.GEMINI_API_KEY : undefined);
    const apiKey = process.env.AGENT_TERMO_API_KEY ?? saved?.apiKey ?? providerEnvKey ?? (isNim ? process.env.NIM_API_KEY : '') ?? '';
    const baseUrl = process.env.AGENT_TERMO_BASE_URL ?? saved?.baseUrl ?? (isNim ? process.env.NIM_BASE_URL : undefined) ?? definition.baseUrl;
    const model = process.env.AGENT_TERMO_MODEL ?? saved?.model ?? (isNim ? process.env.NIM_MODEL : undefined) ?? definition.suggestedModels[0] ?? '';
    this.provider = { ...definition, apiKey, baseUrl, model };
    this.model = model;
    const thinking = process.env.NIM_THINKING;
    this.thinkingCapacity = thinking === 'off' || thinking === 'low' || thinking === 'medium' || thinking === 'high' || thinking === 'auto' ? thinking : 'auto';
    const timeout = parseInt(process.env.LLM_TIMEOUT ?? '120000', 10);
    this.client = this.createOpenAIClient(timeout);
  }

  private createOpenAIClient(timeout = parseInt(process.env.LLM_TIMEOUT ?? '120000', 10)): OpenAI {
    return new OpenAI({
      apiKey: this.provider.apiKey,
      baseURL: this.provider.baseUrl,
      timeout,
      defaultHeaders: { 'User-Agent': 'agent-termo/1.0' },
    });
  }

  getProvider(): StoredProviderConfig {
    return { ...this.provider };
  }

  setProvider(provider: StoredProviderConfig): void {
    this.provider = { ...provider };
    this.model = provider.model;
    this.client = this.createOpenAIClient();
  }

  buildToolDefs(toolSchemas: ToolDef[]): NIMTool[] {
    return toolSchemas.map((t) => ({
      type: 'function' as const,
      function: {
			name: toWireToolName(t.name),
        description: t.description,
			parameters: t.parameters as unknown as NIMFunctionTool['function']['parameters'],
      },
    })) as NIMTool[];
  }

	getModel(): string {
		return this.model;
	}

	getProviderName(): string {
		return this.provider.name;
	}

	getThinkingCapacity(): ThinkingCapacity {
		return this.thinkingCapacity;
	}

	getUsage(): TokenUsage {
		const current = this.inFlightUsage;
		return current
			? {
				promptTokens: this.usage.promptTokens + current.promptTokens,
				completionTokens: this.usage.completionTokens + current.completionTokens,
				totalTokens: this.usage.totalTokens + current.totalTokens,
			}
			: { ...this.usage };
	}

	formatUsage(): string {
		const usage = this.getUsage();
		return `${this.inFlightUsage ? '~' : ''}${usage.totalTokens.toLocaleString()} tokens`;
	}

	private recordUsage(promptTokens: number, completionTokens: number): void {
		this.usage.promptTokens += Math.max(0, Math.round(promptTokens));
		this.usage.completionTokens += Math.max(0, Math.round(completionTokens));
		this.usage.totalTokens = this.usage.promptTokens + this.usage.completionTokens;
	}

	private estimatePromptTokens(messages: ConversationMessage[], tools?: NIMTool[]): number {
		return estimateContextTokens(messages, tools, this.getModel());
	}

	private beginRequestUsage(messages: ConversationMessage[], tools?: NIMTool[]): void {
		const promptTokens = this.estimatePromptTokens(messages, tools);
		this.inFlightEstimatedPromptTokens = promptTokens;
		this.inFlightModel = this.getModel();
		this.inFlightUsage = { promptTokens, completionTokens: 0, totalTokens: promptTokens };
	}

	private updateRequestOutputUsage(completionTokens: number): void {
		if (!this.inFlightUsage) return;
		this.inFlightUsage.completionTokens = Math.max(0, Math.round(completionTokens));
		this.inFlightUsage.totalTokens = this.inFlightUsage.promptTokens + this.inFlightUsage.completionTokens;
	}

	private finishRequestUsage(promptTokens: number, completionTokens: number, exactPromptTokens = false): void {
		if (exactPromptTokens && this.inFlightEstimatedPromptTokens > 0 && promptTokens > 0) {
			recordContextTokenUsage(this.inFlightModel, this.inFlightEstimatedPromptTokens, promptTokens);
		}
		this.recordUsage(promptTokens, completionTokens);
		this.inFlightUsage = null;
		this.inFlightEstimatedPromptTokens = 0;
		this.inFlightModel = '';
	}

	setThinkingCapacity(capacity: ThinkingCapacity): void {
		this.thinkingCapacity = capacity;
	}

	private messageContent(message: ConversationMessage): string {
		if (message.role !== 'system' || this.thinkingCapacity === 'auto') return message.content;
		const instruction: Record<Exclude<ThinkingCapacity, 'auto'>, string> = {
			off: '/no_think',
			low: 'detailed thinking on. Use a short, focused reasoning pass before answering.',
			medium: 'detailed thinking on. Use a moderate reasoning pass before answering.',
			high: 'detailed thinking on. Reason thoroughly before answering, but do not expose private chain-of-thought.',
		};
		return `${message.content}\n\n## Thinking Control\n${instruction[this.thinkingCapacity]}`;
	}

	setModel(model: string): void {
		this.model = model;
		this.provider.model = model;
	}

	cancelCurrentRequest(): void {
		this.activeController?.abort();
	}

	  /**
	   * Fetch the models this API key can use. Never throws: on failure the curated
	   * list is returned with `live: false` and the reason in `error`.
	   */
	  async listModels(): Promise<{ models: ModelInfo[]; live: boolean; error?: string }> {
		const controller = new AbortController();
		this.activeController = controller;
		try {
			let ids: string[];
			if (this.provider.protocol === 'anthropic') {
				const response = await fetch(`${this.provider.baseUrl.endsWith('/') ? this.provider.baseUrl.slice(0, -1) : this.provider.baseUrl}/v1/models?limit=100`, {
					headers: { 'x-api-key': this.provider.apiKey, 'anthropic-version': '2023-06-01' },
					signal: controller.signal,
				});
				if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
				const data = await response.json() as { data?: Array<{ id?: string }> };
				ids = (data.data ?? []).map((item) => item.id ?? '').filter(Boolean);
			} else {
				const page = await this.client.models.list({ timeout: 10_000, signal: controller.signal });
				ids = page.data.map((item) => item.id);
			}
			if (ids.length === 0) throw new Error('empty model list');
			const models = this.provider.id === 'nvidia'
				? mergeModels(ids)
				: ids.sort((a, b) => a.localeCompare(b)).map((id): ModelInfo => ({ id }));
			return { models, live: true };
		} catch (err) {
			const fallback = this.provider.id === 'nvidia'
				? mergeModels(null)
				: this.provider.suggestedModels.map((id): ModelInfo => ({ id }));
			return {
				models: fallback,
				live: false,
				error: err instanceof Error ? err.message : String(err),
			};
		} finally {
			if (this.activeController === controller) this.activeController = null;
		}
	  }

  /**
   * Streaming chat completion.
   * Handles Stepfun's quirks: filters "null" reasoning chunks, strips reasoning field.
   * Yields { content, toolCalls } at the end with clean text.
   */
	/**
	 * Stream assistant text while assembling native tool-call deltas. Tool-call
	 * arguments are parsed only after the provider finishes the complete call.
	 */
	private async *streamAnthropicComplete(
		messages: ConversationMessage[],
		tools?: NIMTool[],
		onChunk?: (text: string) => void,
		onToolCallDelta?: (delta: { index: number; name: string; arguments: string; validJson: boolean }) => void,
	): AsyncGenerator<{ content: string; toolCalls: ToolCall[] }, void, unknown> {
		const controller = new AbortController();
		this.activeController = controller;
		this.beginRequestUsage(messages, tools);
		onChunk?.('');
		let outputCharacters = 0;
		try {
			const system = messages.filter((message) => message.role === 'system').map((message) => this.messageContent(message)).join('\\n\\n');
			const payloadMessages = messages.filter((message) => message.role !== 'system').map((message) => {
				if (message.role === 'tool') return {
					role: 'user',
					content: [{ type: 'tool_result', tool_use_id: message.id, content: message.content }],
				};
				if (message.role === 'assistant' && message.toolCalls?.length) {
					const content: Array<Record<string, unknown>> = [];
					if (message.content) content.push({ type: 'text', text: message.content });
					for (const call of message.toolCalls) content.push({
						type: 'tool_use', id: call.id, name: toWireToolName(call.name), input: call.arguments,
					});
					return { role: 'assistant', content };
				}
				return { role: message.role as 'user' | 'assistant', content: message.content };
			});
			const anthropicTools = tools?.flatMap((tool) => tool.type === 'function' ? [{
				name: tool.function.name,
				description: tool.function.description ?? '',
				input_schema: tool.function.parameters,
			}] : []);
			const response = await fetch(`${this.provider.baseUrl.endsWith('/') ? this.provider.baseUrl.slice(0, -1) : this.provider.baseUrl}/v1/messages`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-api-key': this.provider.apiKey,
					'anthropic-version': '2023-06-01',
				},
				body: JSON.stringify({
					model: this.model,
					max_tokens: resolveContextBudget(this.getModel()).maxOutputTokens,
					...(system ? { system } : {}),
					messages: payloadMessages,
					...(anthropicTools?.length ? { tools: anthropicTools } : {}),
					stream: true,
				}),
				signal: controller.signal,
			});
			if (!response.ok) throw new Error(`Anthropic API HTTP ${response.status}: ${await response.text()}`);
			if (!response.body) throw new Error('Anthropic API returned an empty stream.');
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let content = '';
			let inputTokens = 0;
			let outputTokens = 0;
			const calls = new Map<number, { id: string; name: string; arguments: string }>();
			const processEvent = (raw: string): void => {
				const dataLine = raw.split('\\n').find((line) => line.startsWith('data:'));
				if (!dataLine) return;
				const data = JSON.parse(dataLine.slice(5).trim()) as {
					type?: string; index?: number; error?: { message?: string };
					message?: { usage?: { input_tokens?: number } };
					content_block?: { type?: string; id?: string; name?: string };
					delta?: { type?: string; text?: string; partial_json?: string };
					usage?: { output_tokens?: number };
				};
				if (data.type === 'error') throw new Error(data.error?.message ?? 'Anthropic API stream error.');
				if (data.type === 'message_start') inputTokens = data.message?.usage?.input_tokens ?? 0;
				if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
					calls.set(data.index ?? 0, { id: data.content_block.id ?? crypto.randomUUID(), name: data.content_block.name ?? '', arguments: '' });
				}
				if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
					const text = data.delta.text ?? '';
					content += text;
					outputCharacters += text.length;
					this.updateRequestOutputUsage(Math.ceil(outputCharacters / 4));
					onChunk?.(text);
				}
				if (data.type === 'content_block_delta' && data.delta?.type === 'input_json_delta') {
					const index = data.index ?? 0;
					const call = calls.get(index);
					if (call) {
						const partialJson = data.delta.partial_json ?? '';
						call.arguments += partialJson;
						outputCharacters += partialJson.length;
						this.updateRequestOutputUsage(Math.ceil(outputCharacters / 4));
						let validJson = false;
						try { JSON.parse(call.arguments); validJson = true; } catch { /* more fragments are arriving */ }
						onToolCallDelta?.({ index, name: call.name, arguments: call.arguments, validJson });
					}
				}
				if (data.type === 'message_delta') outputTokens = data.usage?.output_tokens ?? outputTokens;
			};
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				let boundary = buffer.indexOf('\\n\\n');
				while (boundary >= 0) {
					const event = buffer.slice(0, boundary);
					buffer = buffer.slice(boundary + 2);
					if (event.trim()) processEvent(event);
					boundary = buffer.indexOf('\\n\\n');
				}
			}
			buffer += decoder.decode();
			if (buffer.trim()) processEvent(buffer);
			const toolCalls: ToolCall[] = [...calls.values()].map((call) => {
				let args: Record<string, unknown> = {};
				try {
					const parsed = JSON.parse(call.arguments || '{}') as unknown;
					args = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
				} catch { args = { _raw: call.arguments }; }
				return { id: call.id, name: fromWireToolName(call.name), arguments: args };
			});
			this.finishRequestUsage(inputTokens || this.estimatePromptTokens(messages, tools), outputTokens || Math.ceil(outputCharacters / 4), inputTokens > 0);
			yield { content, toolCalls };
		} finally {
			this.inFlightUsage = null;
			if (this.activeController === controller) this.activeController = null;
		}
	}

	async *streamComplete(
		messages: ConversationMessage[],
		tools?: NIMTool[],
		onChunk?: (text: string) => void,
		onToolCallDelta?: (delta: { index: number; name: string; arguments: string; validJson: boolean }) => void,
		requestOptions: CompletionRequestOptions = {},
	): AsyncGenerator<{ content: string; toolCalls: ToolCall[] }, void, unknown> {
		if (this.provider.protocol === 'anthropic') {
			yield* this.streamAnthropicComplete(messages, tools, onChunk, onToolCallDelta);
			return;
		}
		const controller = new AbortController();
		this.activeController = controller;
		this.beginRequestUsage(messages, tools);
		onChunk?.('');
		let outputCharacters = 0;
		let responsePromptTokens = 0;
		let responseCompletionTokens = 0;
		try {
			const stream = await this.client.chat.completions.create({
				model: this.model,
				messages: messages.map((message) => {
					if (message.role === 'tool') {
						return { role: 'tool' as const, content: message.content, tool_call_id: message.id };
					}
					if (message.role === 'assistant' && message.toolCalls?.length) {
						return {
							role: 'assistant' as const,
							content: message.content || null,
							tool_calls: message.toolCalls.map((call) => ({
								id: call.id,
								type: 'function' as const,
								function: { name: toWireToolName(call.name), arguments: JSON.stringify(call.arguments) },
							})),
						};
					}
					return { role: message.role as 'system' | 'user' | 'assistant', content: this.messageContent(message) };
				}),
				tools,
				temperature: 0.3,
				max_tokens: resolveContextBudget(this.getModel()).maxOutputTokens,
				stream: true,
				...(this.provider.id === 'nvidia' ? { stream_options: { include_usage: true } } : {}),
				...buildNemotronRequestOverrides(this.getModel(), Boolean(tools?.length), requestOptions),
			}, {
				signal: controller.signal,
				...(tools?.length ? { timeout: resolveToolRequestTimeoutMs(messages, tools, this.getModel()), maxRetries: 0 } : {}),
			});

			const rawChunks: string[] = [];
			const textFilter = new ToolCallTextFilter();
			const toolCalls = new ToolCallStreamAccumulator();
			const toolCallSnapshots = new Map<number, { name: string; arguments: string }>();
			const startTag = '<tool_call>';
			const endTag = '</tool_call>';
			let pendingText = '';
			let insideMarkupCall = false;

			const emitVisible = (text: string): void => {
				if (!text || text === 'null' || text === 'undefined') return;
				onChunk?.(text);
			};
			const emitTextChunk = (text: string): void => {
				let pending = pendingText + text;
				pendingText = '';
				while (pending.length > 0) {
					if (insideMarkupCall) {
						const end = pending.indexOf(endTag);
						if (end < 0) {
							pendingText = pending.slice(-Math.max(0, endTag.length - 1));
							return;
						}
						pending = pending.slice(end + endTag.length);
						insideMarkupCall = false;
						continue;
					}
					const start = pending.indexOf(startTag);
					if (start >= 0) {
						emitVisible(pending.slice(0, start));
						pending = pending.slice(start + startTag.length);
						insideMarkupCall = true;
						continue;
					}
					let held = Math.min(startTag.length - 1, pending.length);
					while (held > 0 && !startTag.startsWith(pending.slice(-held))) held--;
					if (pending.length > held) emitVisible(pending.slice(0, pending.length - held));
					pendingText = held > 0 ? pending.slice(-held) : '';
					return;
				}
			};

			for await (const chunk of stream) {
				if (chunk.usage) {
					responsePromptTokens = chunk.usage.prompt_tokens ?? responsePromptTokens;
					responseCompletionTokens = chunk.usage.completion_tokens ?? responseCompletionTokens;
				}
				const delta = chunk.choices[0]?.delta;
				if (!delta) continue;
				const rawContent = delta.content ?? '';
				if (rawContent) {
					rawChunks.push(rawContent);
					outputCharacters += rawContent.length;
					this.updateRequestOutputUsage(Math.ceil(outputCharacters / 4));
					const accumulated = rawChunks.join('');
					if (isDegenerateModelOutput(accumulated)) {
						controller.abort();
						throw new MalformedModelOutputError(MALFORMED_MODEL_OUTPUT_MESSAGE);
					}
					const visible = textFilter.push(rawContent);
					if (visible) emitTextChunk(visible);
				}
				if (delta.tool_calls) {
					for (const toolCall of delta.tool_calls) {
						const index = toolCall.index ?? 0;
						toolCalls.add(toolCall);
						const current = toolCallSnapshots.get(index) ?? { name: '', arguments: '' };
						current.name += toolCall.function?.name ?? '';
						const argumentDelta = toolCall.function?.arguments ?? '';
						current.arguments += argumentDelta;
						outputCharacters += argumentDelta.length;
						this.updateRequestOutputUsage(Math.ceil(outputCharacters / 4));
						toolCallSnapshots.set(index, current);
						let validJson = false;
						try {
							JSON.parse(current.arguments);
							validJson = current.arguments.length > 0;
						} catch { /* the arguments are still arriving */ }
						onToolCallDelta?.({ index, ...current, validJson });
					}
				}
			}

			const tailVisible = textFilter.flush();
			if (tailVisible) emitTextChunk(tailVisible);
			if (!insideMarkupCall) emitVisible(pendingText);
			const content = rawChunks.join('');
			this.finishRequestUsage(responsePromptTokens || this.estimatePromptTokens(messages, tools), responseCompletionTokens || Math.ceil(outputCharacters / 4), responsePromptTokens > 0);
			const parsedToolCalls = toolCalls.toToolCalls();
			if (parsedToolCalls.length === 0) parsedToolCalls.push(...parseToolCallsFromText(content));
			const visibleContent = removeToolCallMarkup(stripToolCallJson(content));
			yield { content: visibleContent, toolCalls: parsedToolCalls };
		} finally {
			this.inFlightUsage = null;
			if (this.activeController === controller) this.activeController = null;
		}
	}

  /**
   * Non-streaming completion — for when streaming fails or for retries.
   */
	async complete(
		messages: ConversationMessage[],
		tools?: NIMTool[],
		requestOptions: CompletionRequestOptions = {},
	): Promise<{ content: string; toolCalls: ToolCall[] }> {
		if (this.provider.protocol === 'anthropic') {
			let result = { content: '', toolCalls: [] as ToolCall[] };
			for await (const chunk of this.streamAnthropicComplete(messages, tools)) result = chunk;
			return result;
		}
		const controller = new AbortController();
		this.activeController = controller;
		const response = await this.client.chat.completions.create({
      model: this.model,
		messages: messages.map((m) => {
			if (m.role === 'tool') {
				return { role: 'tool' as const, content: m.content, tool_call_id: m.id };
			}
			if (m.role === 'assistant' && m.toolCalls?.length) {
				return {
					role: 'assistant' as const,
					content: m.content || null,
					tool_calls: m.toolCalls.map((tc) => ({
						id: tc.id,
						type: 'function' as const,
						function: { name: toWireToolName(tc.name), arguments: JSON.stringify(tc.arguments) },
					})),
				};
			}
				return { role: m.role as 'system' | 'user' | 'assistant', content: this.messageContent(m) };
      }),
      tools: tools,
      temperature: 0.3,
		max_tokens: resolveContextBudget(this.getModel()).maxOutputTokens,
			stream: false,
			...buildNemotronRequestOverrides(this.getModel(), Boolean(tools?.length), requestOptions),
		}, {
			signal: controller.signal,
			...(tools?.length ? { timeout: resolveToolRequestTimeoutMs(messages, tools, this.getModel()), maxRetries: 0 } : {}),
		});

		const msg = response.choices[0]?.message;
		const responseUsage = response.usage;
		if (responseUsage) {
			const estimatedPromptTokens = this.estimatePromptTokens(messages, tools);
			if (responseUsage.prompt_tokens > 0) recordContextTokenUsage(this.getModel(), estimatedPromptTokens, responseUsage.prompt_tokens);
			this.recordUsage(responseUsage.prompt_tokens ?? 0, responseUsage.completion_tokens ?? 0);
		} else {
			this.recordUsage(this.estimatePromptTokens(messages, tools), Math.ceil((msg?.content?.length ?? 0) / 4));
		}
    // Strip reasoning noise
    let content =
      msg?.content?.replace(
	        /\[ Reasoning[^\]]*\][^[]*\[\/ Reasoning\][^\n]*/gi,
        '',
      ).trim() ?? '';

		if (isDegenerateModelOutput(content)) {
			if (this.activeController === controller) this.activeController = null;
			throw new MalformedModelOutputError(MALFORMED_MODEL_OUTPUT_MESSAGE);
		}

		const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).flatMap((tc) => {
			if (tc.type !== 'function') return [];
			let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(tc.function.arguments ?? '{}') as unknown;
        args = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { _raw: String(parsed) };
      } catch {
        args = { _raw: tc.function.arguments };
      }
			return [{ id: tc.id, name: fromWireToolName(tc.function.name), arguments: args }];
	    });

    // If no native tool calls, parse JSON tool calls emitted as text.
	    if (toolCalls.length === 0) toolCalls.push(...parseToolCallsFromText(content));
	    content = removeToolCallMarkup(stripToolCallJson(content));

		if (this.activeController === controller) this.activeController = null;
		return { content, toolCalls };
  }
}

export { type ToolDef } from '../types/index.js';
