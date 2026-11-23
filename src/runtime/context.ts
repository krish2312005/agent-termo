import type { ConversationMessage } from '../types/index.js';
import { getProviderModelLimits } from '../llm/models.js';

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 32_768;
export const DEFAULT_OUTPUT_RESERVE_TOKENS = 8_192;
export const DEFAULT_CONTEXT_SAFETY_MARGIN_TOKENS = 2_048;
const SUMMARY_HEADER = '\n\n## Compacted Conversation Context\n';
const SUMMARY_LIMIT = 12_000;
const TOOL_MESSAGE_LIMIT = 10_000;
const COMPACTION_TARGET_RATIO = 0.78;

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
  const configuredContextWindow = positiveInteger(
    env.AGENT_TERMO_CONTEXT_WINDOW,
    providerLimits?.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS,
  );
  // An override may lower a documented limit, but must never make a known
  // model appear to support more context than its provider actually allows.
  const contextWindowTokens = Math.max(
    4_096,
    providerLimits
      ? Math.min(configuredContextWindow, providerLimits.contextWindowTokens)
      : configuredContextWindow,
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

/**
 * Messages that must survive compaction verbatim. They are never summarized
 * into the system prompt nor head+tail shortened: the system prompt, the
 * original objective (first user message), the current goal (latest user
 * message), the most recent tool result, and any tool result that reported a
 * failed call. The rule is deterministic: it depends only on message roles,
 * order, and the `Status: failure` marker emitted by formatToolResultForModel.
 */
function collectProtectedMessages(conversation: ConversationMessage[]): Set<ConversationMessage> {
  const protectedMessages = new Set<ConversationMessage>();
  if (conversation.length === 0) return protectedMessages;
  if (conversation[0]?.role === 'system') protectedMessages.add(conversation[0]!);
  const users = conversation.filter((message) => message.role === 'user');
  if (users.length > 0) {
    protectedMessages.add(users[0]!);
    protectedMessages.add(users[users.length - 1]!);
  }
  const tools = conversation.filter((message) => message.role === 'tool');
  if (tools.length > 0) protectedMessages.add(tools[tools.length - 1]!);
  for (const tool of tools) {
    if (tool.content.includes('Status: failure')) protectedMessages.add(tool);
  }
  return protectedMessages;
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
  const protectedMessages = collectProtectedMessages(conversation);
  const turns = groupTurns(conversation.slice(1));
  if (turns.length <= keepRecentTurns) return undefined;

  const removedTurns = turns.slice(0, -keepRecentTurns);
  const retained = turns.slice(-keepRecentTurns).flat();
  const removed = removedTurns.flat();
  // Protected messages are kept verbatim in the retained conversation, not
  // folded into the summary. Only the unprotected remainder is archived.
  const removedProtected = removed.filter((message) => protectedMessages.has(message));
  const removedSummarized = removed.filter((message) => !protectedMessages.has(message));
  if (removedSummarized.length === 0) return undefined;

  const summaryIndex = system.content.lastIndexOf(SUMMARY_HEADER);
  const basePrompt = summaryIndex >= 0 ? system.content.slice(0, summaryIndex) : system.content;
  const previous = summaryIndex >= 0
    ? system.content.slice(summaryIndex + SUMMARY_HEADER.length)
    : '';
  const originalObjective = turns.flat().find((message) => message.role === 'user');
  const priorObjective = previous.match(/## Original objective\n([\s\S]*?)(?=\n\n## |$)/)?.[1];
  const objective = priorObjective || (originalObjective ? summarizeMessage(originalObjective) : '');
  const userRequests = removedSummarized.filter((message) => message.role === 'user').slice(-4).map(summarizeMessage);
  const decisions = removedSummarized.filter((message) => message.role === 'assistant' && message.content.trim()).slice(-8).map(summarizeMessage);
  const toolEvidence = removedSummarized.filter((message) => message.role === 'tool').slice(-10).map(summarizeMessage);
  const sections = [
    objective ? '## Original objective\n' + objective : '',
    userRequests.length ? '## Earlier user instructions\n' + userRequests.join('\n') : '',
    decisions.length ? '## Decisions and findings\n' + decisions.join('\n') : '',
    toolEvidence.length ? '## Completed tool evidence\n' + toolEvidence.join('\n') : '',
    removedSummarized.length ? '## Compacted history\n' + removedSummarized.map(summarizeMessage).join('\n') : '',
  ].filter(Boolean).join('\n\n');
  const summary = mergeSummary(previous, sections);
  return {
    messages: [{ ...system, content: basePrompt + SUMMARY_HEADER + summary }, ...removedProtected, ...retained],
    archivedMessages: removedSummarized,
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

function shortenToolMessages(messages: ConversationMessage[], maxLength = TOOL_MESSAGE_LIMIT): ConversationMessage[] {
  const protectedMessages = collectProtectedMessages(messages);
  const archived: ConversationMessage[] = [];
  for (const message of messages) {
    if (message.role !== 'tool' || protectedMessages.has(message) || message.content.length <= maxLength) continue;
    archived.push({ ...message });
    const marker = '\n\n[Tool output shortened for context; the full result is saved in the session archive.]\n\n';
    const sideLength = Math.floor((maxLength - marker.length) / 2);
    message.content = message.content.slice(0, sideLength) + marker + message.content.slice(-sideLength);
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
  // The input budget already reserves output and safety-margin headroom, so
  // compaction must not fire early at a percentage of it. It fires only when
  // the estimated input would actually exceed that reserved budget; a real
  // provider context error is handled by the aggressive recovery path.
  const trigger = budget.inputBudgetTokens;
  const target = options.aggressive
    ? Math.floor(budget.inputBudgetTokens * 0.68)
    : Math.floor(budget.inputBudgetTokens * COMPACTION_TARGET_RATIO);

  if (estimatedBeforeTokens <= (options.aggressive ? target : trigger)) {
    return { estimatedBeforeTokens, estimatedAfterTokens: estimatedBeforeTokens, budget, compacted: false, archivedMessages: [] };
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
  const beforeToolShortening = estimateContextTokens(working, tools, model);
  archivedMessages.push(...shortenToolMessages(
    working,
    beforeToolShortening > target ? Math.max(2_000, Math.floor(TOOL_MESSAGE_LIMIT * 0.6)) : TOOL_MESSAGE_LIMIT,
  ));
  const estimatedAfterTokens = estimateContextTokens(working, tools, model);
  const compacted = Boolean(snapshot || archivedMessages.length);
  if (compacted) conversation.splice(0, conversation.length, ...working);

  const warning = estimatedAfterTokens > budget.inputBudgetTokens
    ? 'Unable to fit this request into the selected model input budget after automatic compaction. ' +
      'Model: ' + model + '. Estimated input: ' + estimatedAfterTokens.toLocaleString() +
      ' tokens; available input budget: ' + budget.inputBudgetTokens.toLocaleString() +
      ' tokens (context window ' + budget.contextWindowTokens.toLocaleString() +
      ', output reserve ' + budget.outputReserveTokens.toLocaleString() +
      ', safety margin ' + budget.safetyMarginTokens.toLocaleString() +
      '). The newest request/system instructions are too large to send safely. Shorten attached context or select a model with a larger documented context window.'
    : undefined;

  return { estimatedBeforeTokens, estimatedAfterTokens, budget, compacted, archivedMessages, warning };
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
