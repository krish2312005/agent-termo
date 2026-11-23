import type { ConversationMessage } from '../types/index.js';
import { getProviderModelLimits } from '../llm/models.js';

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 32_768;
export const DEFAULT_OUTPUT_RESERVE_TOKENS = 8_192;
export const DEFAULT_CONTEXT_SAFETY_MARGIN_TOKENS = 2_048;
const SUMMARY_HEADER = '\n\n## Compacted Conversation Context\n';
const SUMMARY_LIMIT = 12_000;
const TOOL_MESSAGE_LIMIT = 10_000;

export interface ContextBudget {
  contextWindowTokens: number;
  outputReserveTokens: number;
  maxOutputTokens: number;
  safetyMarginTokens: number;
  inputBudgetTokens: number;
}

export interface ContextPreparation {
  estimatedBeforeTokens: number;
  estimatedAfterTokens: number;
  budget: ContextBudget;
  compacted: boolean;
  archivedMessages: ConversationMessage[];
  warning?: string;
}

const tokenEstimateFactors = new Map<string, number>();

/** Calibrate the estimate against exact prompt-token usage reported by a provider. */
export function recordContextTokenUsage(model: string, estimatedTokens: number, actualTokens: number): void {
  if (!model || estimatedTokens <= 0 || actualTokens <= 0) return;
  const observedRatio = Math.min(2, Math.max(0.5, actualTokens / estimatedTokens));
  const previous = tokenEstimateFactors.get(model);
  // estimatedTokens already includes the previous factor, so apply the observed
  // ratio multiplicatively instead of blending it with an adjusted-scale ratio.
  tokenEstimateFactors.set(model, previous === undefined ? observedRatio : previous * (0.7 + observedRatio * 0.3));
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * NIM does not expose a dependable context-window value in /v1/models.
 * Known model IDs use limits published in NVIDIA's per-model API references.
 * Explicit environment settings take precedence; unknown models stay conservative.
 */
export function resolveContextBudget(
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): ContextBudget {
  const providerLimits = getProviderModelLimits(model);
  const contextWindowTokens = Math.max(
    4_096,
    positiveInteger(env.AGENT_TERMO_CONTEXT_WINDOW, providerLimits?.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS),
  );
  const configuredOutputTokens = positiveInteger(
    env.AGENT_TERMO_OUTPUT_RESERVE_TOKENS,
    Math.min(DEFAULT_OUTPUT_RESERVE_TOKENS, Math.floor(contextWindowTokens / 4)),
  );
  // Reserve the actual output limit, not a larger value the provider will reject.
  const maxOutputTokens = Math.max(
    1,
    Math.min(contextWindowTokens - 1_024, configuredOutputTokens, providerLimits?.maxOutputTokens ?? configuredOutputTokens),
  );
  const outputReserveTokens = maxOutputTokens;
  const safetyMarginTokens = Math.min(
    contextWindowTokens - outputReserveTokens - 512,
    positiveInteger(
      env.AGENT_TERMO_CONTEXT_SAFETY_MARGIN,
      Math.min(DEFAULT_CONTEXT_SAFETY_MARGIN_TOKENS, Math.floor(contextWindowTokens / 10)),
    ),
  );
  return {
    contextWindowTokens,
    outputReserveTokens,
    maxOutputTokens,
    safetyMarginTokens,
    inputBudgetTokens: Math.max(512, contextWindowTokens - outputReserveTokens - safetyMarginTokens),
  };
}

/** Approximate serialized prompt size. Exact provider usage calibrates this per model. */
export function estimateContextTokens(messages: ConversationMessage[], tools?: unknown[], model?: string): number {
  let textCharacters = 0;
  let structuredCharacters = 0;
  let framingTokens = 0;
  for (const message of messages) {
    textCharacters += message.content.length;
    framingTokens += 8;
    if (message.toolCalls?.length) {
      structuredCharacters += JSON.stringify(message.toolCalls).length;
      framingTokens += message.toolCalls.length * 8;
    }
  }
  if (tools?.length) {
    structuredCharacters += JSON.stringify(tools).length;
    framingTokens += tools.length * 8;
  }
  // Normal prose is roughly four characters per token; code/JSON is denser.
  const rawEstimate = Math.ceil(textCharacters / 4) + Math.ceil(structuredCharacters / 3) + framingTokens;
  return Math.ceil(rawEstimate * (model ? tokenEstimateFactors.get(model) ?? 1 : 1));
}

function groupTurns(messages: ConversationMessage[]): ConversationMessage[][] {
  const turns: ConversationMessage[][] = [];
  for (const message of messages) {
    if (message.role === 'user' || turns.length === 0) turns.push([]);
    turns[turns.length - 1]!.push(message);
  }
  return turns;
}

function summarizeMessage(message: ConversationMessage): string {
  const pieces = [message.role.toUpperCase() + ':'];
  if (message.toolCalls?.length) {
    pieces.push('tool calls: ' + message.toolCalls.map((call) =>
      call.name + '(' + JSON.stringify(call.arguments) + ')',
    ).join('; ').slice(0, 1_800));
  }
  const content = message.content.replace(/\s+/g, ' ').trim();
  if (content) {
    const limit = message.role === 'tool' ? 2_400 : message.role === 'user' ? 2_000 : 1_400;
    pieces.push(content.length > limit
      ? content.slice(0, limit - 80) + ' … [excerpt truncated] … ' + content.slice(-60)
      : content);
  }
  return pieces.join(' ');
}

function mergeSummary(previous: string, addition: string): string {
  const combined = [previous.trim(), addition.trim()].filter(Boolean).join('\n\n');
  if (combined.length <= SUMMARY_LIMIT) return combined;
  const firstPart = 2_400;
  const recentPart = SUMMARY_LIMIT - firstPart - 90;
  return combined.slice(0, firstPart) +
    '\n\n[Older intermediate history omitted to keep this summary bounded.]\n\n' +
    combined.slice(-recentPart);
}

interface CompactionSnapshot {
  messages: ConversationMessage[];
  archivedMessages: ConversationMessage[];
}

function makeCompactionSnapshot(
  conversation: ConversationMessage[],
  keepRecentTurns: number,
): CompactionSnapshot | undefined {
  const system = conversation[0];
  if (!system || system.role !== 'system') return undefined;
  const turns = groupTurns(conversation.slice(1));
  if (turns.length <= keepRecentTurns) return undefined;

  const removed = turns.slice(0, -keepRecentTurns).flat();
  const retained = turns.slice(-keepRecentTurns).flat();
  const summaryIndex = system.content.lastIndexOf(SUMMARY_HEADER);
  const basePrompt = summaryIndex >= 0 ? system.content.slice(0, summaryIndex) : system.content;
  const previous = summaryIndex >= 0
    ? system.content.slice(summaryIndex + SUMMARY_HEADER.length)
    : '';
  const summary = mergeSummary(previous, removed.map(summarizeMessage).join('\n'));
  return {
    messages: [{ ...system, content: basePrompt + SUMMARY_HEADER + summary }, ...retained],
    archivedMessages: removed,
  };
}

/** Compact old complete turns while preserving recent tool-call/result sequences. */
export function compactConversation(
  conversation: ConversationMessage[],
  keepRecentTurns = 4,
): { message: string; archivedMessages: ConversationMessage[] } {
  const snapshot = makeCompactionSnapshot(conversation, Math.max(1, keepRecentTurns));
  if (!snapshot) {
    return {
      message: 'Nothing to compact; the recent conversation is already within the retention window.',
      archivedMessages: [],
    };
  }
  conversation.splice(0, conversation.length, ...snapshot.messages);
  return {
    message: 'Compacted ' + snapshot.archivedMessages.length +
      ' earlier messages; preserved complete recent turns and prior summaries.',
    archivedMessages: snapshot.archivedMessages,
  };
}

function shortenToolMessages(messages: ConversationMessage[]): ConversationMessage[] {
  const archived: ConversationMessage[] = [];
  for (const message of messages) {
    if (message.role !== 'tool' || message.content.length <= TOOL_MESSAGE_LIMIT) continue;
    archived.push({ ...message });
    message.content = message.content.slice(0, 7_000) +
      '\n\n[Tool output shortened for context; the full result is saved in the session archive.]\n\n' +
      message.content.slice(-2_500);
  }
  return archived;
}

/** Run before every model request, including follow-ups inside tool loops. */
export function prepareConversationForRequest(
  conversation: ConversationMessage[],
  model: string,
  tools?: unknown[],
  options: { aggressive?: boolean } = {},
): ContextPreparation {
  const budget = resolveContextBudget(model);
  const estimatedBeforeTokens = estimateContextTokens(conversation, tools, model);
  const target = options.aggressive
    ? Math.floor(budget.inputBudgetTokens * 0.72)
    : budget.inputBudgetTokens;
  if (!options.aggressive && estimatedBeforeTokens <= target) {
    return {
      estimatedBeforeTokens,
      estimatedAfterTokens: estimatedBeforeTokens,
      budget,
      compacted: false,
      archivedMessages: [],
    };
  }

  const turns = groupTurns(conversation.slice(1));
  let snapshot: CompactionSnapshot | undefined;
  for (let keep = Math.min(4, turns.length - 1); keep >= 1; keep--) {
    const candidate = makeCompactionSnapshot(conversation, keep);
    if (!candidate) continue;
    snapshot = candidate;
    if (estimateContextTokens(candidate.messages, tools, model) <= target) break;
  }

  const working = snapshot?.messages ?? conversation.map((message) => ({ ...message }));
  const archivedMessages = snapshot ? [...snapshot.archivedMessages] : [];
  archivedMessages.push(...shortenToolMessages(working));
  const estimatedAfterTokens = estimateContextTokens(working, tools, model);
  const compacted = Boolean(snapshot || archivedMessages.length);
  if (compacted) conversation.splice(0, conversation.length, ...working);

  return {
    estimatedBeforeTokens,
    estimatedAfterTokens,
    budget,
    compacted,
    archivedMessages,
    warning: estimatedAfterTokens > target
      ? 'The newest request or system instructions exceed the configured input budget. Reduce attached context or raise AGENT_TERMO_CONTEXT_WINDOW.'
      : undefined,
  };
}

export function isContextWindowError(error: unknown): boolean {
  const value = error as { message?: unknown; error?: unknown; code?: unknown };
  let message = [value?.message, value?.error, value?.code].map(String).join(' ');
  try {
    message += ' ' + JSON.stringify(error);
  } catch {
    // Provider errors can contain circular request metadata.
  }
  return /context length|context window|maximum context|too many tokens|prompt.{0,20}too long|input tokens?.{0,30}(exceed|limit)|request.{0,30}(exceed|token limit)|token limit/i.test(message);
}
