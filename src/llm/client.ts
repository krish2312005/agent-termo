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
	'bash:execute': 'bash_execute',
	'git:status': 'git_status',
	'git:commit': 'git_commit',
	'git:push': 'git_push',
	'git:log': 'git_log',
	'agent:delegate': 'agent_delegate',
};

export function toWireToolName(name: string): string {
	return TOOL_NAME_ALIASES[name] ?? name.replace(/:/g, '_');
}

export function fromWireToolName(name: string): string {
	return Object.entries(TOOL_NAME_ALIASES).find(([, wireName]) => wireName === name)?.[0] ?? name;
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
		// onReasoning?: (stage: string) => void,
	): AsyncGenerator<{ content: string; toolCalls: ToolCall[] }, void, unknown> {
			const rawChunks: string[] = [];
			const toolCallMap: Map<number, { id: string; name: string; arguments: string }> = new Map();
			// let reasoningAnnounced = false;
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
			// if (!reasoningAnnounced && ('reasoning_content' in delta || 'reasoning' in delta)) {
			// 	reasoningAnnounced = true;
			// 	onReasoning?.('Model is reasoning through the request…');
			// }

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
          if (!prev) {
            toolCallMap.set(idx, {
              id: tc.id ?? crypto.randomUUID(),
              name: tc.function?.name ?? '',
              arguments: tc.function?.arguments ?? '',
            });
          } else {
            prev.arguments += tc.function?.arguments ?? '';
            if (tc.id && !prev.id) prev.id = tc.id;
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
        args = JSON.parse(tc.arguments);
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
		// onReasoning?: (stage: string) => void,
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
		// const rawMessage = msg as (typeof msg & { reasoning_content?: string; reasoning?: string }) | undefined;
		// if (rawMessage?.reasoning_content || rawMessage?.reasoning) onReasoning?.('Model completed a reasoning pass…');
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
        args = JSON.parse(tc.function.arguments ?? '{}');
      } catch {
        args = { _raw: tc.function.arguments };
      }
			return { id: tc.id, name: fromWireToolName(tc.function.name), arguments: args };
    });

    // If no tool calls but content looks like a tool call request, parse it
    if (toolCalls.length === 0 && content.includes('"tool_calls"')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.tool_calls?.length) {
          toolCalls.push(...parsed.tool_calls.map((tc: { id?: string; name?: string; function?: { name?: string; arguments?: unknown } }) => ({
            id: tc.id ?? crypto.randomUUID(),
				name: fromWireToolName(tc.function?.name ?? tc.name ?? ''),
            arguments: typeof tc.function?.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function?.arguments ?? {},
          })));
          // Remove JSON from content
          const jsonStart = content.indexOf('{"tool_calls"');
          if (jsonStart !== -1) content = content.slice(0, jsonStart).trim();
        }
      } catch {
        // Not valid JSON — leave as-is
      }
    }

		if (this.activeController === controller) this.activeController = null;
		return { content, toolCalls };
  }
}

export { type ToolDef } from '../types/index.js';
