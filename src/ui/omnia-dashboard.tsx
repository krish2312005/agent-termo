import type { ScrollBoxRenderable } from "@opentui/core";
import { For, Show, createEffect } from "solid-js";
import type { OmniaRun, OmniaStatus } from "../runtime/omnia/types.js";
import { MAX_OMNIA_REPAIR_ATTEMPTS } from "../runtime/omnia/index.js";
import { ROLES } from "./theme.js";

export interface OmniaDashboardStats {
  verified: number;
  total: number;
  evidenceCount: number;
  repairAttempts: number;
  progressPercent: number;
}
export interface OmniaCodeLine {
  id: number;
  kind: string;
  content: string;
}
export interface OmniaActivityEntry {
  id: number;
  kind: string;
  content: string;
  streaming?: boolean;
  title?: string;
  lines?: OmniaCodeLine[];
}
export const OMNIA_DASHBOARD_LEADER_WINDOW_MS = 1_500;

export function shouldReopenOmniaDashboard(
  keyName: string,
  keyText: string | undefined,
  leaderArmedAt: number | undefined,
  now: number,
): boolean {
  return keyName === "text" &&
    keyText?.toLowerCase() === "o" &&
    leaderArmedAt !== undefined &&
    now - leaderArmedAt >= 0 &&
    now - leaderArmedAt <= OMNIA_DASHBOARD_LEADER_WINDOW_MS;
}

const MAX_VISIBLE_EVIDENCE = 8;
const MAX_VISIBLE_ACTIVITY = 40;
const MAX_ACTIVITY_LINES = 80;

const isDiffLine = (entry: OmniaActivityEntry): boolean =>
  entry.kind === "diff-add" || entry.kind === "diff-remove" || entry.kind === "diff-context";

const isDiffHeader = (entry: OmniaActivityEntry, next: OmniaActivityEntry | undefined): boolean =>
  entry.kind === "info" &&
  /\s(?:NEW|MODIFY|DELETE)\s+\+\d+\s+-\d+\s*$/i.test(entry.content) &&
  Boolean(next && isDiffLine(next));

/** Turn the TUI's per-line diff log into one selectable item per changed file. */
export function groupOmniaActivityEntries(entries: readonly OmniaActivityEntry[]): OmniaActivityEntry[] {
  const grouped: OmniaActivityEntry[] = [];
  for (let index = 0; index < entries.length;) {
    const entry = entries[index]!;
    const header = isDiffHeader(entry, entries[index + 1]) ? entry : undefined;
    if (header || isDiffLine(entry)) {
      const firstLine = header ? index + 1 : index;
      const lines: OmniaCodeLine[] = [];
      let cursor = firstLine;
      while (cursor < entries.length && isDiffLine(entries[cursor]!)) {
        const line = entries[cursor]!;
        lines.push({ id: line.id, kind: line.kind, content: line.content });
        cursor++;
      }
      grouped.push({
        id: header?.id ?? lines[0]!.id,
        kind: "code-diff",
        content: "",
        ...(header ? { title: header.content } : {}),
        lines,
      });
      index = cursor;
      continue;
    }
    grouped.push(entry);
    index++;
  }
  return grouped.slice(-MAX_VISIBLE_ACTIVITY);
}

export function getOmniaDashboardStats(run: OmniaRun): OmniaDashboardStats {
  const verified = run.requirements.filter((item) => item.status === "verified").length;
  return {
    verified,
    total: run.requirements.length,
    evidenceCount: run.evidence.length,
    repairAttempts: run.repairAttempts,
    progressPercent: run.requirements.length === 0 ? 0 : Math.round((verified / run.requirements.length) * 100),
  };
}
export function getOmniaDashboardItemCount(run: OmniaRun, activityCount = 0): number {
  return run.requirements.length + Math.min(MAX_VISIBLE_EVIDENCE, run.evidence.length) +
    Math.min(MAX_VISIBLE_ACTIVITY, Math.max(0, activityCount));
}
function clip(value: string, width: number): string {
  const chars = [...value];
  return chars.length <= width ? value : chars.slice(0, Math.max(0, width - 1)).join("") + "…";
}
function activityLines(item: OmniaActivityEntry, width: number): string[] {
  if (item.lines) return item.lines.map((line) => clip(line.content || " ", Math.max(8, width - 12)));
  const content = item.content.trim() || (item.streaming ? "Generating response…" : "");
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const visible = lines.length > MAX_ACTIVITY_LINES
    ? ["… " + (lines.length - MAX_ACTIVITY_LINES + 1) + " earlier lines", ...lines.slice(-(MAX_ACTIVITY_LINES - 1))]
    : lines;
  return visible.map((line) => clip(line || " ", Math.max(8, width - 12)));
}
function activityColor(kind: string): string {
  if (kind === "diff-add" || kind === "success") return ROLES.success;
  if (kind === "diff-remove" || kind === "error") return ROLES.error;
  if (kind === "tool") return ROLES.tool;
  if (kind === "markdown" || kind === "assistant") return ROLES.detailText;
  return ROLES.dimText;
}
function statusColor(status: OmniaStatus): string {
  if (status === "completed") return ROLES.success;
  if (status === "failed" || status === "blocked") return ROLES.error;
  if (status === "executing" || status === "verifying" || status === "completed_with_warnings") return ROLES.statusRunning;
  return ROLES.dimText;
}
function requirementColor(status: string): string {
  if (status === "verified") return ROLES.success;
  if (status === "blocked") return ROLES.error;
  if (status === "unverified") return ROLES.statusRunning;
  return ROLES.dimText;
}
function activityLabel(item: OmniaActivityEntry): string {
  const labels: Record<string, string> = {
    user: "REQUEST", markdown: "ASSISTANT", assistant: "ASSISTANT", tool: "TOOL",
    info: "INFO", success: "SUCCESS", error: "ERROR", dim: "DETAIL",
    "code-diff": "CODE CHANGE",
  };
  return (labels[item.kind] ?? item.kind.toUpperCase()) + (item.streaming ? " · STREAMING" : "");
}
function getActivityOffset(activity: OmniaActivityEntry[], width: number, index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i++) offset += 2 + activityLines(activity[i]!, width).length;
  return offset;
}
export function getOmniaDashboardScrollOffset(run: OmniaRun, selected: number, activityInput: OmniaActivityEntry[] = [], width = 80): number {
  const evidence = run.evidence.slice(-MAX_VISIBLE_EVIDENCE);
  const activity = groupOmniaActivityEntries(activityInput);
  const requirementCount = run.requirements.length;
  const requirementStart = 2;
  const evidenceHeader = requirementStart + requirementCount * 4;
  const evidenceStart = evidenceHeader + 2;
  const activityStart = evidenceHeader + 2 + evidence.length * 3 + 2;
  if (selected < requirementCount) return requirementStart + selected * 4;
  if (selected < requirementCount + evidence.length) return evidenceStart + (selected - requirementCount) * 3;
  const activityIndex = selected - requirementCount - evidence.length;
  return activityStart + getActivityOffset(activity, width, Math.max(0, Math.min(activity.length, activityIndex)));
}
function Stat(props: { label: string; value: string }) {
  return (
    <box flexDirection="column" flexGrow={1} flexBasis={0} minWidth={0} paddingX={1}>
      <text fg={ROLES.mutedHeader} wrapMode="none">{props.label.toUpperCase()}</text>
      <text fg={ROLES.text} attributes={1} wrapMode="none">{props.value}</text>
    </box>
  );
}
export interface OmniaDashboardViewProps {
  run: OmniaRun;
  width: number;
  selected: number;
  activity: OmniaActivityEntry[];
}
export function OmniaDashboardView(props: OmniaDashboardViewProps) {
  const stats = () => getOmniaDashboardStats(props.run);
  const evidence = () => props.run.evidence.slice(-MAX_VISIBLE_EVIDENCE);
  const activity = () => groupOmniaActivityEntries(props.activity);
  const progressBar = () => {
    const filled = Math.floor(stats().progressPercent / 5);
    return "█".repeat(filled) + "░".repeat(20 - filled);
  };
  const statusLabel = () => clip(props.run.status.replace(/_/g, " ").toUpperCase(), Math.max(8, props.width - 32));
  const maxText = () => Math.max(12, props.width - 26);
  const selectedIndex = (index: number) => props.selected === index;
  let listScrollbox: ScrollBoxRenderable | undefined;
  createEffect(() => {
    const run = props.run;
    const selected = props.selected;
    const currentActivity = activity();
    if (!listScrollbox) return;
    const lastItem = getOmniaDashboardItemCount(run, currentActivity.length) - 1;
    if (currentActivity.length > 0 && selected >= lastItem) listScrollbox.scrollTo(Infinity);
    else listScrollbox.scrollTo(getOmniaDashboardScrollOffset(run, selected, currentActivity, props.width));
  });
  return (
    <box width="100%" flexDirection="column" flexGrow={1} flexBasis={0} flexShrink={1} minWidth={0} minHeight={0} gap={1} paddingX={1} backgroundColor={ROLES.pageBackground}>
      <box flexDirection="row" alignItems="center" justifyContent="space-between" flexShrink={0}>
        <box flexDirection="column" minWidth={0}>
          <text fg={ROLES.brand} attributes={1} wrapMode="none">TERMO OMNIA · MISSION CONTROL</text>
          <text fg={ROLES.mutedText} wrapMode="none">{clip(props.run.goal.replace(/\s+/g, " "), Math.max(16, props.width - 24))}</text>
        </box>
        <text fg={statusColor(props.run.status)} attributes={1} wrapMode="none">{statusLabel()}</text>
      </box>
      <box flexDirection="row" border borderStyle="single" borderColor={ROLES.border} flexShrink={0} paddingY={1}>
        <Stat label="Verified" value={stats().verified + "/" + stats().total} />
        <Stat label="Evidence" value={String(stats().evidenceCount)} />
        <Stat label="Repairs" value={stats().repairAttempts + "/" + MAX_OMNIA_REPAIR_ATTEMPTS} />
        <Stat label="Verification" value={stats().progressPercent + "%"} />
      </box>
      <box flexDirection="row" alignItems="center" gap={2} flexShrink={0} paddingX={1}>
        <text fg={ROLES.brand} attributes={1} wrapMode="none">VERIFICATION</text>
        <text fg={stats().progressPercent === 100 ? ROLES.success : ROLES.statusRunning} wrapMode="none">{progressBar()}</text>
        <text fg={ROLES.mutedText} wrapMode="none">{stats().verified}/{stats().total} · {stats().progressPercent}%</text>
      </box>
      <scrollbox
        ref={(element) => {
          listScrollbox = element;
          element.scrollTo(getOmniaDashboardScrollOffset(props.run, props.selected, activity(), props.width));
        }}
        width="100%"
        flexGrow={1}
        flexBasis={0}
        flexShrink={1}
        minWidth={0}
        minHeight={0}
        viewportCulling
        contentOptions={{ layoutMode: "list" }}
      >
        <box flexDirection="column" gap={1}>
          <text fg={ROLES.brand} attributes={1} wrapMode="none">REQUIREMENT CONTRACT</text>
          <For each={props.run.requirements}>
            {(requirement, index) => (
              <box flexDirection="column" paddingX={1} backgroundColor={selectedIndex(index()) ? ROLES.selection : undefined}>
                <box flexDirection="row" alignItems="center" gap={1}>
                  <text fg={requirementColor(requirement.status)} attributes={1} wrapMode="none">{requirement.status === "verified" ? "✓" : requirement.status === "blocked" ? "!" : "○"}</text>
                  <text fg={ROLES.text} attributes={1} wrapMode="none">{requirement.id}</text>
                  <text fg={ROLES.mutedText} wrapMode="none">{requirement.strategy.toUpperCase()}</text>
                  <text fg={requirementColor(requirement.status)} wrapMode="none">{requirement.status.toUpperCase()}</text>
                </box>
                <text fg={ROLES.text} wrapMode="none">{clip(requirement.description, maxText())}</text>
                <text fg={ROLES.dimText} wrapMode="none">{clip(requirement.verificationPlan, Math.max(12, props.width - 14))}</text>
              </box>
            )}
          </For>
          <text fg={ROLES.brand} attributes={1} wrapMode="none">LATEST EXECUTION EVIDENCE</text>
          <For each={evidence()}>
            {(item, index) => (
              <box flexDirection="column" paddingX={1} backgroundColor={selectedIndex(props.run.requirements.length + index()) ? ROLES.selection : undefined}>
                <box flexDirection="row" alignItems="center" gap={1}>
                  <text fg={item.success ? ROLES.success : ROLES.error} attributes={1} wrapMode="none">{item.success ? "●" : "×"}</text>
                  <text fg={ROLES.mutedCompletion} wrapMode="none">{item.type.toUpperCase()}</text>
                  <text fg={ROLES.text} wrapMode="none">{clip(item.source, Math.max(8, props.width - 34))}</text>
                </box>
                <text fg={ROLES.dimText} wrapMode="none">{clip(item.description, Math.max(12, props.width - 12))}</text>
              </box>
            )}
          </For>
          <text fg={ROLES.brand} attributes={1} wrapMode="none">LIVE ACTIVITY · ASSISTANT OUTPUT · TOOL CALLS · CODE CHANGES</text>
          <Show when={activity().length > 0} fallback={<text fg={ROLES.dimText}>Waiting for the first execution event…</text>}>
            <For each={activity()}>
              {(item, index) => {
                const lines = () => activityLines(item, props.width);
                const rowIndex = () => props.run.requirements.length + evidence().length + index();
                return (
                  <box flexDirection="column" paddingX={1} backgroundColor={selectedIndex(rowIndex()) ? ROLES.selection : undefined}>
                    <Show when={item.lines} fallback={
                      <box flexDirection="column">
                        <text fg={activityColor(item.kind)} attributes={1} wrapMode="none">{(selectedIndex(rowIndex()) ? "▸ " : "  ") + activityLabel(item)}</text>
                        <For each={lines()}>
                          {(line) => <text fg={activityColor(item.kind)} wrapMode="none">{line}</text>}
                        </For>
                      </box>
                    }>
                      <box flexDirection="column">
                        <text fg={ROLES.brand} attributes={1} wrapMode="none">{(selectedIndex(rowIndex()) ? "▸ " : "  ") + "CODE CHANGE"}</text>
                        <Show when={item.title}>
                          <text fg={ROLES.mutedText} wrapMode="none">{clip(item.title ?? "", Math.max(8, props.width - 12))}</text>
                        </Show>
                        <For each={item.lines ?? []}>
                          {(line) => <text fg={activityColor(line.kind)} wrapMode="none">{clip(line.content, Math.max(8, props.width - 12))}</text>}
                        </For>
                      </box>
                    </Show>
                  </box>
                );
              }}
            </For>
          </Show>
          <Show when={props.run.blocker} fallback={<box height={0} />}>
            <text fg={ROLES.error} wrapMode="none">{clip("BLOCKER · " + props.run.blocker, Math.max(12, props.width - 8))}</text>
          </Show>
          <Show when={props.run.summary} fallback={<box height={0} />}>
            <text fg={ROLES.detailText} wrapMode="none">{clip("SUMMARY · " + props.run.summary, Math.max(12, props.width - 8))}</text>
          </Show>
        </box>
      </scrollbox>
      <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
        <text fg={ROLES.dimText} wrapMode="none">↑ ↓ scroll · PgUp/PgDn jump · Home/End · R refresh · Esc hide · Ctrl+X then O reopen</text>
        <text fg={ROLES.mutedText} wrapMode="none">{props.run.id.slice(0, 8)}</text>
      </box>
    </box>
  );
}
