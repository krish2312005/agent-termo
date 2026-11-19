// =============================================================================
// LLM Client Adapter — Provider-native tool execution for NVIDIA NIM
// =============================================================================

import {
  ConversationMessage,
  ToolCall,
  ToolCallStatus,
  TokenUsage,
  LLMResponse,
  ThinkingCapacity,
  ProviderToolDef,
} from './types.js';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';

type NIMTool = OpenAI.Chat.ChatCompletionTool;
type NIMFunctionTool = Extract<NIMTool, { type: 'function' }>;

const TOOL_NAME_ALIASES: Record<string, string> = {
  'skill:read': 'skill_read',
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
  'plan:update': 'plan_update',
};

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

function toWireToolName(name: string): string {
  return TOOL_NAME_ALIASES[name] ?? name.replace(/:/g, '_');
}

function fromWireToolName(name: string): string {
  const key = String(name ?? '').trim().toLowerCase().replace(/[.:\-\s]+/g, '_');
  return WIRE_TO_CANONICAL[key] ?? name;
}

interface StreamedToolCallDelta {
  index?: number;
  id?: string | null;
  function?: { name?: string | null; arguments?: string | null };
}

class ToolCallStreamAccumulator {
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
      return [{ id: call.id ?? randomUUID(), name: fromWireToolName(call.name), arguments: args, status: 'completed' as ToolCallStatus }];
    });
  }
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
    calls.push({ id: randomUUID(), name: fromWireToolName(match[1]!.trim()), arguments: args, status: 'completed' as ToolCallStatus });
  }
  return calls;
}

function removeToolCallMarkup(text: string): string {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
}

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
    calls.push({ id: typeof tc.id === 'string' && tc.id ? tc.id : randomUUID(), name, arguments: args, status: 'completed' as ToolCallStatus });
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
  
  buildToolDefs(toolSchemas: ProviderToolDef[]): NIMTool[] {
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
  
  async listModels(): Promise<{ models: { id: string; note?: string }[]; live: boolean; error?: string }> {
    const controller = new AbortController();
    this.activeController = controller;
    try {
      const page = await this.client.models.list({ timeout: 10_000, signal: controller.signal });
      const ids = page.data.map((m) => m.id);
      if (ids.length === 0) throw new Error('empty model list');
      // Merge with curated models
      const curated = [
        { id: 'stepfun-ai/step-3.7-flash', note: 'Fast, efficient' },
        { id: 'stepfun-ai/step-3.7-mini', note: 'Ultra-fast' },
        { id: 'meta/llama-3.3-70b-instruct', note: 'Strong reasoning' },
        { id: 'nvidia/nemotron-3-ultra', note: 'Advanced reasoning' },
      ];
      const models = curated.filter(c => ids.includes(c.id)).map(c => ({ id: c.id, note: c.note }));
      return { models: models.length > 0 ? models : curated, live: true };
    } catch (err) {
      return {
        models: [
          { id: 'stepfun-ai/step-3.7-flash', note: 'Fast, efficient' },
          { id: 'stepfun-ai/step-3.7-mini', note: 'Ultra-fast' },
          { id: 'meta/llama-3.3-70b-instruct', note: 'Strong reasoning' },
          { id: 'nvidia/nemotron-3-ultra', note: 'Advanced reasoning' },
        ],
        live: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      if (this.activeController === controller) this.activeController = null;
    }
  }
  
  async *streamComplete(
    messages: ConversationMessage[],
    tools?: NIMTool[],
    onChunk?: (text: string) => void,
    onToolCallDelta?: (delta: { index: number; name: string; arguments: string; validJson: boolean }) => void,
  ): AsyncGenerator<LLMResponse, void, unknown> {
    const controller = new AbortController();
    this.activeController = controller;
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
        max_tokens: 8192,
        stream: true,
      }, { signal: controller.signal });
      
      const rawChunks: string[] = [];
      const toolCalls = new ToolCallStreamAccumulator();
      const toolCallSnapshots = new Map<number, { name: string; arguments: string }>();
      const startTag = '<tool_call>';
      const endTag = '</tool_call>';
      let pendingText = '';
      let insideMarkupCall = false;
      
      const emitVisible = (text: string): void => {
        if (text && text !== 'null' && text !== 'undefined') onChunk?.(text);
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
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;
        const rawContent = delta.content ?? '';
        if (rawContent) {
          rawChunks.push(rawContent);
          emitTextChunk(rawContent);
        }
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index ?? 0;
            toolCalls.add(toolCall);
            const current = toolCallSnapshots.get(index) ?? { name: '', arguments: '' };
            current.name += toolCall.function?.name ?? '';
            current.arguments += toolCall.function?.arguments ?? '';
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
      
      if (!insideMarkupCall) emitVisible(pendingText);
      const content = rawChunks.join('');
      this.recordUsage(this.estimatePromptTokens(messages), Math.ceil(content.length / 4));
      const parsedToolCalls = toolCalls.toToolCalls();
      let visibleContent = content;
      if (parsedToolCalls.length === 0) {
        const textCalls = parseToolCallsFromText(content);
        if (textCalls.length > 0) {
          parsedToolCalls.push(...textCalls);
          visibleContent = content.includes('<tool_call>') ? removeToolCallMarkup(content) : '';
        }
      }
      
      yield {
        content: visibleContent,
        toolCalls: parsedToolCalls,
        finishReason: parsedToolCalls.length > 0 ? 'tool_calls' : 'stop',
        usage: this.getUsage(),
      };
    } finally {
      if (this.activeController === controller) this.activeController = null;
    }
  }
  
  async complete(
    messages: ConversationMessage[],
    tools?: NIMTool[],
  ): Promise<LLMResponse> {
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
    
    let content = msg?.content?.replace(
      /\[ Reasoning[^\]]*\][^[]*\[\/ Reasoning\][^\n]*/gi,
      '',
    ).trim() ?? '';
    
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).flatMap((tc) => {
      if (tc.type !== 'function') return [];
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(tc.function.arguments ?? '{}') as unknown;
        args = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { _raw: String(parsed) };
      } catch {
        args = { _raw: tc.function.arguments };
      }
      return [{ id: tc.id, name: fromWireToolName(tc.function.name), arguments: args, status: 'completed' as ToolCallStatus }];
    });
    
    // If no native tool calls, parse JSON tool calls emitted as text.
    if (toolCalls.length === 0) {
      const parsedCalls = parseToolCallsFromText(content);
      if (parsedCalls.length > 0) {
        toolCalls.push(...parsedCalls);
        content = content.includes('<tool_call>') ? removeToolCallMarkup(content) : (() => {
          const marker = content.indexOf('"tool_calls"');
          const start = marker !== -1 ? content.lastIndexOf('{', marker) : content.trimStart().startsWith('[') ? content.indexOf('[') : content.lastIndexOf('{');
          return start !== -1 ? content.slice(0, start).trim() : content;
        })();
      }
    }
    
    if (this.activeController === controller) this.activeController = null;
    return { content, toolCalls, finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop', usage: this.getUsage() };
  }
}

// Export for compatibility
export { type ToolDef } from './types.js';