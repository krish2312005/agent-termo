import {
  createCliRenderer,
  createClipboard,
  createHostClipboard,
  createRendererClipboardAdapter,
  decodePasteBytes,
  RGBA,
  SyntaxStyle,
  TextAttributes,
  type CliRenderer,
  type ClipboardService,
  type ScrollBoxRenderable,
  type TextareaRenderable,
} from "@opentui/core";
import { render, useKeyboard, usePaste, useRenderer } from "@opentui/solid";
import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import { createInterface } from "node:readline";
import packageJson from "../../package.json" with { type: "json" };
import { copySelectedText } from "./selection-copy.js";
import { sanitizeDisplayLine, sanitizeDisplayText } from "./display-text.js";
import type { PermissionMode } from "../types/index.js";
import { MAIN_AGENT_ID, listSubAgents } from "../runtime/subagents.js";
import { buildAgentTree, reconcileSelection, visibleAgentRows, type AgentTreeNode, type WorkspaceStatus } from "../runtime/agent-tree.js";
import { agentTranscripts } from "../runtime/agent-transcript.js";
import { getSelectedAgentId, setSelectedAgentId, subscribeAgentSelection } from "../runtime/agent-selection.js";
import { getMainAgentState, sendAgentMessage, stopAllAgents, subscribeWorkspace } from "../runtime/agent-workspace.js";
import {
  displayAgentLabel,
  formatAgentRow,
  formatApprovalPanel,
  formatComposerPlaceholder,
  formatComposerPrefix,
  formatContentStatus,
  lastSiblingFlags,
  MAX_APPROVAL_DETAIL_LINES,
  reduceWorkspaceKey,
  routeComposerInput,
  transcriptToUiEntries,
  type AgentColorRole,
  type ContentStatusRole,
  type WorkspaceKey,
  type WorkspaceKeyState,
} from "./workspace-view.js";

export type UiKind = "user" | "assistant" | "tool" | "info" | "success" | "error" | "dim" | "markdown" | "diff-add" | "diff-remove" | "diff-context";
export interface UiEntry { id: number; kind: UiKind; content: string; streaming?: boolean; /** Sub-agent that produced the entry; absent for main. */ agentLabel?: string; }
export interface Key { name: string; text?: string; }
export interface CommandInfo { name: string; description: string; }
export interface PickItem {
  value: string;
  label: string;
  hint?: string;
  /** Optional section name; rows from different groups get a non-selectable header. */
  group?: string;
  /** A non-selectable section header rendered by the picker. */
  header?: boolean;
}
interface PickerState {
  title: string;
  items: PickItem[];
  filtered: PickItem[];
  selected: number;
  query: string;
  allowCustom: boolean;
}
export interface InputController {
  question: (prompt?: string) => Promise<string>;
  questionSecret: (prompt?: string) => Promise<string | null>;
  close: () => void;
  showPrompt: () => void;
  /** Resolve a pending question() with this text; false when no question is pending. */
  submitExternal: (text: string) => boolean;
  /** Blur the composer, preserving the draft and any pending question. */
  suspend: () => void;
  /** Restore the composer focus that was active before suspend(). */
  resume: () => void;
}
/** The approval modal currently owns the keyboard; the label names the requester and detail describes the action. */
export interface ApprovalPromptState { label?: string; detail?: string }
export interface ScreenContext { usedTokens: number; budgetTokens: number; }
export interface ScreenState {
  model: string;
  project: string;
  thinking: string;
  usage: string;
  permissionMode: PermissionMode;
  context?: ScreenContext;
}

const [entries, setEntries] = createSignal<UiEntry[]>([]);
const [status, setStatus] = createSignal("");
const [screen, setScreen] = createSignal<ScreenState>({ model: "", project: "", thinking: "auto", usage: "0 tokens", permissionMode: "ask" });
const [commands, setCommandsState] = createSignal<CommandInfo[]>([]);
const [agentNames, setAgentNamesState] = createSignal<string[]>([]);
const [contextFiles, setContextFilesState] = createSignal<string[]>([]);
const [draft, setDraft] = createSignal("");
const [completionHiddenFor, setCompletionHiddenFor] = createSignal("");
const [inputActive, setInputActive] = createSignal(false);
const [terminal, setTerminal] = createSignal<{ command: string; lines: string[]; exitCode: number | null } | null>(null);
const [terminalVisible, setTerminalVisible] = createSignal(false);
const [terminalExpanded, setTerminalExpanded] = createSignal(false);
const [picker, setPicker] = createSignal<PickerState | null>(null);
const [completionSelected, setCompletionSelected] = createSignal(0);
const [secretMode, setSecretMode] = createSignal(false);
const [secretDraft, setSecretDraft] = createSignal("");
const [approvalPromptState, setApprovalPromptState] = createSignal<ApprovalPromptState | null>(null);

// Multi-agent workspace (navigation state only; switching never touches runs).
const [workspaceRevision, setWorkspaceRevision] = createSignal(0);
const [selectedAgentIdSignal, setSelectedAgentIdSignal] = createSignal(getSelectedAgentId());
const [focusMode, setFocusMode] = createSignal<"composer" | "navigator">("composer");
const [leaderArmedAt, setLeaderArmedAt] = createSignal<number | undefined>(undefined);
const [nowTick, setNowTick] = createSignal(Date.now());
const [transcriptRevision, setTranscriptRevision] = createSignal(0);
const [notice, setNotice] = createSignal<string | null>(null);
const [terminalColumns, setTerminalColumns] = createSignal(process.stdout.columns ?? 80);
const [terminalRows, setTerminalRows] = createSignal(process.stdout.rows ?? 24);
const drafts = new Map<string, string>();
const scrollPositions = new Map<string, number>();
const atBottomByAgent = new Map<string, boolean>();
let scrollbox: ScrollBoxRenderable | undefined;
let liveTicker: ReturnType<typeof setInterval> | null = null;
let leaderTimer: ReturnType<typeof setTimeout> | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let statusTimer: ReturnType<typeof setTimeout> | null = null;

let secretResolver: ((value: string | null) => void) | null = null;
let nextId = 1;
let renderer: CliRenderer | null = null;
let clipboard: ClipboardService | null = null;
let textarea: TextareaRenderable | undefined;
let inputResolver: ((value: string) => void) | null = null;
let pickerResolver: ((value: string | null) => void) | null = null;
let suspendedInputActive = false;
let historyIndex = -1;
let historyDraft = "";
let pendingNextInput = "";
let keyInterceptor: ((key: Key) => boolean) | null = null;
// The runtime registers this so the UI can stop the command the agent is running.
let terminalStopHandler: (() => void | Promise<void>) | null = null;
export function setTerminalStopHandler(handler: (() => void | Promise<void>) | null): void {
  terminalStopHandler = handler;
}

/** The approval modal owns the keyboard; `label` names the requester and `detail` describes the action. */
export function setApprovalPrompt(active: boolean, label?: string, detail?: string): void {
  setApprovalPromptState(active ? { label, detail } : null);
}

/** Reactive read for the workspace banner (empty when no approval is active). */
export function approvalPrompt(): ApprovalPromptState | null {
  return approvalPromptState();
}

export function permissionBarColor(mode: PermissionMode): string {
  switch (mode) {
    case "files":
      return "#D99168"; // orange — file accept
    case "auto":
      return "#FF5555"; // red — accept all auto
    case "ask":
    default:
      return "#6D625A"; // default — normal
  }
}

// -----------------------------------------------------------------------------
// Workspace state helpers (UI-local; runtime semantics live in src/runtime)
// -----------------------------------------------------------------------------

const STATUS_COLOR: Record<AgentColorRole, string> = {
  idle: "#8D857D",
  running: "#E2A078",
  waiting: "#79B8D1",
  completed: "#8FCB9B",
  failed: "#E47D76",
  stopped: "#88827C",
};

function metaColor(role: "status" | "detail" | "error" | "muted", status: AgentColorRole): string {
  if (role === "status") return STATUS_COLOR[status];
  if (role === "detail") return "#C9C1BA";
  if (role === "error") return "#E47D76";
  return "#88827C";
}

function contentStatusColor(role: ContentStatusRole, status: WorkspaceStatus): string {
  if (role === "accent") return "#D99168";
  if (role === "separator") return "#6D625A";
  if (role === "status") return STATUS_COLOR[status];
  if (role === "detail") return "#C9C1BA";
  if (role === "error") return "#E47D76";
  return "#88827C";
}

function currentNodes(): AgentTreeNode[] {
  return buildAgentTree(getMainAgentState(), listSubAgents());
}

function setTransientStatus(message: string): void {
  setStatus(message);
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => setStatus(""), 4_000);
}

function showNotice(message: string): void {
  setNotice(message);
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    setNotice(null);
    noticeTimer = null;
  }, 4_000);
}

function clearNotice(): void {
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = null;
  setNotice(null);
}

/** Write text into the composer and record it as the selected agent's draft. */
function applyComposerText(value: string): void {
  setDraft(value);
  setCompletionHiddenFor("");
  drafts.set(getSelectedAgentId(), value);
  textarea?.setText(value);
  textarea?.gotoBufferEnd();
}

/** Save the current composer text under the agent it belonged to before a switch. */
function saveComposerDraft(agentId: string): void {
  drafts.set(agentId, textarea?.plainText ?? draft());
}

/** Load the target agent's draft (or a pending `setNextInput` value for main). */
function loadComposerDraft(agentId: string): void {
  const value = agentId === MAIN_AGENT_ID && pendingNextInput ? pendingNextInput : drafts.get(agentId) ?? "";
  if (agentId === MAIN_AGENT_ID && pendingNextInput) {
    pendingNextInput = "";
    drafts.set(MAIN_AGENT_ID, value);
  }
  if (secretMode()) return;
  setDraft(value);
  setCompletionHiddenFor("");
  drafts.set(agentId, value);
  textarea?.setText(value);
  textarea?.gotoBufferEnd();
  historyIndex = -1;
}

function applyFocus(mode: "composer" | "navigator"): void {
  setFocusMode(mode);
  if (mode === "navigator") {
    setInputActive(false);
    textarea?.blur();
    return;
  }
  if (pickerResolver || secretResolver || approvalPromptState()) return;
  setInputActive(true);
  textarea?.focus();
}

function isScrollAtBottom(element: ScrollBoxRenderable): boolean {
  return element.scrollTop + element.viewport.height >= element.scrollHeight - 2;
}

function saveScrollFor(agentId: string): void {
  if (!scrollbox) return;
  scrollPositions.set(agentId, scrollbox.scrollTop);
  atBottomByAgent.set(agentId, isScrollAtBottom(scrollbox));
}

function restoreScrollFor(agentId: string): void {
  const element = scrollbox;
  if (!element) return;
  const saved = scrollPositions.get(agentId);
  // First view starts at the bottom; otherwise the recorded tail-follow state
  // survives the switch (an agent left at the bottom keeps following).
  const follow = saved === undefined || atBottomByAgent.get(agentId) === true;
  atBottomByAgent.set(agentId, follow);
  const target = follow ? Infinity : saved!;
  // Restore after the switched transcript's layout, so a saved offset cannot
  // be clamped against the previous agent's content before the switch paints.
  element.afterLayout(() => {
    if (getSelectedAgentId() !== agentId) return;
    element.scrollTo(target);
    atBottomByAgent.set(agentId, isScrollAtBottom(element));
  });
}

function syncLiveTicker(nodes: readonly AgentTreeNode[]): void {
  const live = nodes.some((node) => node.status === "running" || node.status === "waiting");
  if (live && !liveTicker) {
    setNowTick(Date.now());
    liveTicker = setInterval(() => {
      setNowTick(Date.now());
      const current = currentNodes();
      if (!current.some((node) => node.status === "running" || node.status === "waiting")) {
        if (liveTicker) clearInterval(liveTicker);
        liveTicker = null;
      }
    }, 1_000);
  } else if (!live && liveTicker) {
    clearInterval(liveTicker);
    liveTicker = null;
  }
}

function armLeaderTimeout(): void {
  if (leaderTimer) clearTimeout(leaderTimer);
  leaderTimer = setTimeout(() => {
    setLeaderArmedAt(undefined);
    leaderTimer = null;
  }, 1_500);
}

const keyHandlers = new Set<(key: Key) => void>();
const history: string[] = [];

/** Compact 7-cell context usage meter, e.g. `▰▰▰▱▱▱▱ 43%`. */
export function formatContextMeter(usedTokens: number, budgetTokens: number): string {
  const valid = Number.isFinite(usedTokens) && Number.isFinite(budgetTokens) && budgetTokens > 0;
  const ratio = valid ? Math.min(1, Math.max(0, usedTokens / budgetTokens)) : 1;
  const filled = Math.max(0, Math.min(7, Math.round(ratio * 7)));
  const percent = Math.round(ratio * 100);
  return "▰".repeat(filled) + "▱".repeat(7 - filled) + " " + percent + "%";
}

/** Compact token count for the status line: 943 tokens, 11k tokens, 1.2M tokens. */
export function formatTokenCount(tokens: number): string {
  const value = Number.isFinite(tokens) ? Math.max(0, Math.round(tokens)) : 0;
  if (value < 1000) return String(value);
  if (value < 1_000_000) return Math.round(value / 1000) + "k";
  return (value / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

/** Next masked API-key draft after a paste. Pure so it is testable without a renderer. */
export function applySecretPaste(current: string, pasted: string | Uint8Array): string {
  return current + (typeof pasted === "string" ? pasted : decodePasteBytes(pasted));
}

function cleanAnsi(value: string): string {
  // One shared sanitizer for the main log, the terminal panel and every
  // workspace surface; control/escape sequences are removed at the render boundary.
  return sanitizeDisplayText(value, { keepNewlines: true });
}

function addEntry(content: string, kind: UiKind): void {
  const clean = cleanAnsi(content);
  if (!renderer) {
    if (clean) process.stdout.write(clean.endsWith("\n") ? clean : clean + "\n");
    return;
  }
  setEntries((current) => [...current, { id: nextId++, kind, content: clean }]);
}

let activeStreamId: number | null = null;
export function appendLog(content: string, kind: UiKind = "info"): void {
  addEntry(content, kind);
}
export function clearLog(): void {
  setEntries([]);
  activeStreamId = null;
}
export function beginAssistantStream(): void {
  activeStreamId = nextId++;
  if (renderer) setEntries((current) => [...current, { id: activeStreamId!, kind: "markdown", content: "", streaming: true }]);
}
export function appendAssistantDelta(content: string): void {
  if (!content) return;
  if (!renderer) {
    process.stdout.write(content);
    return;
  }
  if (activeStreamId === null) beginAssistantStream();
  const id = activeStreamId;
  setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, content: entry.content + content } : entry));
}
export function finishAssistantStream(): void {
  if (activeStreamId !== null) {
    const id = activeStreamId;
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, streaming: false } : entry));
  }
  activeStreamId = null;
}

function dispatchKey(key: Key): void {
  if (keyInterceptor && keyInterceptor(key)) return;
  for (const handler of [...keyHandlers]) {
    try { handler(key); } catch { /* A failed UI shortcut must not break terminal input. */ }
  }
}

async function copySelection(text: string): Promise<void> {
  const currentRenderer = renderer;
  if (!currentRenderer) return;
  const copied = await copySelectedText(
    text,
    clipboard,
    (value) => currentRenderer.copyToClipboardOSC52(value),
  );
  if (renderer === currentRenderer) {
    setStatus(copied ? "Copied selection to clipboard" : "Clipboard copy unavailable");
  }
}

/** Filter picker rows by query and insert non-selectable headers for grouped items. */
export function filteredPicker(query: string, items: PickItem[], allowCustom = false): PickItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = items.filter((item) => {
    if (item.header) return false;
    const haystack = (item.label + " " + (item.hint ?? "")).toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
  const grouped = matches.some((item) => item.group);
  const filtered: PickItem[] = [];
  let lastGroup: string | undefined;
  for (const item of matches) {
    if (grouped && item.group && item.group !== lastGroup) {
      filtered.push({ value: "", label: item.group, header: true });
      lastGroup = item.group;
    }
    filtered.push(item);
  }
  const typed = query.trim();
  if (allowCustom && typed && !items.some((item) => item.value === typed)) {
    filtered.push({ value: typed, label: typed, hint: "use as typed" });
  }
  return filtered;
}

/** Next selectable picker row, skipping non-selectable section headers. */
export function nextPickerIndex(items: PickItem[], from: number, delta: number): number {
  const step = delta >= 0 ? 1 : -1;
  for (let index = from + step; index >= 0 && index < items.length; index += step) {
    if (!items[index]?.header) return index;
  }
  return from;
}

function choosePicker(value: string | null): void {
  const resolve = pickerResolver;
  pickerResolver = null;
  setPicker(null);
  resolve?.(value);
}

/** Clear the consumed draft for an agent and keep the composer focused. */
function clearComposer(agentId: string): void {
  drafts.set(agentId, "");
  setDraft("");
  setCompletionHiddenFor("");
  historyIndex = -1;
  setCompletionSelected(0);
  textarea?.setText("");
  if (focusMode() === "composer" && !pickerResolver && !secretResolver && !approvalPromptState()) {
    setInputActive(true);
    textarea?.focus();
  }
}

function pushHistory(text: string): void {
  if (text && history[0] !== text) history.unshift(text);
  if (history.length > 100) history.pop();
}

/** Resolve the pending main REPL question and keep the composer live for the next turn. */
function submitReplInput(): void {
  if (!inputResolver) return;
  const trimmed = (textarea?.plainText ?? draft()).trim();
  pushHistory(trimmed);
  const resolve = inputResolver;
  inputResolver = null;
  drafts.set(getSelectedAgentId(), "");
  setDraft("");
  setCompletionHiddenFor("");
  historyIndex = -1;
  setCompletionSelected(0);
  textarea?.setText("");
  if (focusMode() === "composer") {
    setInputActive(true);
    textarea?.focus();
  }
  resolve(trimmed);
}

function submitInput(): void {
  const value = textarea?.plainText ?? draft();
  const selectedAgentId = getSelectedAgentId();
  const route = routeComposerInput({
    text: value,
    selectedAgentId,
    knownAgentIds: currentNodes().map((node) => node.id),
    mainAwaitingInput: inputResolver !== null,
  });
  if (route.kind === "reject") {
    // Empty submits are suppressed by the UI; every other rejection is explicit
    // and keeps the draft exactly as typed.
    if (route.reason !== "empty") showNotice(route.message);
    return;
  }
  if (route.kind === "repl") {
    submitReplInput();
    return;
  }
  const result = sendAgentMessage(route.agentId, value);
  if (!result.ok) {
    showNotice(result.message);
    return;
  }
  if (route.agentId === MAIN_AGENT_ID) pushHistory(value.trim());
  clearNotice();
  clearComposer(route.agentId);
}

function App() {
  const activeRenderer = useRenderer();
  const syntaxStyle = SyntaxStyle.fromStyles({
    default: { fg: RGBA.fromHex("#E6E1DC") },
    "markup.heading.1": { fg: RGBA.fromHex("#E2A078"), bold: true },
    "markup.heading.2": { fg: RGBA.fromHex("#D7A27C"), bold: true },
    "markup.link.label": { fg: RGBA.fromHex("#79B8D1") },
    "markup.raw": { fg: RGBA.fromHex("#9CCB9C") },
    "markup.list": { fg: RGBA.fromHex("#D7A27C") },
  }, activeRenderer.nativeScene);
  onCleanup(() => syntaxStyle.destroy());

  const legacyAppleTerminal = usesLegacyAppleTerminal();
  const currentPicker = () => picker();

  const updateTerminalSize = (): void => {
    setTerminalColumns(process.stdout.columns ?? 80);
    setTerminalRows(process.stdout.rows ?? 24);
  };
  updateTerminalSize();
  activeRenderer.on("resize", updateTerminalSize);
  onCleanup(() => activeRenderer.off("resize", updateTerminalSize));

  const applyAgentSelection = (id: string): void => {
    const previous = selectedAgentIdSignal();
    if (previous === id) return;
    saveComposerDraft(previous);
    saveScrollFor(previous);
    setSelectedAgentIdSignal(id);
    loadComposerDraft(id);
    restoreScrollFor(id);
    clearNotice();
  };

  const offSelection = subscribeAgentSelection(applyAgentSelection);
  onCleanup(offSelection);

  const offWorkspace = subscribeWorkspace(() => {
    setWorkspaceRevision((revision) => revision + 1);
    const nodes = currentNodes();
    const reconciled = reconcileSelection(nodes, getSelectedAgentId());
    // Reconcile first: the selection listener saves the outgoing draft, so the
    // stale-id cleanup below must run after it or the draft would reappear.
    if (reconciled !== getSelectedAgentId()) setSelectedAgentId(reconciled);
    // SEC-08: forget drafts for ids that no longer exist (always keep main), so
    // a reused id starts empty. Ordinary agent switching never clears a draft.
    const present = new Set(nodes.map((node) => node.id));
    present.add(MAIN_AGENT_ID);
    for (const id of [...drafts.keys()]) {
      if (!present.has(id)) drafts.delete(id);
    }
    syncLiveTicker(nodes);
  });
  onCleanup(offWorkspace);

  // Only the selected agent's transcript may force a re-render or move the
  // scrollbox; hidden agents keep streaming into the store untouched.
  const offTranscript = agentTranscripts.subscribe((agentId) => {
    if (agentId !== getSelectedAgentId()) return;
    setTranscriptRevision((revision) => revision + 1);
    if (atBottomByAgent.get(agentId) === true && scrollbox) scrollbox.scrollTo(Infinity);
  });
  onCleanup(offTranscript);

  setSelectedAgentIdSignal(getSelectedAgentId());
  syncLiveTicker(currentNodes());
  onCleanup(() => {
    if (liveTicker) clearInterval(liveTicker);
    if (leaderTimer) clearTimeout(leaderTimer);
    if (noticeTimer) clearTimeout(noticeTimer);
    if (statusTimer) clearTimeout(statusTimer);
    liveTicker = null;
    leaderTimer = null;
    noticeTimer = null;
    statusTimer = null;
  });

  // Main's transcript is the existing `entries` signal, not a transcript-store
  // subscription; follow its tail only while main is selected and was at the
  // bottom before the update. Sub-agent entries use the store subscription.
  createEffect(() => {
    if (selectedAgentIdSignal() !== MAIN_AGENT_ID) return;
    entries();
    if (atBottomByAgent.get(MAIN_AGENT_ID) === true && scrollbox) scrollbox.scrollTo(Infinity);
  });

  const tree = createMemo(() => {
    workspaceRevision();
    return buildAgentTree(getMainAgentState(), listSubAgents());
  });
  const selectedNode = (): AgentTreeNode | undefined => {
    const id = selectedAgentIdSignal();
    return tree().find((node) => node.id === id) ?? tree()[0];
  };
  const selectedName = (): string => {
    const node = selectedNode();
    return node ? displayAgentLabel(node) : MAIN_AGENT_ID;
  };

  const approvalDetailLines = (): number =>
    Math.max(1, Math.min(MAX_APPROVAL_DETAIL_LINES, terminalRows() - 18));
  const approvalPanelLines = createMemo(() => {
    const approval = approvalPromptState();
    return approval ? formatApprovalPanel(approval, Math.max(1, terminalColumns() - 2), approvalDetailLines()) : [];
  });
  // On short terminals (<= 14 rows) the modal keeps the owner, one detail line
  // and the composer; the selected-agent status row, overflow counts and
  // navigator hint give up their rows.
  const compactApprovalChrome = (): boolean => approvalPromptState() !== null && terminalRows() <= 14;
  const navigatorCap = (): number => Math.max(
    1,
    Math.min(7, terminalRows() - 17 - approvalPanelLines().length),
  );
  const navigatorView = createMemo(() => {
    nowTick();
    const all = tree();
    const flags = lastSiblingFlags(all);
    const window = visibleAgentRows(all, selectedAgentIdSignal(), navigatorCap());
    const start = all.findIndex((node) => node.id === window.rows[0]?.id);
    return {
      rows: window.rows.map((node, index) => ({ node, lastSibling: flags[start + index] ?? true })),
      hiddenAbove: window.hiddenAbove,
      hiddenBelow: window.hiddenBelow,
    };
  });
  const navigatorHintVisible = (): boolean => !compactApprovalChrome();
  const navigatorLineCount = (): number => {
    const view = navigatorView();
    // Compact approval mode keeps only the selected row; overflow counts and
    // the hint yield their rows to the approval panel and composer.
    const overflow = !compactApprovalChrome();
    return view.rows.length
      + (overflow && view.hiddenAbove > 0 ? 1 : 0)
      + (overflow && view.hiddenBelow > 0 ? 1 : 0)
      + (navigatorHintVisible() ? 1 : 0);
  };

  // The approval panel replaces the one-row banner: owner line plus real
  // detail, visible regardless of the selected agent. A rejection notice keeps
  // the single row and never shows while a modal owns the keyboard.
  const bannerText = (): string | null => {
    if (approvalPromptState() || picker() || secretMode()) return null;
    const rejection = notice();
    return rejection ? "✗ " + sanitizeDisplayLine(rejection) : null;
  };
  const bannerRows = (): number => approvalPanelLines().length + (bannerText() ? 1 : 0);

  const terminalPanelRows = (): number => terminalVisible() && terminal()
    ? terminalPanelHeight(terminalExpanded(), terminalRows())
    : 0;
  const overlayAvailableRows = (reservedRows = 0): number =>
    Math.max(1, terminalRows() - 9 - 2 - terminalPanelRows() - navigatorLineCount() - bannerRows() - reservedRows
      - (compactApprovalChrome() ? 1 : 0));
  const visiblePickerItems = () => {
    const current = picker();
    if (!current) return [];
    const visibleCount = Math.min(8, overlayAvailableRows(5));
    const start = Math.min(
      Math.max(0, current.selected - visibleCount + 1),
      Math.max(0, current.filtered.length - visibleCount),
    );
    return current.filtered
      .slice(start, start + visibleCount)
      .map((item, index) => ({ ...item, selected: start + index === current.selected }));
  };
  const completionItems = () => {
    const value = draft();
    if (!inputActive() || !value || value === completionHiddenFor()) return [];
    if (value.startsWith("/")) {
      return commands()
        .filter((item) => item.name.startsWith(value))
        .map((item) => ({ kind: "command" as const, label: item.name, hint: item.description, start: 0, end: value.length }));
    }
    const at = value.lastIndexOf("@");
    if (at < 0 || (at > 0 && !/\s/.test(value[at - 1]!))) return [];
    const query = value.slice(at + 1).toLowerCase();
    return [...agentNames(), ...contextFiles()]
      .filter((item) => item.toLowerCase().startsWith(query))
      .map((label) => ({ kind: "mention" as const, label, hint: "mention", start: at, end: value.length }));
  };

  const visibleCompletionItems = () => {
    const suggestions = completionItems();
    if (suggestions.length === 0) return [];

    const visibleCount = Math.min(6, overlayAvailableRows());
    const selected = Math.min(completionSelected(), suggestions.length - 1);
    const start = Math.min(
      Math.max(0, selected - visibleCount + 1),
      Math.max(0, suggestions.length - visibleCount),
    );

    return suggestions
      .slice(start, start + visibleCount)
      .map((item, index) => ({ ...item, selected: start + index === selected }));
  };

  const applyCompletion = (item: ReturnType<typeof completionItems>[number], submitCommand: boolean) => {
    const value = textarea?.plainText ?? draft();
    const next = item.kind === "command"
      ? item.label
      : value.slice(0, item.start) + "@" + item.label + " " + value.slice(item.end);
    textarea?.setText(next);
    textarea?.gotoBufferEnd();
    setDraft(next);
    drafts.set(getSelectedAgentId(), next);
    setCompletionSelected(0);
    if (item.kind === "command" && submitCommand) submitInput();
  };

  const subEntries = createMemo<UiEntry[]>(() => {
    if (selectedAgentIdSignal() === MAIN_AGENT_ID) return [];
    transcriptRevision();
    const node = selectedNode();
    return transcriptToUiEntries(agentTranscripts.get(selectedAgentIdSignal()), node?.name ?? selectedAgentIdSignal());
  });
  const visibleEntries = (): UiEntry[] => selectedAgentIdSignal() === MAIN_AGENT_ID ? entries() : subEntries();

  const contentStatusSegments = createMemo(() => {
    const node = selectedNode();
    return node ? formatContentStatus(node, { now: nowTick(), width: Math.max(20, terminalColumns() - 2) }) : [];
  });

  const rowModel = (node: AgentTreeNode, lastSibling: boolean) => formatAgentRow(node, {
    width: Math.max(20, terminalColumns() - 2),
    now: nowTick(),
    selected: node.id === selectedAgentIdSignal(),
    lastSibling,
    activeAgentName: node.kind === "main" ? getMainAgentState().activeAgentName : undefined,
  });

  const composerPrefix = (): string => formatComposerPrefix(selectedName(), terminalColumns());
  const composerPrefixCells = (): number => [...composerPrefix()].length + 1;
  const composerPlaceholder = (): string => formatComposerPlaceholder(selectedName(), terminalColumns(), composerPrefixCells());

  const navigatorHint = (): string => {
    if (approvalPromptState() || picker() || secretMode()) return "Navigator paused · finish the prompt to continue";
    if (focusMode() === "navigator") return "↑↓ select · Enter message · Esc parent · Ctrl+K stop terminal · Ctrl+X Ctrl+K stop all";
    return "Ctrl+X navigate · ↑↓ select · Enter message · Esc parent · Ctrl+X Ctrl+K stop all";
  };

  const promptMaxRows = (): number => {
    const panelRows = approvalPanelLines().length;
    if (panelRows > 0) {
      // The panel owns extra rows; reserve four for content and let the textarea
      // shrink to one row on the 12-row minimum terminal so nothing overflows.
      const base = compactApprovalChrome() ? 7 : 8;
      const available = terminalRows() - base - navigatorLineCount() - panelRows - 4;
      return Math.max(1, Math.min(8, available));
    }
    return Math.max(3, Math.min(8, terminalRows() - 11 - 2 - navigatorLineCount() - bannerRows()));
  };

  useKeyboard((event) => {
    const sequence = event.sequence ?? "";
    const printable = !event.ctrl && !event.meta && (event.name.length === 1 || event.name === "space");
    const name = printable
      ? "text"
      : event.ctrl
        ? "ctrl+" + event.name
        : (event.meta || event.option)
          ? "meta+" + event.name
          : event.name === "return" && event.shift
            ? "shift+enter"
            : event.name === "return"
              ? "enter"
              : event.name;
    const key: Key = { name, text: sequence || (event.name === "space" ? " " : undefined) };
    if (secretMode()) {
      if (name === "enter") {
        const resolve = secretResolver;
        secretResolver = null;
        setSecretMode(false);
        const value = secretDraft();
        setSecretDraft("");
        setInputActive(false);
        resolve?.(value);
      } else if (name === "escape" || name === "ctrl+c") {
        const resolve = secretResolver;
        secretResolver = null;
        setSecretMode(false);
        setSecretDraft("");
        setInputActive(false);
        resolve?.(null);
      } else if (name === "backspace") {
        setSecretDraft((value) => [...value].slice(0, -1).join(""));
      } else if (name === "text" || name === "paste" || name === "space") {
        setSecretDraft((value) => value + (key.text ?? (name === "space" ? " " : "")));
      }
      event.preventDefault();
      return;
    }

    const currentPicker = picker();

    if (currentPicker) {
      if (name === "up") setPicker((current) => current ? { ...current, selected: nextPickerIndex(current.filtered, current.selected, -1) } : current);
      else if (name === "down") setPicker((current) => current ? { ...current, selected: nextPickerIndex(current.filtered, current.selected, 1) } : current);
      else if (name === "enter") {
        const item = currentPicker.filtered[currentPicker.selected];
        if (item && !item.header) choosePicker(item.value);
      }
      else if (name === "escape" || name === "ctrl+c") choosePicker(null);
      else if (name === "backspace") setPicker((current) => {
        if (!current) return current;
        const query = current.query.slice(0, -1);
        const filtered = filteredPicker(query, current.items, current.allowCustom);
        return { ...current, query, filtered, selected: nextPickerIndex(filtered, -1, 1) };
      });
      else if (key.text && key.text.length > 0 && key.text >= " ") setPicker((current) => {
        if (!current) return current;
        const query = current.query + key.text;
        const filtered = filteredPicker(query, current.items, current.allowCustom);
        return { ...current, query, filtered, selected: nextPickerIndex(filtered, -1, 1) };
      });
      event.preventDefault();
      return;
    }

    // Workspace keys run before completion/history/dispatchKey so navigating
    // can never reach the Escape/Ctrl+C cancellation listeners. Modals own
    // the keyboard and freeze the navigator.
    if (!approvalPromptState()) {
      const workspaceKey: WorkspaceKey =
        name === "up" ? "up"
          : name === "down" ? "down"
            : name === "enter" ? "enter"
              : name === "escape" ? "escape"
                : name === "ctrl+x" ? "ctrl+x"
                  : name === "ctrl+k" ? "ctrl+k"
                    : "other";
      const before: WorkspaceKeyState = { focus: focusMode(), selectedAgentId: selectedAgentIdSignal(), leaderArmedAt: leaderArmedAt() };
      const decision = reduceWorkspaceKey(before, workspaceKey, { nodes: tree(), now: Date.now() });
      if (decision.state.focus !== before.focus) applyFocus(decision.state.focus);
      if (decision.state.selectedAgentId !== before.selectedAgentId) setSelectedAgentId(decision.state.selectedAgentId);
      if (decision.state.leaderArmedAt !== before.leaderArmedAt) setLeaderArmedAt(decision.state.leaderArmedAt);
      if (workspaceKey === "ctrl+x") armLeaderTimeout();
      if (decision.action === "stop_all") {
        const stopped = stopAllAgents();
        setTransientStatus("Stopped " + stopped + " agents.");
      }
      if (decision.consumed) {
        event.preventDefault();
        return;
      }
    }

    const suggestions = completionItems();
    if (inputActive() && suggestions.length > 0) {
      if (name === "escape") {
        setCompletionHiddenFor(draft());
        event.preventDefault();
        return;
      }
      if (name === "up" || name === "down") {
        setCompletionSelected((selected) => name === "up"
          ? Math.max(0, selected - 1)
          : Math.min(suggestions.length - 1, selected + 1));
        dispatchKey(key);
        event.preventDefault();
        return;
      }
      if (name === "tab" || (name === "enter" && !legacyAppleTerminal)) {
        const selected = suggestions[Math.min(completionSelected(), suggestions.length - 1)];
        if (selected) {
          applyCompletion(selected, name === "enter" && selected.kind === "command");
          dispatchKey(key);
          event.preventDefault();
          return;
        }
      }
    }

    if (inputActive() && (name === "up" || name === "down")) {
      const currentText = textarea?.plainText ?? draft();
      const cursorRow = textarea?.logicalCursor.row ?? 0;
      const lastRow = currentText.split("\n").length - 1;
      if (name === "up" && cursorRow === 0 && history.length > 0) {
        if (historyIndex === -1) historyDraft = currentText;
        if (historyIndex < history.length - 1) historyIndex++;
        const value = history[historyIndex] ?? historyDraft;
        textarea?.setText(value);
        setDraft(value);
        event.preventDefault();
        return;
      }
      if (name === "down" && cursorRow === lastRow && historyIndex >= 0) {
        historyIndex--;
        const value = historyIndex === -1 ? historyDraft : history[historyIndex] ?? "";
        textarea?.setText(value);
        setDraft(value);
        event.preventDefault();
        return;
      }
    }

    dispatchKey(key);
    if (shouldSubmitLegacyAppleTerminalReturn(legacyAppleTerminal, inputActive(), name)) {
      submitInput();
      event.preventDefault();
      return;
    }
    if (name === "ctrl+o") {
      if (terminal()) setTerminalVisible((visible) => !visible);
      event.preventDefault();
      return;
    }
    if (name === "ctrl+t") {
      if (terminal()) {
        setTerminalVisible(true);
        setTerminalExpanded((expanded) => !expanded);
      }
      event.preventDefault();
      return;
    }
    // Stop the command the agent is running. Plain Ctrl+K keeps this meaning
    // while the navigator owns keys, the prompt is inactive, or the composer is
    // focused but empty; with text present it stays the textarea's kill-line.
    if (name === "ctrl+k" && terminal() && terminal()!.exitCode === null
      && (focusMode() === "navigator" || !inputActive() || !(textarea?.plainText ?? draft()).trim())) {
      setStatus("Stopping terminal…");
      void Promise.resolve(terminalStopHandler?.()).finally(() => setStatus(""));
      event.preventDefault();
      return;
    }
    if ((name === "ctrl+c" || name === "meta+c") && inputActive()) {
      const selectedText = activeRenderer.getSelection()?.getSelectedText() ?? "";
      if (selectedText) {
        void copySelection(selectedText);
        event.preventDefault();
        return;
      }
      const currentText = textarea?.plainText ?? draft();
      if (currentText) {
        textarea?.setText("");
        setDraft("");
        drafts.set(getSelectedAgentId(), "");
        setCompletionHiddenFor("");
        historyIndex = -1;
        setCompletionSelected(0);
      } else {
        const anyLive = tree().some((node) => node.status === "running" || node.status === "waiting");
        // Empty composer: cancel a live selected agent instead of quitting.
        if (!anyLive) process.emit("SIGINT");
      }
      event.preventDefault();
      return;
    }
  });

  // Bracketed paste arrives as a PasteEvent, not a keypress. The focused
  // textarea handles it normally, but secret mode unmounts that textarea.
  usePaste((event) => {
    if (!secretMode()) return;
    setSecretDraft((value) => applySecretPaste(value, event.bytes));
    event.preventDefault();
  });

  const colors: Record<UiKind, string> = {
    user: "#8FCB9B", assistant: "#E6E1DC", tool: "#79B8D1", info: "#8BB7D8",
    success: "#8FCB9B", error: "#E47D76", dim: "#88827C", markdown: "#E6E1DC",
    "diff-add": "#B7E4C7", "diff-remove": "#F0B4AE", "diff-context": "#BDB6AE",
  };

  const statusLine = () => {
    const state = screen();
    const parts: string[] = [];
    if (state.context) {
      parts.push(
        "context " + formatContextMeter(state.context.usedTokens, state.context.budgetTokens) +
        " · " + formatTokenCount(state.context.usedTokens) + "/" + formatTokenCount(state.context.budgetTokens),
      );
    }
    parts.push(state.thinking, state.permissionMode, "session " + state.usage);
    return parts.join(" · ");
  };

  const handleSelectionMouseUp = () => {
    const selectedText = activeRenderer.getSelection()?.getSelectedText() ?? "";
    if (selectedText) void copySelection(selectedText);
  };

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor="#11100F"
      paddingX={1}
      gap={0}
      onMouseUp={handleSelectionMouseUp}
    >
      <box
        width="100%"
        border
        borderStyle="rounded"
        borderColor="#6D625A"
        paddingX={1}
        flexShrink={0}
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <box flexDirection="row" alignItems="center" gap={1}>
          <text fg="#D99168">✻ Agent-Termo</text>
          <text fg="#8D857D">v{packageJson.version}</text>
        </box>
        <text fg="#89827C">{screen().model} · {screen().project}</text>
      </box>
      <box flexDirection="column" flexGrow={1} flexBasis={0} minHeight={0}>
        <Show when={!compactApprovalChrome()} fallback={<box height={0} />}>
          <box height={1} flexDirection="row" flexShrink={0} paddingX={1}>
            <For each={contentStatusSegments()}>
              {(segment) => (
                <text fg={contentStatusColor(segment.role, selectedNode()?.status ?? "idle")} wrapMode="none">{segment.text}</text>
              )}
            </For>
          </box>
        </Show>
        <text fg="#6D625A" flexShrink={0} wrapMode="none">{"─".repeat(Math.max(1, terminalColumns() - 2))}</text>
        <scrollbox
          ref={(element) => {
            scrollbox = element;
            element.verticalScrollBar.onChange = () => {
              const id = getSelectedAgentId();
              atBottomByAgent.set(id, isScrollAtBottom(element));
            };
            // Tail-follow only when the visible agent was at the bottom before
            // the content grew; background agents never touch this box.
            element.content.onSizeChange = () => {
              const id = getSelectedAgentId();
              if (atBottomByAgent.get(id) === true) element.scrollTo(Infinity);
            };
            element.viewport.onSizeChange = () => {
              const id = getSelectedAgentId();
              if (atBottomByAgent.get(id) === true) element.scrollTo(Infinity);
              else atBottomByAgent.set(id, isScrollAtBottom(element));
            };
            restoreScrollFor(getSelectedAgentId());
          }}
          flexGrow={1}
          flexBasis={0}
          minHeight={0}
          focusable={false}
          viewportCulling
          contentOptions={{ layoutMode: "list" }}
        >
          <Show when={visibleEntries().length > 0} fallback={
            <Show when={selectedAgentIdSignal() !== MAIN_AGENT_ID}>
              <box paddingX={1}>
                <text fg="#88827C" wrapMode="none">No activity yet for @{selectedName()}.</text>
              </box>
            </Show>
          }>
            <Index each={visibleEntries()}>
              {(entry) => (
                <box flexDirection="column" paddingX={1}>
                  <Show when={entry().kind === "user" || entry().kind === "markdown"}>
                    <text fg={entry().kind === "user" ? "#8FCB9B" : entry().agentLabel ? "#8D857D" : "#6D625A"}>
                      {entry().kind === "user"
                        ? "❯ You" + (entry().agentLabel ? " → @" + entry().agentLabel : "")
                        : "⏺ " + (entry().agentLabel ?? "Agent-Termo")}
                    </text>
                  </Show>
                  <Show when={entry().kind === "diff-add" || entry().kind === "diff-remove"} fallback={
                    <Show when={entry().kind === "markdown" || entry().kind === "diff-context"} fallback={<text fg={colors[entry().kind]}>{entry().content}</text>}>
                      <Show when={entry().kind === "markdown"} fallback={<text fg={colors["diff-context"]}>{entry().content}</text>}>
                        <markdown content={entry().content} syntaxStyle={syntaxStyle} streaming={entry().streaming ?? false} />
                      </Show>
                    </Show>
                  }>
                    <box width="100%" paddingX={1} backgroundColor={entry().kind === "diff-add" ? "#17351F" : "#3A1D1D"}>
                      <text fg={entry().kind === "diff-add" ? "#B7E4C7" : "#F0B4AE"}>{entry().content}</text>
                    </box>
                  </Show>
                </box>
              )}
            </Index>
          </Show>
        </scrollbox>
      </box>
      <Show when={terminalVisible() && terminal()} fallback={<box height={0} />}>
        <box height={terminalPanelRows()} border borderStyle="single" borderColor="#6D625A" paddingX={1} flexDirection="column" flexShrink={0}>
          <text fg="#D99168">Terminal · {terminal()!.exitCode === null ? "running" : "exit " + terminal()!.exitCode}</text>
          <text fg="#8D857D">$ {terminal()!.command}</text>
          <text fg="#6D625A">
            {terminal()!.exitCode === null ? "Ctrl+K stop · " : ""}Ctrl+T {terminalExpanded() ? "shrink" : "expand"} · Ctrl+O hide
          </text>
          <scrollbox flexGrow={1} minHeight={0} stickyScroll stickyStart="bottom">
            <text fg="#C9C1BA">{terminal()!.lines.join("\n")}</text>
          </scrollbox>
        </box>
      </Show>
      <Show when={currentPicker()} fallback={<box height={0} />}>
        {(current: Accessor<PickerState>) => (
          <box border borderStyle="rounded" borderColor="#D99168" paddingX={1} flexDirection="column" flexShrink={0}>
            <text fg="#D99168">{current().title}</text>
            <text fg="#8F8982">Filter: {current().query}</text>
            <For each={visiblePickerItems()}>
              {(item) => item.header
                ? <text fg="#8F8982">{"— " + item.label + " —"}</text>
                : <text fg={item.selected ? "#F0B38D" : "#D0C9C2"}>{item.selected ? "› " : "  "}{item.label}{item.hint ? "  " + item.hint : ""}</text>}
            </For>
            <text fg="#8F8982">↑ ↓ move · type to filter · Enter select · Esc cancel</text>
          </box>
        )}
      </Show>
      <Show when={inputActive() && completionItems().length > 0 && !currentPicker() && !secretMode()} fallback={<box height={0} />}>
        <box paddingX={2} flexDirection="column" flexShrink={0}>
          <For each={visibleCompletionItems()}>
            {(item) => <text fg={item.selected ? "#F0B38D" : "#8EAAA8"}>{item.selected ? "› " : "  "}{item.label}{item.hint ? "  " + item.hint : ""}</text>}
          </For>
        </box>
      </Show>
      <Show when={approvalPromptState()} fallback={
        <Show when={bannerText()} fallback={<box height={0} />}>
          <text fg="#E47D76" wrapMode="none">
            {clipText(bannerText() ?? "", Math.max(1, terminalColumns() - 2))}
          </text>
        </Show>
      }>
        <box flexDirection="column" flexShrink={0}>
          <Index each={approvalPanelLines()}>
            {(line) => <text fg="#79B8D1" wrapMode="none">{line()}</text>}
          </Index>
        </box>
      </Show>
      <box border borderStyle="single" borderColor={inputActive() ? permissionBarColor(screen().permissionMode) : "#6D625A"} paddingX={1} flexDirection="row" alignItems="flex-start" flexShrink={0}>
        <text fg="#D99168" wrapMode="none">{composerPrefix() + " "}</text>
        <Show when={secretMode()} fallback={
          <textarea
            ref={(element) => { textarea = element; }}
            flexGrow={1}
            flexBasis={0}
            minWidth={0}
            height={promptInputHeight(
              draft(),
              textarea?.width || Math.max(8, terminalColumns() - 6 - composerPrefixCells()),
              promptMaxRows(),
            )}
            focused={inputActive() && !currentPicker() && !secretMode() && !approvalPromptState()}
            placeholder={composerPlaceholder()}
            onContentChange={() => {
              const value = textarea?.plainText ?? "";
              if (value !== draft()) setCompletionHiddenFor("");
              setDraft(value);
              drafts.set(getSelectedAgentId(), value);
              setCompletionSelected(0);
            }}
            onSubmit={submitInput}
            keyBindings={promptInputKeyBindings(legacyAppleTerminal)}
          />
        }>
          <box flexGrow={1} flexBasis={0} minWidth={0}>
            <text fg="#D0C9C2">{ "•".repeat(secretDraft().length) }</text>
          </box>
        </Show>
      </box>
      <box flexDirection="column" width="100%" flexShrink={0}>
        <Show when={navigatorView().hiddenAbove > 0 && !compactApprovalChrome()}>
          <text fg="#88827C" wrapMode="none">{"  … " + navigatorView().hiddenAbove + " above"}</text>
        </Show>
        <For each={navigatorView().rows}>
          {(row) => {
            const model = rowModel(row.node, row.lastSibling);
            return (
              <box height={1} flexDirection="row">
                <text fg="#F0B38D" wrapMode="none">{model.marker}</text>
                <text fg="#88827C" wrapMode="none">{model.connector}</text>
                <text fg={STATUS_COLOR[model.role]} wrapMode="none">{model.glyph + " "}</text>
                <text
                  fg={model.selected ? "#F0B38D" : "#E6E1DC"}
                  attributes={model.selected ? TextAttributes.BOLD : TextAttributes.NONE}
                  wrapMode="none"
                >
                  {model.label}
                </text>
                <For each={model.segments}>
                  {(segment) => (
                    <>
                      <text fg="#88827C" wrapMode="none">{" · "}</text>
                      <text fg={metaColor(segment.role, model.role)} wrapMode="none">{segment.text}</text>
                    </>
                  )}
                </For>
              </box>
            );
          }}
        </For>
        <Show when={navigatorView().hiddenBelow > 0 && !compactApprovalChrome()}>
          <text fg="#88827C" wrapMode="none">{"  … " + navigatorView().hiddenBelow + " below"}</text>
        </Show>
        <Show when={navigatorHintVisible()} fallback={<box height={0} />}>
          <text fg="#8D857D" wrapMode="none">{clipText(navigatorHint(), Math.max(1, terminalColumns() - 2))}</text>
        </Show>
      </box>
      <box height={1} flexDirection="row" justifyContent="space-between">
        <text fg="#8D857D">{statusLine()}</text>
        <text fg="#8D857D">{status() || (legacyAppleTerminal
          ? "Return send · Shift+Return newline · Tab complete · Select text to copy · Ctrl+C quit"
          : "Enter send · Shift+Enter newline · Tab complete · Select text to copy · Ctrl+C quit")}</text>
      </box>
    </box>
  );
}

export async function initScreen(info: { model: string; project: string; thinking?: string }): Promise<void> {
  setScreen((current) => ({ ...current, ...info, thinking: info.thinking ?? current.thinking }));
  if (!layoutSupported()) return;
  if (renderer) return;
  const legacyAppleTerminal = usesLegacyAppleTerminal();
  if (shouldDisableGraphicsProbe(legacyAppleTerminal, process.env.OPENTUI_GRAPHICS)) {
    // Apple Terminal does not support the Kitty/Sixel graphics protocol.
    process.env.OPENTUI_GRAPHICS = "false";
  }
  if (shouldForceTruecolor(legacyAppleTerminal, process.env.OPENTUI_FORCE_TRUECOLOR)) {
    // Avoid OpenTUI's RGB/Tc XTGETTCAP probes; Apple Terminal supports truecolor.
    process.env.OPENTUI_FORCE_TRUECOLOR = "1";
  }
  renderer = await createCliRenderer({
    stdin: process.stdin,
    externalOutputMode: "passthrough",
    targetFps: 60,
    gatherStats: false,
    exitOnCtrlC: false,
    // Agent-Termo owns SIGINT cleanup; do not install a second renderer handler.
    exitSignals: [],
    useKittyKeyboard: legacyAppleTerminal ? null : {},
    autoFocus: false,
    openConsoleOnError: false,
  });
  try {
    try {
      clipboard = createClipboard({
        host: createHostClipboard(),
        terminal: createRendererClipboardAdapter(renderer),
      });
    } catch {
      // Keep the TUI usable; copySelection falls back to direct OSC 52.
      clipboard = null;
    }
    // Agent-Termo's REPL waits on its own input controller. Keep the renderer
    // active until that REPL exits; OpenCode can remain demand-driven because
    // its TUI lifecycle is owned by its Effect scope and renderer destroy latch.
    await render(() => <App />, renderer);
    renderer.start();
    process.on("exit", () => {
      // Last-resort synchronous terminal restoration; normal shutdown awaits closed.
      if (renderer && !renderer.isDestroyed) renderer.destroy();
    });
  } catch (error) {
    const current = renderer;
    renderer = null;
    const currentClipboard = clipboard;
    clipboard = null;
    if (currentClipboard) await currentClipboard.dispose().catch(() => {});
    if (current) {
      current.destroy();
      await current.closed.catch(() => {});
    }
    throw error;
  }
}

export async function teardownScreen(): Promise<void> {
  const current = renderer;
  if (!current) return;
  renderer = null;
  const currentClipboard = clipboard;
  clipboard = null;
  if (currentClipboard) await currentClipboard.dispose().catch(() => {});
  if (!current.isDestroyed) current.destroy();
  await current.closed.catch(() => {});
}

export function setScreenStatus(info: { model?: string; project?: string; thinking?: string; usage?: string; context?: ScreenContext }): void {
  setScreen((current) => ({ ...current, ...info }));
}
export function isRendererActive(): boolean { return renderer !== null; }
export function setActivityStatus(value: string): void { setStatus(value); }
export function setKeyInterceptor(interceptor: ((key: Key) => boolean) | null): void { keyInterceptor = interceptor; }
export function setPermissionMode(mode: "ask" | "files" | "auto"): void {
  setScreen((current) => ({ ...current, permissionMode: mode }));
}
export function setCommands(items: CommandInfo[]): void { setCommandsState(items); }
export function setAgentNames(items: string[]): void { setAgentNamesState([...items].sort()); }
export function setContextFiles(items: string[]): void { setContextFilesState([...items].sort()); }
export function setNextInput(value: string): void {
  // Applies only while main is the composer target; otherwise it is retained
  // for the next time main is selected (a sub-agent draft is never overwritten).
  if (getSelectedAgentId() !== MAIN_AGENT_ID) {
    pendingNextInput = value;
    return;
  }
  pendingNextInput = "";
  applyComposerText(value);
}
export function usesLegacyAppleTerminal(
  platform = process.platform,
  terminalProgram = process.env.TERM_PROGRAM ?? "",
): boolean {
  return platform === "darwin" && terminalProgram === "Apple_Terminal";
}

// Avoid terminal protocols that Apple Terminal does not support, while preserving overrides.
export function shouldDisableGraphicsProbe(legacyAppleTerminal: boolean, existingOverride: string | undefined): boolean {
  return legacyAppleTerminal && existingOverride === undefined;
}
export function shouldForceTruecolor(legacyAppleTerminal: boolean, existingOverride: string | undefined): boolean {
  return legacyAppleTerminal && existingOverride === undefined;
}
export function shouldSubmitLegacyAppleTerminalReturn(
  legacyAppleTerminal: boolean,
  promptActive: boolean,
  keyName: string,
): boolean {
  return legacyAppleTerminal && promptActive && keyName === "enter";
}

export function promptInputKeyBindings(_legacyAppleTerminal: boolean) {
  return [
    { name: "return", shift: true, action: "newline" as const },
    { name: "return", meta: true, action: "newline" as const },
    { name: "return", ctrl: true, action: "newline" as const },
    { name: "return", ctrl: false, shift: false, meta: false, action: "submit" as const },
  ];
}

export function promptInputHeight(value: string, width: number, maxRows = 8): number {
  const columns = Math.max(1, Math.floor(width));
  const cap = Math.max(1, Math.floor(maxRows) || 1);
  const requestedRows = value.split("\n").reduce(
    (rows, line) => rows + Math.max(1, Math.ceil([...line].length / columns)),
    0,
  );
  return Math.min(cap, Math.max(Math.min(3, cap), requestedRows));
}

export function terminalWidth(): number { return process.stdout.columns || 80; }
/** Terminal panel rows: compact by default, ~60% of the screen when expanded. */
export function terminalPanelHeight(expanded: boolean, totalRows: number): number {
  return expanded ? Math.max(10, Math.floor(totalRows * 0.6)) : 8;
}
export function clipText(value: string, max: number): string {
  if (max <= 0) return "";
  const chars = [...value];
  return chars.length <= max ? value : chars.slice(0, Math.max(0, max - 1)).join("") + "…";
}
export function layoutSupported(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && (process.stdout.columns ?? 80) >= 40 && (process.stdout.rows ?? 24) >= 12);
}
export function resetScreen(): void { clearLog(); }
export function clearScreen(): void { clearLog(); }

export function startTerminalPanel(command: string): void {
  setTerminal({ command, lines: [], exitCode: null });
  setTerminalVisible(true);
}
const MAX_TERMINAL_LINES = 2000;
export function appendTerminalOutput(text: string): void {
  const clean = cleanAnsi(text);
  if (!clean) return;
  setTerminal((current) => current
    ? { ...current, lines: [...current.lines, ...clean.split("\n")].slice(-MAX_TERMINAL_LINES) }
    : current);
}
export function finishTerminalPanel(exitCode: number | null): void {
  setTerminal((current) => current ? { ...current, exitCode } : current);
}
export function toggleTerminalPanel(): void {
  if (terminal()) setTerminalVisible((visible) => !visible);
}
export function clearTerminalPanel(): void { setTerminal(null); setTerminalVisible(false); }
export function terminalPanelVisible(): boolean { return terminalVisible(); }
export function terminalPanelState(): { command: string; exitCode: number | null; lines: string[] } | null {
  const current = terminal();
  return current ? { command: current.command, exitCode: current.exitCode, lines: [...current.lines] } : null;
}

export function listenKeys(handler: (key: Key) => void, onError?: () => void, _opts: { background?: boolean } = {}): () => void {
  const wrapped = (key: Key) => {
    try { handler(key); } catch { remove(); onError?.(); }
  };
  const remove = () => keyHandlers.delete(wrapped);
  keyHandlers.add(wrapped);
  return remove;
}

export function startBackgroundCommandListener(onCommand: (command: string) => void): () => void {
  let typed = "";
  return listenKeys((key) => {
    if (key.name === "escape" || key.name === "ctrl+c") { typed = ""; return; }
    if (key.name === "enter") {
      if (typed.trim() === "/subagents" || typed.trim().startsWith("/subagents ")) onCommand(typed.trim());
      typed = "";
      return;
    }
    if (key.name === "backspace") typed = typed.slice(0, -1);
    else if (key.name === "text" || key.name === "paste") typed += key.text ?? "";
    else if (key.name === "space") typed += " ";
    if (typed.length > 200) typed = typed.slice(-200);
  }, undefined, { background: true });
}

export function createInput(): InputController {
  return {
    question(prompt = ""): Promise<string> {
      if (!renderer) {
        return new Promise((resolve) => {
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          rl.question(prompt || "> ", (value) => { rl.close(); resolve(value.trim()); });
        });
      }
      if (inputResolver) throw new Error("An input request is already active.");
      setSecretMode(false);
      setSecretDraft("");
      historyIndex = -1;
      if (getSelectedAgentId() === MAIN_AGENT_ID) {
        if (pendingNextInput) {
          const value = pendingNextInput;
          pendingNextInput = "";
          drafts.set(MAIN_AGENT_ID, value);
          setDraft(value);
          setCompletionHiddenFor("");
          textarea?.setText(value);
          textarea?.gotoBufferEnd();
        }
        // The composer stays live between turns: a draft typed while main was
        // working is preserved rather than overwritten by an empty prompt.
        if (focusMode() === "composer" && !pickerResolver && !secretResolver && !approvalPromptState()) {
          setInputActive(true);
          textarea?.focus();
        }
      }
      // A sub-agent is selected: its draft and focus stay untouched while the
      // main question remains pending for when main is selected again.
      return new Promise((resolve) => { inputResolver = resolve; });
    },
    questionSecret(prompt = ""): Promise<string | null> {
      if (!renderer) {
        const stdin = process.stdin;
        if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
          throw new Error("Masked API-key entry requires a TTY. Set the provider API key in an environment variable instead.");
        }
        return new Promise((resolve) => {
          const wasRaw = stdin.isRaw;
          let value = "";
          const finish = (result: string | null) => {
            stdin.off("data", onData);
            stdin.setRawMode(wasRaw);
            process.stdout.write("\\n");
            resolve(result);
          };
          const onData = (chunk: Buffer | string) => {
            for (const character of chunk.toString("utf8")) {
              if (character === "\\r" || character === "\\n") {
                finish(value);
                return;
              }
              if (character === "\\u0003" || character === "\\u001b") {
                finish(null);
                return;
              }
              if (character === "\\u007f" || character === "\\b") {
                value = [...value].slice(0, -1).join("");
              } else if (character === "\\u0015") {
                value = "";
              } else if (character >= " ") {
                value += character;
              }
            }
          };
          process.stdout.write(prompt);
          stdin.setRawMode(true);
          stdin.resume();
          stdin.on("data", onData);
        });
      }
      if (inputResolver || secretResolver) throw new Error("An input request is already active.");
      setDraft("");
      setCompletionHiddenFor("");
      setSecretDraft("");
      setSecretMode(true);
      setInputActive(true);
      return new Promise((resolve) => {
        appendLog(prompt, "info");
        secretResolver = resolve;
      });
    },
    close(): void {
      const resolve = inputResolver;
      const resolveSecret = secretResolver;
      inputResolver = null;
      secretResolver = null;
      setSecretMode(false);
      setSecretDraft("");
      resolveSecret?.(null);
      setInputActive(false);
      setDraft("");
      setCompletionHiddenFor("");
      historyIndex = -1;
      textarea?.setText("");
      resolve?.("");
    },
    showPrompt(): void { applyFocus("composer"); },
    submitExternal(text: string): boolean {
      if (!inputResolver) return false;
      const trimmed = text.trim();
      pushHistory(trimmed);
      const resolve = inputResolver;
      inputResolver = null;
      // Only the main composer is cleared. When a sub-agent is selected its
      // draft and focus survive an externally resolved main question.
      if (getSelectedAgentId() === MAIN_AGENT_ID) {
        drafts.set(MAIN_AGENT_ID, "");
        setDraft("");
        setCompletionHiddenFor("");
        historyIndex = -1;
        textarea?.setText("");
        if (focusMode() === "composer" && !pickerResolver && !secretResolver && !approvalPromptState()) {
          setInputActive(true);
          textarea?.focus();
        }
      }
      resolve(trimmed);
      return true;
    },
    suspend(): void {
      suspendedInputActive = inputActive();
      setInputActive(false);
      textarea?.blur();
    },
    resume(): void {
      const wasActive = suspendedInputActive;
      suspendedInputActive = false;
      if (!wasActive) return;
      // A picker, secret prompt or another approval may still own the keyboard.
      if (pickerResolver || secretResolver || approvalPromptState()) return;
      setInputActive(true);
      textarea?.focus();
    },
  };
}

export function pick(options: { title: string; items: PickItem[]; current?: string; allowCustom?: boolean }): Promise<string | null> {
  if (!renderer || options.items.length === 0) return Promise.resolve(null);
  if (pickerResolver) choosePicker(null);
  const filtered = filteredPicker("", options.items, options.allowCustom);
  const match = filtered.findIndex((item) => !item.header && item.value === options.current);
  const selected = match >= 0 ? match : nextPickerIndex(filtered, -1, 1);
  setPicker({ title: options.title, items: options.items, filtered, selected, query: "", allowCustom: options.allowCustom === true });
  return new Promise((resolve) => { pickerResolver = resolve; });
}

// Compatibility parser for callers and tests; live input is owned by OpenTUI.
const KEY_NAMES: Record<string, string> = {
  "\r": "enter", "\n": "shift+enter", "\x1b\r": "shift+enter", "\x1b\n": "shift+enter",
  "\x03": "ctrl+c", "\x04": "ctrl+d", "\x7f": "backspace", "\b": "backspace",
  "\t": "tab", "\x1b": "escape", "\x1b[A": "up", "\x1bOA": "up",
  "\x1b[B": "down", "\x1bOB": "down", "\x1b[C": "right", "\x1bOC": "right",
  "\x1b[D": "left", "\x1bOD": "left", "\x1b[H": "home", "\x1bOH": "home",
  "\x1b[F": "end", "\x1bOF": "end", "\x1b[3~": "delete", "\x1b[5~": "pageup",
  "\x1b[1~": "home", "\x1b[4~": "end", "\x1b[6~": "pagedown",
  "\x1b[1;5D": "word-left", "\x1b[1;3D": "word-left", "\x1bb": "word-left",
  "\x1b[1;5C": "word-right", "\x1b[1;3C": "word-right", "\x1bf": "word-right",
  "\x1b[13;2u": "shift+enter", "\x1b[13;3u": "shift+enter", "\x1b[13;5u": "shift+enter",
  "\x1b[27u": "escape", "\x1b[98;3u": "word-left", "\x1b[102;3u": "word-right",
  "\x1b[18;5u": "ctrl+o", "\x1b[20;5u": "ctrl+t",
  "\x1b\x7f": "ctrl+w", "\x0c": "ctrl+l", "\x0f": "ctrl+o", "\x14": "ctrl+t",
};
export function parseKeys(chunk: string, state: { paste: string | null }): Key[] {
  const keys: Key[] = [];
  const tokens = chunk.match(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1bO[A-Za-z]|\x1b[\s\S]|[\s\S]/gu) ?? [];
  let text = "";
  const flush = () => { if (text) keys.push({ name: "text", text }); text = ""; };
  for (const token of tokens) {
    if (state.paste !== null) {
      if (token === "\x1b[201~") { flush(); keys.push({ name: "paste", text: state.paste }); state.paste = null; }
      else if (token !== "\x1b[200~") state.paste += token;
      continue;
    }
    if (token === "\x1b[200~") { flush(); state.paste = ""; continue; }
    const name = KEY_NAMES[token];
    if (name) { flush(); keys.push({ name }); }
    else if (token.startsWith("\x1b")) { flush(); keys.push({ name: "unknown" }); }
    else if (token >= " ") text += token;
    else { flush(); keys.push({ name: "unknown" }); }
  }
  flush();
  return keys;
}
