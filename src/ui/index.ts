// Agent-Termo presentation facade. The active TUI routes messages into the
// OpenTUI scene; the non-interactive fallback writes plain output to stdout.

import type { ProposedFileChange } from "../types/index.js";
import Chalk from "chalk";
import { loadMemory, loadTimeline } from "../memory/index.js";
import { getSubAgent, listSubAgents, subscribeSubAgents } from "../runtime/subagents.js";
import { buildInspector, formatDuration, statusIcon } from "./subagent-view.js";
import {
  appendAssistantDelta,
  appendLog,
  beginAssistantStream,
  finishAssistantStream,
  isRendererActive,
  setActivityStatus,
  terminalWidth,
  clipText,
  listenKeys,
  clearLog,
  type UiKind,
} from "./tui.js";

export * from "./screen.js";

export interface CommandInfo {
  name: string;
  description: string;
}

export const COMMANDS: CommandInfo[] = [
  { name: "/help", description: "show all commands" },
  { name: "/clear", description: "clear conversation & screen" },
  { name: "/sessions", description: "browse saved conversations" },
  { name: "/resume", description: "restore a saved conversation" },
  { name: "/fork", description: "branch a conversation from a saved session" },
  { name: "/plan", description: "create, approve, and track an execution plan" },
  { name: "/checkpoint", description: "create a manual rollback checkpoint" },
  { name: "/checkpoints", description: "list saved file-change checkpoints" },
  { name: "/undo", description: "restore the latest or selected checkpoint" },
  { name: "/redo", description: "reapply the most recently undone checkpoint" },
  { name: "/memory", description: "view project memory (docs/MEMORY.md)" },
  { name: "/remember", description: "save a durable project fact to memory" },
  { name: "/recall", description: "search earlier saved sessions" },
  { name: "/timeline", description: "view project timeline (docs/TIMELINE.md)" },
  { name: "/model", description: "switch the active provider model (or /model <id>)" },
  { name: "/providers", description: "add, switch, and configure model API providers" },
  { name: "/thinking", description: "select NVIDIA reasoning capacity" },
  { name: "/permissions", description: "ask, files, or auto; terminal approvals can be remembered with A" },
  { name: "/agents", description: "list all agents" },
  { name: "/skill", description: "discover, use, create, import, and delete skills" },
  { name: "/agent", description: "select a custom agent" },
  { name: "/agent-folder", description: "create or refresh .agent-termo agents and commands" },
  { name: "/goal", description: "set or show the current goal" },
  { name: "/status", description: "show session status" },
  { name: "/terminal", description: "manage agent terminal (list, kill)" },
  { name: "/context", description: "show context and runtime paths" },
  { name: "/compact", description: "summarize and compact conversation context" },
  { name: "/continue", description: "resume an interrupted task from where it stopped" },
  { name: "/report", description: "analyze the project and create a report file" },
  { name: "/history", description: "show message count" },
  { name: "/subagents", description: "show running and completed sub-agent work" },
  { name: "/exit", description: "quit" },
];

const c: typeof Chalk = Chalk as unknown as typeof Chalk;
const rule = (): string => "─".repeat(Math.max(10, Math.min(terminalWidth() - 2, 100)));
function print(content: string, kind: UiKind = "info"): void { appendLog(content, kind); }

export function printWelcome(projectRoot: string, model: string): void {
  print("╭─ ✻ Agent-Termo " + "─".repeat(24) + "╮", "success");
  print("│ AI coding agent for your terminal", "dim");
  print("│ model  " + model, "info");
  print("│ cwd    " + projectRoot, "info");
  print("╰" + "─".repeat(42) + "╯", "success");
  print("/help commands · /model switch NIM model · @agent invoke · Tab completes", "dim");
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
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) return c.bold.magenta(inline(heading[1] ?? ""));
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

export function promptAcceptReject(message = "Accept this change?"): Promise<"accept" | "reject"> {
  print("? " + message + " [Y/n]", "info");
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

export function promptCommandApproval(command: string): Promise<"once" | "always" | "reject"> {
  print("Allow terminal command? " + command + "\n[Y] once  [A] always for this exact command  [N] reject", "info");
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
export function printHelp(): void {
  const keys: Array<[string, string]> = [
    ["Enter", "send the message"], ["Shift+Enter", "insert a new line"],
    ["Ctrl+O / Ctrl+T", "toggle terminal output"], ["↑ / ↓", "move cursor or select"],
    ["Tab", "complete a /command or @mention"], ["Ctrl+A / Ctrl+E", "start / end of line"],
    ["Ctrl+W / Ctrl+U", "delete word / to line start"], ["Ctrl+C", "clear the line, or quit when empty"],
  ];
  print("Commands\n" + rule() + "\n" + COMMANDS.map((command) => command.name.padEnd(14) + command.description).join("\n") + "\n\nKeys\n" + rule() + "\n" + keys.map(([key, description]) => key.padEnd(20) + description).join("\n"), "markdown");
}
export function printAgentsList(agents: Array<{ name: string; description: string }>): void {
  print("Available agents\n" + rule() + "\n" + agents.map((agent) => agent.name.padEnd(30) + clipText(agent.description.replace(/\s+/g, " "), terminalWidth() - 34)).join("\n"), "markdown");
}

export function startSpinner(message: string): void { setActivityStatus("⠋ " + message + "…"); }
export function stopSpinner(_success?: boolean): void { setActivityStatus(""); }
export function clearScreen(): void { clearLog(); }
