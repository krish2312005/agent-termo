// =============================================================================
// Nvidia NIM LLM Client — Stepfun + OpenAI-compatible models
// =============================================================================

import OpenAI from 'openai';
import type { ToolCall, ConversationMessage, ToolDef, TokenUsage } from '../types/index.js';
import { mergeModels, type ModelInfo } from './models.js';

type NIMTool = OpenAI.Chat.ChatCompletionTool;

export type ThinkingCapacity = 'off' | 'auto' | 'low' | 'medium' | 'high';

const TOOL_NAME_ALIASES: Record<string, string> = {
	'file:read': 'file_read',
	'file:write': 'file_write',
	'file:edit': 'file_edit',
	'file:delete': 'file_delete',
	'file:glob': 'file_glob',
	'grep': 'grep',
	'bash:execute': 'bash_execute',
	'git:status': 'git_status',
	'git:commit': 'git_commit',
	'git:push': 'git_push',
	'git:log': 'git_log',
	'agent:delegate': 'agent_delegate',
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

/**
 * Parse JSON tool calls a model may emit as plain text instead of native
 * tool_calls, e.g. {"tool_calls":[{"name":"file:write","arguments":{...}}]}.
 * Also accepts a bare array and a single {"name","arguments"} object.
 */
export function parseToolCallsFromText(text: string): ToolCall[] {
	let cleaned = (text ?? '').trim();
	cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
	if (!cleaned) return [];

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
	if (!parsed || typeof parsed !== 'object') return [];

	const container = parsed as { tool_calls?: unknown; toolCalls?: unknown; name?: unknown; arguments?: unknown; parameters?: unknown; input?: unknown; function?: { name?: unknown; arguments?: unknown } };
	const isSingleCall = Boolean(
		(container.name && (container.arguments !== undefined || container.parameters !== undefined || container.input !== undefined)) ||
		(container.function?.name && container.function.arguments !== undefined),
	);
	const rawCalls: unknown[] = Array.isArray(parsed)
		? parsed
		: Array.isArray(container.tool_calls)
			? container.tool_calls
			: Array.isArray(container.toolCalls)
				? container.toolCalls
				: isSingleCall
					? [container]
					: [];

	const calls: ToolCall[] = [];
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
		calls.push({ id: typeof tc.id === 'string' && tc.id ? tc.id : crypto.randomUUID(), name, arguments: args });
	}
	return calls;
}

export class NimClient {
	private client: OpenAI;
	private model: string;
	private thinkingCapacity: ThinkingCapacity;
	private activeController: AbortController | null = null;
	private usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  constructor(_projectRoot?: string) {
    const apiKey = process.env.NIM_API_KEY ?? '';
    const baseUrl = process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
	    this.model = process.env.NIM_MODEL ?? 'stepfun-ai/step-3.7-flash';
	    const thinking = process.env.NIM_THINKING;
	    this.thinkingCapacity = thinking === 'off' || thinking === 'low' || thinking === 'medium' || thinking === 'high' || thinking === 'auto' ? thinking : 'auto';
    const timeout = parseInt(process.env.LLM_TIMEOUT ?? '120000', 10);

    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout,
      defaultHeaders: { 'User-Agent': 'agent-termo/1.0' },
    });
  }

  buildToolDefs(toolSchemas: ToolDef[]): NIMTool[] {
    return toolSchemas.map((t) => ({
      type: 'function' as const,
      function: {
			name: toWireToolName(t.name),
        description: t.description,
        parameters: t.parameters as unknown as NIMTool['function']['parameters'],
      },
    })) as NIMTool[];
  }

	getModel(): string {
		return this.model;
	}

	getThinkingCapacity(): ThinkingCapacity {
		return this.thinkingCapacity;
	}

	getUsage(): TokenUsage {
		return { ...this.usage };
	}

	formatUsage(): string {
		return `${this.usage.totalTokens.toLocaleString()} tokens`;
	}

	private recordUsage(promptTokens: number, completionTokens: number): void {
		this.usage.promptTokens += Math.max(0, Math.round(promptTokens));
		this.usage.completionTokens += Math.max(0, Math.round(completionTokens));
		this.usage.totalTokens = this.usage.promptTokens + this.usage.completionTokens;
	}

	private estimatePromptTokens(messages: ConversationMessage[]): number {
		return Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 4);
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
	      const page = await this.client.models.list({ timeout: 10_000, signal: controller.signal });
      const ids = page.data.map((m) => m.id);
      if (ids.length === 0) throw new Error('empty model list');
      return { models: mergeModels(ids), live: true };
    } catch (err) {
	      return {
	        models: mergeModels(null),
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
	async *streamComplete(
		messages: ConversationMessage[],
		tools?: NIMTool[],
		onChunk?: (text: string) => void,
	): AsyncGenerator<{ content: string; toolCalls: ToolCall[] }, void, unknown> {
			const rawChunks: string[] = [];
			const toolCallMap: Map<number, { id: string; name: string; arguments: string }> = new Map();
		const controller = new AbortController();
		this.activeController = controller;

		const stream = await this.client.chat.completions.create({
      model: this.model,
		messages: messages.map((m) => {
				if (m.role === 'tool') {
					return {
						role: 'tool' as const,
						content: m.content,
					tool_call_id: m.id,
				};
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
				return {
	          role: m.role as 'system' | 'user' | 'assistant',
	          content: this.messageContent(m),
	        };
      }),
      tools: tools,
      temperature: 0.3,
			max_tokens: 8192,
			stream: true,
		}, { signal: controller.signal });

	    for await (const chunk of stream) {
	      const delta = chunk.choices[0]?.delta;

	      if (!delta) continue;
      // Text delta — filter out "null" chunks (Stepfun's reasoning output)
      const rawContent = delta.content ?? '';
      // Check: if it's the literal string "null", it's reasoning noise — skip it
      const isNoise = rawContent === 'null' || rawContent === 'undefined';
      if (!isNoise && rawContent) {
        rawChunks.push(rawContent);
        onChunk?.(rawContent);
      }

      // Tool call deltas (accumulate across chunks via index)
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const prev = toolCallMap.get(idx);
          const nameChunk = tc.function?.name ?? '';
          if (!prev) {
            toolCallMap.set(idx, {
              id: tc.id ?? crypto.randomUUID(),
              name: nameChunk,
              arguments: tc.function?.arguments ?? '',
            });
          } else {
            prev.arguments += tc.function?.arguments ?? '';
            if (nameChunk && !prev.name.endsWith(nameChunk)) prev.name += nameChunk;
          }
        }
      }
    }

    // For streaming: content is accumulated in rawChunks (null chunks already filtered)
    // For non-streaming (complete() method): reasoning stripping happens in that method
	    const finalContent = rawChunks.join('');
		this.recordUsage(this.estimatePromptTokens(messages), Math.ceil(finalContent.length / 4));

    // Extract tool calls
    const toolCalls: ToolCall[] = Array.from(toolCallMap.values()).map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(tc.arguments) as unknown;
        args = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { _raw: tc.arguments };
      } catch {
        args = { _raw: tc.arguments };
      }
			return { id: tc.id, name: fromWireToolName(tc.name), arguments: args };
    });

		if (this.activeController === controller) this.activeController = null;
		yield { content: finalContent, toolCalls };
  }

  /**
   * Non-streaming completion — for when streaming fails or for retries.
   */
	async complete(
		messages: ConversationMessage[],
		tools?: NIMTool[],
	): Promise<{ content: string; toolCalls: ToolCall[] }> {
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
		max_tokens: 8192,
			stream: false,
		}, { signal: controller.signal });

		const msg = response.choices[0]?.message;
		const responseUsage = response.usage;
		if (responseUsage) this.recordUsage(responseUsage.prompt_tokens ?? 0, responseUsage.completion_tokens ?? 0);
		else this.recordUsage(this.estimatePromptTokens(messages), Math.ceil((msg?.content?.length ?? 0) / 4));
    // Strip reasoning noise
    let content =
      msg?.content?.replace(
	        /\[ Reasoning[^\]]*\][^[]*\[\/ Reasoning\][^\n]*/gi,
        '',
      ).trim() ?? '';

    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(tc.function.arguments ?? '{}') as unknown;
        args = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { _raw: String(parsed) };
      } catch {
        args = { _raw: tc.function.arguments };
      }
			return { id: tc.id, name: fromWireToolName(tc.function.name), arguments: args };
    });

    // If no native tool calls, parse JSON tool calls emitted as text.
    if (toolCalls.length === 0) {
      const parsedCalls = parseToolCallsFromText(content);
      if (parsedCalls.length > 0) {
        toolCalls.push(...parsedCalls);
        // Remove the JSON payload from the visible response.
        const marker = content.indexOf('"tool_calls"');
        const start = marker !== -1 ? content.lastIndexOf('{', marker) : content.trimStart().startsWith('[') ? content.indexOf('[') : content.lastIndexOf('{');
        if (start !== -1) content = content.slice(0, start).trim();
      }
    }

		if (this.activeController === controller) this.activeController = null;
		return { content, toolCalls };
  }
}

export { type ToolDef } from '../types/index.js';
