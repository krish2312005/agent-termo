import { createCliRenderer, RGBA, SyntaxStyle, type CliRenderer, type TextareaRenderable } from "@opentui/core";
import { render, useKeyboard, useRenderer } from "@opentui/solid";
import { For, Show, createSignal, onCleanup, type Accessor } from "solid-js";
import { createInterface } from "node:readline";
import packageJson from "../../package.json" with { type: "json" };

export type UiKind = "user" | "assistant" | "tool" | "info" | "success" | "error" | "dim" | "markdown" | "diff-add" | "diff-remove" | "diff-context";
export interface UiEntry { id: number; kind: UiKind; content: string; streaming?: boolean; }
export interface Key { name: string; text?: string; }
export interface CommandInfo { name: string; description: string; }
export interface PickItem { value: string; label: string; hint?: string; }
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
  close: () => void;
  showPrompt: () => void;
}

const [entries, setEntries] = createSignal<UiEntry[]>([]);
const [status, setStatus] = createSignal("");
const [screen, setScreen] = createSignal({ model: "", project: "", thinking: "auto", usage: "0 tokens", permissionMode: "ask" as "ask" | "files" | "auto" });
const [commands, setCommandsState] = createSignal<CommandInfo[]>([]);
const [agentNames, setAgentNamesState] = createSignal<string[]>([]);
const [contextFiles, setContextFilesState] = createSignal<string[]>([]);
const [draft, setDraft] = createSignal("");
const [completionHiddenFor, setCompletionHiddenFor] = createSignal("");
const [inputActive, setInputActive] = createSignal(false);
const [terminal, setTerminal] = createSignal<{ command: string; lines: string[]; exitCode: number | null } | null>(null);
const [terminalVisible, setTerminalVisible] = createSignal(false);
const [picker, setPicker] = createSignal<PickerState | null>(null);
const [completionSelected, setCompletionSelected] = createSignal(0);
let nextId = 1;
let renderer: CliRenderer | null = null;
let textarea: TextareaRenderable | undefined;
let inputResolver: ((value: string) => void) | null = null;
let pickerResolver: ((value: string | null) => void) | null = null;
let historyIndex = -1;
let historyDraft = "";
let nextInput = "";
let keyInterceptor: ((key: Key) => boolean) | null = null;
const keyHandlers = new Set<(key: Key) => void>();
const history: string[] = [];

function cleanAnsi(value: string): string {
  return value
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\r/g, "");
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

function filteredPicker(query: string, items: PickItem[], allowCustom = false): PickItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = items.filter((item) => {
    const haystack = (item.label + " " + (item.hint ?? "")).toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
  const typed = query.trim();
  if (allowCustom && typed.includes("/") && !items.some((item) => item.value === typed)) {
    filtered.push({ value: typed, label: typed, hint: "use as typed" });
  }
  return filtered;
}

function choosePicker(value: string | null): void {
  const resolve = pickerResolver;
  pickerResolver = null;
  setPicker(null);
  resolve?.(value);
}

function submitInput(): void {
  if (!inputResolver) return;
  const value = textarea?.plainText ?? draft();
  const trimmed = value.trim();
  if (trimmed && history[0] !== trimmed) history.unshift(trimmed);
  if (history.length > 100) history.pop();
  const resolve = inputResolver;
  inputResolver = null;
  setInputActive(false);
  setDraft("");
  setCompletionHiddenFor("");
  historyIndex = -1;
  textarea?.setText("");
  resolve(trimmed);
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
  const overlayAvailableRows = (reservedRows = 0): number => {
    const terminalPanelRows = terminalVisible() && terminal() ? 8 : 0;
    return Math.max(1, (process.stdout.rows ?? 24) - 9 - terminalPanelRows - reservedRows);
  };
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
    setCompletionSelected(0);
    if (item.kind === "command" && submitCommand) submitInput();
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
    const currentPicker = picker();

    if (currentPicker) {
      if (name === "up") setPicker((current) => current ? { ...current, selected: Math.max(0, current.selected - 1) } : current);
      else if (name === "down") setPicker((current) => current ? { ...current, selected: Math.min(Math.max(0, current.filtered.length - 1), current.selected + 1) } : current);
      else if (name === "enter") choosePicker(currentPicker.filtered[currentPicker.selected]?.value ?? null);
      else if (name === "escape" || name === "ctrl+c") choosePicker(null);
      else if (name === "backspace") setPicker((current) => {
        if (!current) return current;
        const query = current.query.slice(0, -1);
        const filtered = filteredPicker(query, current.items, current.allowCustom);
        return { ...current, query, filtered, selected: Math.min(current.selected, Math.max(0, filtered.length - 1)) };
      });
      else if (key.text && key.text.length > 0 && key.text >= " ") setPicker((current) => {
        if (!current) return current;
        const query = current.query + key.text;
        return { ...current, query, filtered: filteredPicker(query, current.items, current.allowCustom), selected: 0 };
      });
      event.preventDefault();
      return;
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
    if (name === "ctrl+o" || name === "ctrl+t") {
      if (terminal()) setTerminalVisible((visible) => !visible);
      event.preventDefault();
      return;
    }
    if (name === "ctrl+c" && inputActive()) {
      const currentText = textarea?.plainText ?? draft();
      if (currentText) {
        textarea?.setText("");
        setDraft("");
        setCompletionHiddenFor("");
        historyIndex = -1;
        setCompletionSelected(0);
      } else {
        process.emit("SIGINT");
      }
      event.preventDefault();
      return;
    }
  });

  const colors: Record<UiKind, string> = {
    user: "#8FCB9B", assistant: "#E6E1DC", tool: "#79B8D1", info: "#8BB7D8",
    success: "#8FCB9B", error: "#E47D76", dim: "#88827C", markdown: "#E6E1DC",
    "diff-add": "#B7E4C7", "diff-remove": "#F0B4AE", "diff-context": "#BDB6AE",
  };

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor="#11100F" paddingX={1} gap={0}>
      <box height={2} flexDirection="row" justifyContent="space-between" alignItems="center">
        <box flexDirection="row" alignItems="center" gap={1}>
          <text fg="#D99168">✻ Agent-Termo</text>
          <text fg="#8D857D">v{packageJson.version}</text>
        </box>
        <text fg="#89827C">{screen().model} · {screen().project}</text>
      </box>
      <scrollbox flexGrow={1} flexBasis={0} minHeight={0} stickyScroll stickyStart="bottom" viewportCulling contentOptions={{ layoutMode: "list" }}>
        <For each={entries()}>
          {(entry) => (
            <box flexDirection="column" paddingX={1}>
              <Show when={entry.kind === "diff-add" || entry.kind === "diff-remove"} fallback={
                <Show when={entry.kind === "markdown" || entry.kind === "diff-context"} fallback={<text fg={colors[entry.kind]}>{entry.content}</text>}>
                  <Show when={entry.kind === "markdown"} fallback={<text fg={colors["diff-context"]}>{entry.content}</text>}>
                    <markdown content={entry.content} syntaxStyle={syntaxStyle} streaming={entry.streaming ?? false} />
                  </Show>
                </Show>
              }>
                <box width="100%" paddingX={1} backgroundColor={entry.kind === "diff-add" ? "#17351F" : "#3A1D1D"}>
                  <text fg={entry.kind === "diff-add" ? "#B7E4C7" : "#F0B4AE"}>{entry.content}</text>
                </box>
              </Show>
            </box>
          )}
        </For>
      </scrollbox>
      <Show when={terminalVisible() && terminal()} fallback={<box height={0} />}>
        <box height={8} border borderStyle="single" borderColor="#6D625A" paddingX={1} flexDirection="column">
          <text fg="#D99168">Terminal · {terminal()!.command} · {terminal()!.exitCode === null ? "running" : "exit " + terminal()!.exitCode}</text>
          <scrollbox flexGrow={1} minHeight={0} stickyScroll stickyStart="bottom">
            <text fg="#C9C1BA">{terminal()!.lines.slice(-5).join("\n")}</text>
          </scrollbox>
        </box>
      </Show>
      <Show when={currentPicker()} fallback={<box height={0} />}>
        {(current: Accessor<PickerState>) => (
          <box border borderStyle="rounded" borderColor="#D99168" paddingX={1} flexDirection="column" flexShrink={0}>
            <text fg="#D99168">{current().title}</text>
            <text fg="#8F8982">Filter: {current().query}</text>
            <For each={visiblePickerItems()}>
              {(item) => <text fg={item.selected ? "#F0B38D" : "#D0C9C2"}>{item.selected ? "› " : "  "}{item.label}{item.hint ? "  " + item.hint : ""}</text>}
            </For>
            <text fg="#8F8982">↑ ↓ move · type to filter · Enter select · Esc cancel</text>
          </box>
        )}
      </Show>
      <Show when={inputActive() && completionItems().length > 0 && !currentPicker()} fallback={<box height={0} />}>
        <box paddingX={2} flexDirection="column" flexShrink={0}>
          <For each={visibleCompletionItems()}>
            {(item) => <text fg={item.selected ? "#F0B38D" : "#8EAAA8"}>{item.selected ? "› " : "  "}{item.label}{item.hint ? "  " + item.hint : ""}</text>}
          </For>
        </box>
      </Show>
      <box border borderStyle="single" borderColor={inputActive() ? "#D99168" : "#6D625A"} paddingX={1} flexDirection="row" alignItems="flex-start" flexShrink={0}>
        <text width={2} fg="#D99168">❯ </text>
        <textarea
          ref={(element) => { textarea = element; }}
          flexGrow={1}
          flexBasis={0}
          minWidth={0}
          height={promptInputHeight(
            draft(),
            textarea?.width || (process.stdout.columns ?? 80) - 8,
            Math.max(3, Math.min(8, (process.stdout.rows ?? 24) - 11)),
          )}
          focused={inputActive() && !currentPicker()}
          placeholder="Ask anything… or type / for commands"
          onContentChange={() => {
            const value = textarea?.plainText ?? "";
            if (value !== draft()) setCompletionHiddenFor("");
            setDraft(value);
            setCompletionSelected(0);
          }}
          onSubmit={submitInput}
          keyBindings={promptInputKeyBindings(legacyAppleTerminal)}
        />
      </box>
      <box height={1} flexDirection="row" justifyContent="space-between">
        <text fg="#8D857D">{screen().thinking} · {screen().permissionMode} · {screen().usage}</text>
        <text fg="#8D857D">{status() || (legacyAppleTerminal
          ? "Return send · Shift+Return newline · Tab complete · Ctrl+C quit"
          : "Enter send · Shift+Enter newline · Tab complete · Ctrl+C quit")}</text>
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
  if (!current.isDestroyed) current.destroy();
  await current.closed.catch(() => {});
}

export function setScreenStatus(info: { model?: string; project?: string; thinking?: string; usage?: string }): void {
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
  nextInput = value;
  setDraft(value);
  setCompletionHiddenFor("");
  textarea?.setText(value);
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
  const requestedRows = value.split("\n").reduce(
    (rows, line) => rows + Math.max(1, Math.ceil([...line].length / columns)),
    0,
  );
  return Math.min(Math.max(3, maxRows), Math.max(3, requestedRows));
}

export function terminalWidth(): number { return process.stdout.columns || 80; }
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
export function appendTerminalOutput(text: string): void {
  const clean = cleanAnsi(text);
  if (!clean) return;
  setTerminal((current) => current ? { ...current, lines: [...current.lines, ...clean.split("\n")] } : current);
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
      setDraft(nextInput);
      setCompletionHiddenFor("");
      historyIndex = -1;
      historyDraft = nextInput;
      textarea?.setText(nextInput);
      nextInput = "";
      setInputActive(true);
      textarea?.focus();
      return new Promise((resolve) => { inputResolver = resolve; });
    },
    close(): void {
      const resolve = inputResolver;
      inputResolver = null;
      setInputActive(false);
      setDraft("");
      setCompletionHiddenFor("");
      historyIndex = -1;
      textarea?.setText("");
      resolve?.("");
    },
    showPrompt(): void { setInputActive(true); textarea?.focus(); },
  };
}

export function pick(options: { title: string; items: PickItem[]; current?: string; allowCustom?: boolean }): Promise<string | null> {
  if (!renderer || options.items.length === 0) return Promise.resolve(null);
  if (pickerResolver) choosePicker(null);
  const filtered = filteredPicker("", options.items, options.allowCustom);
  const selected = Math.max(0, filtered.findIndex((item) => item.value === options.current));
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
