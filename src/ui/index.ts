// Agent-Termo presentation facade. The active TUI routes messages into the
// OpenTUI scene; the non-interactive fallback writes plain output to stdout.

import type { ProposedFileChange } from "../types/index.js";
import type { GitGraphRow } from "../runtime/git-graph.js";
import Chalk from "chalk";
import packageJson from "../../package.json" with { type: "json" };
import { loadMemory, loadTimeline } from "../memory/index.js";
import { getSubAgent, listSubAgents, subscribeSubAgents } from "../runtime/subagents.js";
import { buildInspector, formatDuration, statusIcon } from "./subagent-view.js";
import {
  appendAssistantDelta,
  appendLog,
  appendGitGraphRows,
  beginAssistantStream,
  finishAssistantStream,
  getCommands,
  isRendererActive,
  setActivityStatus,
  terminalWidth,
  clipText,
  listenKeys,
  clearLog,
  type UiKind,
} from "./tui.js";

export * from "./screen.js";
export { openGitDashboard, closeGitDashboard } from "./tui.js";

export { applySecretPaste, formatContextMeter, formatFooter, formatTokenCount, getCommands } from "./tui.js";
export type { FooterOptions, FooterVariant } from "./tui.js";

export interface CommandInfo {
  name: string;
  description: string;
  usage?: string;
  aliases?: string[];
  project?: boolean;
}

export const COMMANDS: CommandInfo[] = [
  { name: "/help", description: "show commands, usage for commands with arguments, and keyboard shortcuts", usage: "/help", aliases: ["/"] },
  { name: "/clear", description: "clear the current conversation and screen", usage: "/clear", aliases: ["/cls"] },
  { name: "/sessions", description: "list saved conversations", usage: "/sessions" },
  { name: "/resume", description: "restore a saved conversation by ID or choose one", usage: "/resume [session-id]" },
  { name: "/fork", description: "create a new conversation from the current or a saved session", usage: "/fork [session-id]" },
  { name: "/plan", description: "create, approve, or cancel an execution plan", usage: "/plan <task> | /plan approve | /plan cancel" },
  { name: "/checkpoint", description: "create a manual rollback checkpoint with an optional label", usage: "/checkpoint [label]" },
  { name: "/checkpoints", description: "list saved file-change checkpoints", usage: "/checkpoints" },
  { name: "/undo", description: "restore the latest or a selected checkpoint", usage: "/undo [checkpoint-id]" },
  { name: "/redo", description: "reapply the most recently undone checkpoint", usage: "/redo" },
  { name: "/memory", description: "view project memory (docs/MEMORY.md)", usage: "/memory" },
  { name: "/remember", description: "save a durable project fact or decision to memory", usage: "/remember <fact>" },
  { name: "/recall", description: "search earlier saved sessions and add matching excerpts to context", usage: "/recall <search text>" },
  { name: "/timeline", description: "view project timeline (docs/TIMELINE.md)", usage: "/timeline", aliases: ["/tl"] },
  { name: "/model", description: "choose a model or switch directly by model ID", usage: "/model [model-id]" },
  { name: "/providers", description: "add, switch, list, and configure model API providers", usage: "/providers [list | use <provider-id> | <provider-id>]" },
  { name: "/mcp", description: "show configured MCP servers and their available tools", usage: "/mcp" },
  { name: "/git", description: "browse the color-coded Git graph, repository branches, commits, and GitHub activity", usage: "/git [graph [limit] | info | branches | commit [hash] | github | help]" },
  { name: "/git graph", description: "open the visual commit graph", usage: "/git graph" },
  { name: "/git status", description: "inspect staged, unstaged, untracked and conflicted files", usage: "/git status" },
  { name: "/git branches", description: "inspect local and remote branches", usage: "/git branches" },
  { name: "/git commits", description: "browse recent commits", usage: "/git commits" },
  { name: "/git remotes", description: "inspect configured remotes", usage: "/git remotes" },
  { name: "/git diff", description: "inspect staged and unstaged diff summaries", usage: "/git diff" },
  { name: "/git stash", description: "inspect saved stashes", usage: "/git stash" },
  { name: "/git tags", description: "inspect repository tags", usage: "/git tags" },
  { name: "/git github", description: "open GitHub repository activity", usage: "/git github" },
  { name: "/git prs", description: "inspect pull requests", usage: "/git prs" },
  { name: "/git issues", description: "inspect issues", usage: "/git issues" },
  { name: "/git actions", description: "inspect recent GitHub Actions runs", usage: "/git actions" },
  { name: "/git releases", description: "inspect releases", usage: "/git releases" },
  { name: "/git checkout", description: "switch branches after confirmation", usage: "/git checkout <branch>" },
  { name: "/git create", description: "create and switch to a branch after confirmation", usage: "/git create <branch>" },
  { name: "/git delete", description: "safely delete a merged branch after confirmation", usage: "/git delete <branch>" },
  { name: "/git merge", description: "merge a branch into the current branch after confirmation", usage: "/git merge <branch>" },
  { name: "/thinking", description: "choose the model's reasoning capacity", usage: "/thinking [off | auto | low | medium | high]" },
  { name: "/permissions", description: "set or cycle file and terminal permission behavior", usage: "/permissions [ask | files | auto]" },
  { name: "/agents", description: "list custom agents and choose the active agent", usage: "/agents" },
  { name: "/skill", description: "list, use, create, import, inspect, refresh, or delete skills", usage: "/skill <list | use | add | import | show | refresh | delete> [name] [arguments]" },
  { name: "/agent", description: "choose a custom agent or assign a task to one", usage: "/agent [name [task]]" },
  { name: "/agent-folder", description: "create or refresh the project agent and command folders", usage: "/agent-folder" },
  { name: "/goal", description: "set or show the current task goal", usage: "/goal [description]" },
  { name: "/status", description: "show project, model, permissions, token, agent, and task status", usage: "/status" },
  { name: "/terminal", description: "list terminal activity or stop running commands", usage: "/terminal [list | kill [session-id]]" },
  { name: "/context", description: "inspect context usage for the main agent and sub-agents, or set this model's context window", usage: "/context [all | agent-name | size | set <size> | reset]" },
  { name: "/compact", description: "summarize and compact older conversation context", usage: "/compact" },
  { name: "/continue", description: "resume an interrupted task from where it stopped", usage: "/continue" },
  { name: "/report", description: "analyze the project and write a Markdown report", usage: "/report [output-path]" },
  { name: "/history", description: "show recent conversation messages (default 12, max 50)", usage: "/history [count]", aliases: ["/hist"] },
  { name: "/subagents", description: "show running and completed sub-agent work", usage: "/subagents [agent-name]" },
  { name: "/exit", description: "quit Agent-Termo", usage: "/exit", aliases: ["/quit"] },
];;

const c: typeof Chalk = Chalk as unknown as typeof Chalk;
const rule = (): string => "─".repeat(Math.max(10, Math.min(terminalWidth() - 2, 100)));
function print(content: string, kind: UiKind = "info"): void { appendLog(content, kind); }

export function printWelcome(projectRoot: string, model: string): void {
  print("✻ Agent-Termo v" + packageJson.version, "success");
  print("model  " + model, "info");
  print("cwd    " + projectRoot, "info");
  print("/help · /model · @agent · Tab", "dim");
}

function inline(text: string): string {
  return text
    .split(/(\x60[^\x60]+\x60)/)
    .map((segment) =>
      segment.length > 1 && segment.startsWith("\x60") && segment.endsWith("\x60")
        ? c.cyan(segment.slice(1, -1))
        : segment
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => c.cyan(label) + c.dim(" (" + url + ")"))
            .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_match, boldA: string, boldB: string) => c.bold(boldA ?? boldB))
            .replace(/~~(.+?)~~/g, (_match, value: string) => c.strikethrough(value))
            .replace(/(?<!\w)\*([^*\n]+)\*|(?<!\w)_([^_\n]+)_/g, (_match, italicA: string, italicB: string) => c.italic(italicA ?? italicB))
            .replace(/\*\*|__|~~/g, ""),
    )
    .join("");
}

export class MarkdownPrinter {
  private pending = "";
  private inCode = false;
  private first = true;
  private lastBlank = false;
  private partialLine = false;
  private streaming = false;

  constructor(private readonly beforeFirstOutput?: () => void) {
    this.streaming = isRendererActive();
  }

  push(text: string): void {
    if (this.streaming) {
      if (!this.first) {
        appendAssistantDelta(text);
        return;
      }
      if (!text) return;
      this.beforeFirstOutput?.();
      beginAssistantStream();
      this.first = false;
      appendAssistantDelta(text);
      return;
    }

    this.pending += text;
    let newline = this.pending.indexOf("\n");
    while (newline !== -1) {
      const line = this.pending.slice(0, newline).replace(/\r$/, "");
      this.pending = this.pending.slice(newline + 1);
      this.emit(line);
      newline = this.pending.indexOf("\n");
    }
  }

  end(): void {
    if (this.streaming) {
      if (!this.first) finishAssistantStream();
      return;
    }
    if (this.pending) this.emit(this.pending.replace(/\r$/, ""));
    else if (this.partialLine) appendLog("\n", "markdown");
    this.pending = "";
    this.partialLine = false;
  }

  flushPartial(): void {
    if (this.streaming || !this.pending || this.inCode) return;
    if (this.first) {
      this.beforeFirstOutput?.();
      appendLog("\n", "markdown");
    }
    const prefix = this.first ? c.magenta("● ") : this.partialLine ? "" : "  ";
    this.first = false;
    appendLog(prefix + this.render(this.pending), "markdown");
    this.pending = "";
    this.partialLine = true;
  }

  get printed(): boolean {
    return !this.first;
  }

  private emit(line: string): void {
    const blank = line.trim() === "";
    if (!this.inCode && blank && (this.first || this.lastBlank)) return;
    this.lastBlank = blank && !this.inCode;
    if (this.first) {
      this.beforeFirstOutput?.();
      appendLog("\n", "markdown");
    }
    const prefix = this.first ? c.magenta("● ") : this.partialLine ? "" : "  ";
    this.first = false;
    appendLog(blank && !this.inCode ? "\n" : prefix + this.render(line) + "\n", "markdown");
    this.partialLine = false;
  }

  private render(line: string): string {
    const fence = /^\s*\x60\x60\x60\s*([\w+-]*)/.exec(line);
    if (fence) {
      this.inCode = !this.inCode;
      return this.inCode ? c.dim("┌─ " + (fence[1] || "code")) : c.dim("└─");
    }
    if (this.inCode) return c.dim("│ ") + c.cyan(line.replace(/\t/g, "  "));
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) return c.bold.magenta(inline(heading[2] ?? ""));
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) return c.dim("─".repeat(Math.min(40, terminalWidth() - 4)));
    const task = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (task) return (task[1] ?? "") + c.magenta(task[2]?.toLowerCase() === "x" ? "☑" : "☐") + " " + inline(task[3] ?? "");
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet) return (bullet[1] ?? "") + c.magenta("•") + " " + inline(bullet[2] ?? "");
    const numbered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
    if (numbered) return (numbered[1] ?? "") + c.magenta(numbered[2] + ".") + " " + inline(numbered[3] ?? "");
    if (/^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/.test(line)) return c.dim("─".repeat(Math.min(terminalWidth() - 4, 80)));
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => inline(cell.trim()));
      return c.dim("│ ") + cells.join(c.dim(" │ ")) + c.dim(" │");
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) return c.dim("▎ ") + c.italic(inline(quote[1] ?? ""));
    return inline(line);
  }
}

export function printUserMessage(text: string): void {
  print("❯ " + text, "user");
}
export function printAssistantMessage(content: string): void {
  const markdown = new MarkdownPrinter();
  markdown.push(content);
  markdown.end();
}

subscribeSubAgents((event) => {
  const activity = event.id ? getSubAgent(event.id) : undefined;
  if (!activity) return;
  if (event.type === "spawned") print("◆ " + activity.agent + " started in parallel", "tool");
  else if (event.type === "finished") {
    const duration = formatDuration((activity.endedAt ?? Date.now()) - activity.startedAt);
    print("◆ " + statusIcon(activity.status) + " " + activity.agent + " finished in " + duration, "tool");
  }
});

export function printSubAgents(selectedId?: string): void {
  const activities = listSubAgents();
  if (activities.length === 0) { printInfo("No sub-agent activity in this session."); return; }
  if (selectedId) {
    const activity = getSubAgent(selectedId);
    if (!activity) { printInfo("Unknown sub-agent. Use /subagents to list activity IDs."); return; }
    const { head, body } = buildInspector(activity, Math.max(20, Math.min(terminalWidth() - 2, 100)));
    print("Sub-agent " + activity.agent + " [" + activity.id + "]\n" + rule() + "\n" + [...head, ...body].join("\n"), "tool");
    return;
  }
  print("Sub-agents\n" + rule(), "tool");
  for (const activity of activities) {
    const duration = formatDuration((activity.endedAt ?? Date.now()) - activity.startedAt);
    print(statusIcon(activity.status) + " " + activity.id.padEnd(12) + " " + clipText(activity.agent, 24).padEnd(24) + " " + activity.status.padEnd(9) + " " + duration.padStart(6) + " — " + clipText(activity.task.replace(/\s+/g, " "), Math.max(20, terminalWidth() - 60)), "tool");
  }
  print("Use /subagents <id> to inspect one sub-agent.", "dim");
}

export function printToolCall(toolName: string, args: Record<string, unknown>): void {
  if (toolName === "bash:execute" && typeof args.command === "string") {
    print("● " + toolName, "tool");
    print("  command:", "dim");
    const width = Math.max(20, terminalWidth() - 8);
    for (const line of args.command.split(/\r?\n/)) {
      let remaining = line;
      if (!remaining) print("    ", "dim");
      while (remaining.length > width) {
        print("    " + remaining.slice(0, width), "dim");
        remaining = remaining.slice(width);
      }
      print("    " + remaining, "dim");
    }
    return;
  }

  const summary = Object.entries(args).map(([key, value]) => key + "=" + clipText(String(typeof value === "string" ? value : JSON.stringify(value) ?? "").replace(/\s+/g, " "), 40)).join(", ");
  print("● " + toolName + "(" + clipText(summary, terminalWidth() - toolName.length - 6) + ")", "tool");
}

export function printToolResult(
  toolName: string,
  result: { success: boolean; output?: string; error?: string },
  parsedOutput?: { needsApproval?: boolean; proposedChange?: ProposedFileChange },
): void {
  if (parsedOutput?.needsApproval && parsedOutput.proposedChange) {
    printDiffViewer(parsedOutput.proposedChange);
    return;
  }
  if (toolName === "bash:execute") {
    const output = result.output || (!result.success ? result.error : "") || "(no output)";
    print("  ⎿  " + (result.success ? "✓ terminal output" : "✗ terminal output"), result.success ? "success" : "error");
    for (const line of output.split("\n")) print("     " + line, result.success ? "dim" : "error");
    return;
  }
  if (result.success) {
    const lines = (result.output ?? "").split("\n").filter((line) => line.trim());
    print("⎿ ✓ " + (lines.length > 1 ? lines.length + " lines" : clipText((lines[0] ?? "").trim() || "done", terminalWidth() - 8)), "success");
  } else {
    const message = (result.error ?? "unknown error").split("\n").find((line) => line.trim())?.trim() ?? "unknown error";
    print("⎿ ✗ " + clipText(toolName + ": " + message, terminalWidth() - 8), "error");
  }
}

export function printDiffViewer(change: ProposedFileChange): void {
  const diff = change.diff;
  const label = change.isDeletion ? "DELETE" : change.isNewFile ? "NEW" : "MODIFY";
  print(diff.file + "  " + label + "  +" + diff.additions + " -" + diff.deletions, "info");
  for (const line of diff.lines) {
    const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
    const content = prefix + String(line.lineNumber > 0 ? line.lineNumber : "").padStart(5) + " │ " + line.content.replace(/\t/g, "  ");
    print(content, line.type === "add" ? "diff-add" : line.type === "remove" ? "diff-remove" : "diff-context");
  }
}

/** Approval prompts are global and name the requesting agent when one is given. */
const requesterPrefix = (requester?: string): string => (requester ? "[" + requester + "] " : "");

export function promptAcceptReject(message = "Accept this change?", requester?: string): Promise<"accept" | "reject"> {
  print("? " + requesterPrefix(requester) + message + " [Y/n]", "info");
  return new Promise((resolve) => {
    let done = false;
    let stop: () => void = () => undefined;
    const answer = (accepted: boolean) => {
      if (done) return;
      done = true;
      stop();
      print(accepted ? "yes" : "no", accepted ? "success" : "error");
      resolve(accepted ? "accept" : "reject");
    };
    stop = listenKeys((key) => {
      if (key.name === "enter" || key.text?.[0]?.toLowerCase() === "y") answer(true);
      else if (key.name === "escape" || key.name === "ctrl+c" || key.text?.[0]?.toLowerCase() === "n") answer(false);
    }, () => answer(false));
  });
}

export function promptCommandApproval(command: string, requester?: string): Promise<"once" | "always" | "reject"> {
  print(requesterPrefix(requester) + "Allow terminal command? " + command + "\n[Y] once  [A] always for this exact command  [N] reject", "info");
  return new Promise((resolve) => {
    let done = false;
    let stop: () => void = () => undefined;
    const answer = (value: "once" | "always" | "reject") => {
      if (done) return;
      done = true;
      stop();
      print(value, value === "reject" ? "error" : "success");
      resolve(value);
    };
    stop = listenKeys((key) => {
      const first = key.text?.[0]?.toLowerCase();
      if (key.name === "enter" || first === "y") answer("once");
      else if (first === "a") answer("always");
      else if (key.name === "escape" || key.name === "ctrl+c" || first === "n") answer("reject");
    }, () => answer("reject"));
  });
}

export function printError(message: string, hint?: string): void {
  print("✗ " + message + (hint ? "\nHint: " + hint : ""), "error");
}
export function printSuccess(message: string): void { print("✓ " + message, "success"); }
export function printInfo(message: string): void { print("ℹ " + message, "info"); }

/** Add structured commit rows to the color-coded OpenTUI graph renderer. */
export function printGitGraph(title: string, rows: GitGraphRow[]): void {
  print(title, "markdown");
  appendGitGraphRows(rows);
}

/** Render repository and commit details in the existing transcript. */
export function printGitPanel(title: string, lines: string[]): void {
  print(title + (lines.length ? "\n" + lines.join("\n") : ""), "markdown");
}

export async function printMemoryFile(projectRoot: string): Promise<void> {
  const memory = await loadMemory(projectRoot);
  if (!memory.trim()) { printInfo("Project memory is empty (docs/MEMORY.md)."); return; }
  print("Project memory (docs/MEMORY.md)\n" + rule() + "\n" + memory + "\n" + rule(), "markdown");
}
export async function printTimelineFile(projectRoot: string): Promise<void> {
  const timeline = await loadTimeline(projectRoot);
  if (!timeline?.trim()) { printInfo("Project timeline is empty (docs/TIMELINE.md)."); return; }
  const lines = timeline.split("\n");
  const recentCount = Math.min(40, lines.length);
  print("Project timeline (docs/TIMELINE.md, recent entries)\n" + rule() + "\n" + lines.slice(-recentCount).join("\n") + "\n" + rule() + (lines.length > recentCount ? "\n… " + (lines.length - recentCount) + " earlier entries hidden" : ""), "markdown");
}
/** Shortcut reference derived from the live handlers (DESIGN_SYSTEM §11.6). */
const SHORTCUTS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: "Composer",
    items: [
      ["Enter", "send the message (accepts a highlighted completion first)"],
      ["Shift+Enter / Ctrl+Enter / Alt+Enter", "insert a new line"],
      ["Tab", "complete a `/command` or `@mention`"],
      ["Esc", "dismiss the completion list"],
      ["↑ / ↓", "select a completion, move the cursor, or browse history at the first/last line"],
      ["Ctrl+A / Ctrl+E", "start / end of line"],
      ["Ctrl+W / Ctrl+U", "delete word / to line start"],
      ["Ctrl+K", "delete to line end; stop the running terminal command when the composer is empty, the navigator is focused, or the prompt is inactive"],
      ["Ctrl+O", "show / hide the terminal panel (when a terminal command exists)"],
      ["Ctrl+T", "expand / shrink the terminal panel (when a terminal command exists)"],
      ["Ctrl+C", "copy the selection; otherwise clear the draft; with an empty composer, quit when no agent is live"],
    ],
  },
  {
    title: "Workspace",
    items: [
      ["Ctrl+X", "focus the navigator and arm stop-all"],
      ["↑ / ↓", "select an agent"],
      ["Enter", "focus the composer"],
      ["Esc", "select the parent agent; at main, focus the composer"],
      ["Ctrl+X then Ctrl+K within 1.5 s", "stop all agents"],
    ],
  },
  {
    title: "Response",
    items: [
      ["Esc / Ctrl+C", "cancel an in-flight model response when the navigator and prompt modals do not own the keys; a sub-agent follow-up is cancelled only while its agent is selected"],
    ],
  },
  {
    title: "Approval",
    items: [
      ["Y / Enter", "allow once"],
      ["A", "allow always for this exact terminal command"],
      ["N / Esc / Ctrl+C", "reject"],
    ],
  },
  {
    title: "Picker",
    items: [
      ["↑ / ↓", "move the selection"],
      ["type", "filter the list"],
      ["Backspace", "edit the filter"],
      ["Enter", "select"],
      ["Esc / Ctrl+C", "cancel"],
    ],
  },
  {
    title: "Secret input",
    items: [
      ["Enter", "submit"],
      ["Esc / Ctrl+C", "cancel"],
      ["Backspace", "delete"],
      ["bracketed paste", "supported"],
    ],
  },
];

const inlineCode = (text: string): string => "`" + text + "`";

/** One markdown help document from the live registry and the real handlers. */
export function helpMarkdown(commands: readonly CommandInfo[]): string {
  const commandLines = commands.map((command) => {
    const aliases = command.aliases?.length
      ? " (" + command.aliases.map(inlineCode).join(", ") + ")"
      : "";
    const project = command.project ? " (`project`)" : "";
    const usage = command.usage && command.usage !== command.name
      ? "\n  - **Usage:** " + inlineCode(command.usage)
      : "";
    return "- " + inlineCode(command.name) + aliases + " — " + command.description + project + usage;
  });
  const shortcutSections = SHORTCUTS.map((section) =>
    "## " + section.title + "\n\n" + section.items
      .map(([key, description]) => "- " + inlineCode(key) + " — " + description)
      .join("\n"),
  );
  return [
    "# Commands",
    "",
    commandLines.join("\n\n"),
    "",
    "Plain `exit` / `quit` also quit.",
    "",
    "# Shortcuts",
    "",
    shortcutSections.join("\n\n"),
  ].join("\n");
}

export function printHelp(): void {
  // The live registry is the same list command completion uses; fall back to
  // the built-in registry when no REPL has published it yet.
  const live = getCommands();
  const markdown = helpMarkdown(live.length > 0 ? live : COMMANDS);
  if (isRendererActive()) {
    // One transcript entry: the existing scrollbox makes the reference scrollable.
    print(markdown, "markdown");
    return;
  }
  // Non-TUI fallback: render the same document with the pre-theme named Chalk colors.
  const printer = new MarkdownPrinter();
  printer.push(markdown);
  printer.end();
}
export function printAgentsList(agents: Array<{ name: string; description: string }>): void {
  print("Available agents\n" + rule() + "\n" + agents.map((agent) => agent.name.padEnd(30) + clipText(agent.description.replace(/\s+/g, " "), terminalWidth() - 34)).join("\n"), "markdown");
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_TICK_MS = 80;

let spinnerTicker: ReturnType<typeof setInterval> | null = null;
let spinnerFrame = 0;
let spinnerMessage = "";

function spinnerFrameText(message: string): string {
  return SPINNER_FRAMES[spinnerFrame] + " " + message + "…";
}

/** Show the running spinner in the footer and rotate its frame every tick. */
export function startSpinner(message: string): void {
  stopSpinner();
  spinnerMessage = message;
  spinnerFrame = 0;
  setActivityStatus(spinnerFrameText(message));
  spinnerTicker = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
    setActivityStatus(spinnerFrameText(spinnerMessage));
  }, SPINNER_TICK_MS);
}

/** Stop the spinner and clear the footer status. Safe to call when not spinning. */
export function stopSpinner(_success?: boolean): void {
  if (spinnerTicker) {
    clearInterval(spinnerTicker);
    spinnerTicker = null;
  }
  spinnerFrame = 0;
  spinnerMessage = "";
  setActivityStatus("");
}

export { SPINNER_FRAMES };
export function clearScreen(): void { clearLog(); }
