// =============================================================================
// Nvidia NIM LLM Client — Stepfun + OpenAI-compatible models
// =============================================================================

import OpenAI from 'openai';
import type { ToolCall, ConversationMessage, ToolDef } from '../types/index.js';

type NIMTool = OpenAI.Chat.ChatCompletionTool;

export class NimClient {
  private client: OpenAI;
  private model: string;

  constructor(_projectRoot?: string) {
    const apiKey = process.env.NIM_API_KEY ?? '';
    const baseUrl = process.env.NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
    this.model = process.env.NIM_MODEL ?? 'stepfun-ai/step-3.7-flash';
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
        name: t.name,
        description: t.description,
        parameters: t.parameters as unknown as NIMTool['function']['parameters'],
      },
    })) as NIMTool[];
  }

  getModel(): string {
    return this.model;
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
        return {
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        };
      }),
      tools: tools,
      temperature: 0.3,
      max_tokens: 8192,
      stream: true,
    });

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

    // Extract tool calls
    const toolCalls: ToolCall[] = Array.from(toolCallMap.values()).map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.arguments);
      } catch {
        args = { _raw: tc.arguments };
      }
      return { id: tc.id, name: tc.name, arguments: args };
    });

    yield { content: finalContent, toolCalls };
  }

  /**
   * Non-streaming completion — for when streaming fails or for retries.
   */
  async complete(
    messages: ConversationMessage[],
    tools?: NIMTool[],
  ): Promise<{ content: string; toolCalls: ToolCall[] }> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => {
        if (m.role === 'tool') {
          return { role: 'tool' as const, content: m.content, tool_call_id: m.id };
        }
        return { role: m.role as 'system' | 'user' | 'assistant', content: m.content };
      }),
      tools: tools,
      temperature: 0.3,
      max_tokens: 8192,
      stream: false,
    });

    const msg = response.choices[0]?.message;
    // Strip reasoning noise
    let content =
      msg?.content?.replace(
        /\[ Reasoning[^\]]*\][^\[]*\[\/ Reasoning\][^\n]*/gi,
        '',
      ).trim() ?? '';

    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments ?? '{}');
      } catch {
        args = { _raw: tc.function.arguments };
      }
      return { id: tc.id, name: tc.function.name, arguments: args };
    });

    // If no tool calls but content looks like a tool call request, parse it
    if (toolCalls.length === 0 && content.includes('"tool_calls"')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.tool_calls?.length) {
          toolCalls.push(...parsed.tool_calls.map((tc: { id?: string; name?: string; function?: { name?: string; arguments?: unknown } }) => ({
            id: tc.id ?? crypto.randomUUID(),
            name: tc.function?.name ?? tc.name ?? '',
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

    return { content, toolCalls };
  }
}

export { type ToolDef } from '../types/index.js';