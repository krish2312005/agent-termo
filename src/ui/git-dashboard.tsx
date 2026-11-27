import type { ScrollBoxRenderable } from "@opentui/core";
import { createEffect, For, Show } from "solid-js";
import type { GitDashboardData, GitGraphRow, GitHubSummary } from "../runtime/git-graph.js";
import { GIT_GRAPH_COLORS, ROLES } from "./theme.js";

const clipText = (value: string, max: number): string => [...value].length <= max ? value : [...value].slice(0, Math.max(0, max - 1)).join("") + "…";
const laneColor = (index: number): string => GIT_GRAPH_COLORS[index % GIT_GRAPH_COLORS.length] ?? ROLES.brand;

export type GitDashboardTab =
  | "overview" | "graph" | "status" | "branches" | "diff"
  | "stash" | "remotes" | "tags" | "github" | "prs" | "issues" | "actions" | "releases";

const TABS: Array<{ id: GitDashboardTab; label: string }> = [
  { id: "overview", label: "Overview" }, { id: "graph", label: "Graph" },
  { id: "status", label: "Changes" }, { id: "branches", label: "Branches" },
  { id: "diff", label: "Diff" }, { id: "stash", label: "Stashes" },
  { id: "remotes", label: "Remotes" }, { id: "tags", label: "Tags" },
  { id: "github", label: "GitHub" }, { id: "prs", label: "PRs" }, { id: "issues", label: "Issues" },
  { id: "actions", label: "Actions" }, { id: "releases", label: "Releases" },
];

export interface GitDashboardFeedback {
  message: string;
  tone: "info" | "success" | "error";
}

export interface GitDashboardViewProps {
  data: GitDashboardData;
  github: GitHubSummary | null;
  tab: GitDashboardTab;
  selected: number;
  width: number;
  feedback?: GitDashboardFeedback;
}

export function isDashboardEnterKey(name: string, sequence = ""): boolean {
  return ["enter", "return", "kp_enter", "numpadenter"].includes(name.toLowerCase())
    || sequence === "\r"
    || sequence === "\n";
}

export function getVisibleGitDashboardTabs(tab: GitDashboardTab, width: number): Array<{ id: GitDashboardTab; label: string }> {
  const available = Math.max(12, Math.floor(width) - 6);
  const active = Math.max(0, TABS.findIndex((item) => item.id === tab));
  const itemWidth = (index: number): number => TABS[index]!.label.length + 3;
  let start = active;
  let end = active;
  let used = itemWidth(active);
  while (end + 1 < TABS.length && used + itemWidth(end + 1) <= available) used += itemWidth(++end);
  while (start > 0 && used + itemWidth(start - 1) <= available) used += itemWidth(--start);
  return TABS.slice(start, end + 1);
}

export interface GitBranchRowLayout {
  rowWidth: number;
  kindWidth: number;
  nameWidth: number;
  hashWidth: number;
  headWidth: number;
  subjectWidth: number;
}

export function getGitBranchRowLayout(width: number): GitBranchRowLayout {
  const rowWidth = Math.max(30, Math.floor(width) - 6);
  const compact = rowWidth < 76;
  const kindWidth = 8;
  const hashWidth = compact ? 0 : 8;
  const headWidth = compact ? 0 : 6;
  const nameWidth = Math.max(8, Math.min(compact ? 18 : 30, Math.floor(rowWidth * 0.28)));
  const gaps = compact ? 3 : 5;
  const subjectWidth = Math.max(4, rowWidth - 2 - kindWidth - nameWidth - hashWidth - headWidth - gaps);
  return { rowWidth, kindWidth, nameWidth, hashWidth, headWidth, subjectWidth };
}

export function getGitDashboardItemCount(data: GitDashboardData, github: GitHubSummary | null, tab: GitDashboardTab): number {
  switch (tab) {
    case "graph": return Math.min(120, data.snapshot.graphRows.length);
    case "status": return data.conflicts.length + data.staged.length + data.unstaged.length + data.untracked.length;
    case "branches": return data.branchDetails.length;
    case "stash": return data.stashes.length;
    case "remotes": return data.remotes.length;
    case "tags": return data.tags.length;
    case "prs": return github?.pullRequests.length ?? 0;
    case "issues": return github?.issues.length ?? 0;
    case "actions": return github?.runs.length ?? 0;
    case "releases": return github?.releases.length ?? 0;
    default: return 0;
  }
}

export function getGitDashboardScrollOffset(data: GitDashboardData, tab: GitDashboardTab, selected: number): number {
  if (tab === "branches") return selected + 2;
  if (tab === "graph") return selected * 2 + 1;
  if (tab !== "status") return selected + 1;

  let offset = 1;
  let index = selected;
  if (data.conflicts.length > 0) {
    offset += 1;
    if (index < data.conflicts.length) return offset + index;
    offset += data.conflicts.length;
    index -= data.conflicts.length;
  }
  offset += 1;
  if (index < data.staged.length) return offset + index;
  offset += data.staged.length;
  index -= data.staged.length;
  offset += 1;
  if (index < data.unstaged.length) return offset + index;
  offset += data.unstaged.length;
  index -= data.unstaged.length;
  return offset + 1 + index;
}

function Stat(props: { label: string; value: string; color?: string; width: number }) {
  return (
    <box flexDirection="row" alignItems="center" width={props.width} minWidth={0} flexShrink={0} paddingX={1} gap={1}>
      <text fg={ROLES.mutedHeader} wrapMode="none">{clipText(props.label.toUpperCase(), Math.max(1, props.width - props.value.length - 4))}</text>
      <text fg={props.color ?? ROLES.text} attributes={1} wrapMode="none">{props.value}</text>
    </box>
  );
}

function DashboardRow(props: { value: string; selected: boolean; width: number; color?: string }) {
  return (
    <text fg={props.selected ? ROLES.selection : props.color ?? ROLES.text} wrapMode="none">
      {clipText((props.selected ? "▸ " : "  ") + props.value, Math.max(1, props.width - 8))}
    </text>
  );
}

function GraphRow(props: { row: GitGraphRow; selected: boolean; width: number }) {
  const commitColor = () => laneColor(props.row.lanes[props.row.laneIndex]?.colorIndex ?? props.row.laneIndex);
  return (
    <box flexDirection="column" paddingX={1} gap={0}>
      <box flexDirection="row" alignItems="center" gap={1}>
        <text fg={props.selected ? ROLES.brand : ROLES.dimText} attributes={props.selected ? 1 : 0} wrapMode="none">{props.selected ? "▸" : " "}</text>
        <box flexDirection="row" alignItems="center" gap={1} minWidth={2}>
          <For each={props.row.lanes.slice(0, 8)}>
            {(lane) => <text fg={laneColor(lane.colorIndex)} attributes={lane.isCommit ? 1 : 0} wrapMode="none">{lane.isCommit ? (props.row.isMerge ? "◆" : "●") : "○"}</text>}
          </For>
        </box>
        <text fg={ROLES.mutedCompletion} wrapMode="none">{props.row.shortHash}</text>
        <text fg={props.row.isHead ? ROLES.brand : ROLES.text} attributes={props.row.isHead || props.selected ? 1 : 0} wrapMode="none">{clipText(props.row.subject, Math.max(8, props.width - Math.min(8, props.row.lanes.length) * 2 - Math.min(2, props.row.refs.length) * 14 - 24))}</text>
        <For each={props.row.refs.slice(0, 2)}>
          {(ref) => {
            const color = ref.kind === "tag" ? ROLES.statusRunning : ref.kind === "remote" ? ROLES.info : laneColor(ref.colorIndex);
            return (
              <box paddingX={1} backgroundColor={color}>
                <text fg={ROLES.pageBackground} attributes={1} wrapMode="none">{clipText(ref.label, 12)}</text>
              </box>
            );
          }}
        </For>
      </box>
      <box flexDirection="row" width={Math.max(12, props.width - 6)} paddingLeft={4} justifyContent="space-between">
        <text fg={ROLES.dimText} wrapMode="none">{clipText(props.row.author + " · " + props.row.relativeDate, Math.max(6, props.width - 24))}</text>
        <text fg={commitColor()} wrapMode="none">LANE {props.row.laneIndex + 1}</text>
      </box>
    </box>
  );
}

export function GitDashboardView(props: GitDashboardViewProps) {
  const snapshot = () => props.data.snapshot;
  const changeFiles = () => [...props.data.conflicts, ...props.data.staged, ...props.data.unstaged, ...props.data.untracked];
  const githubReady = () => Boolean(props.github?.connected && props.github.repository);
  const latestCommitLabel = () => {
    const commit = snapshot().commits[0];
    return commit ? commit.shortHash + "  " + commit.subject : "No commits yet";
  };
  const selectedRow = (index: number) => props.selected === index;
  let listScrollbox: ScrollBoxRenderable | undefined;
  createEffect(() => {
    const tab = props.tab;
    const selected = props.selected;
    if (!listScrollbox) return;
    listScrollbox.scrollTo(getGitDashboardScrollOffset(props.data, tab, selected));
  });
  const branchLayout = () => getGitBranchRowLayout(props.width);
  return (
    <box width="100%" flexDirection="column" flexGrow={1} flexBasis={0} flexShrink={1} minWidth={0} minHeight={0} gap={1} paddingX={1} backgroundColor={ROLES.pageBackground}>
      <box flexDirection="row" flexShrink={0} minWidth={0} justifyContent="space-between" alignItems="center">
        <box flexDirection="column" flexGrow={1} flexBasis={0} minWidth={0}>
          <text fg={ROLES.brand} attributes={1} wrapMode="none">GIT COMMAND CENTER</text>
          <text fg={ROLES.text} wrapMode="none">{clipText(snapshot().name + "  ·  " + snapshot().branch, Math.max(12, props.width - 22))}</text>
          <text fg={ROLES.mutedText} wrapMode="none">{clipText(snapshot().origin + "  ·  " + snapshot().root, Math.max(12, props.width - 22))}</text>
        </box>
        <text fg={snapshot().workingTreeClean ? ROLES.success : ROLES.statusRunning} wrapMode="none">{snapshot().workingTreeClean ? "● CLEAN" : "● DIRTY · " + snapshot().changedPaths + " FILES"}</text>
      </box>
      <box flexDirection="column" flexShrink={0} gap={1}>
        <box flexDirection="row" flexShrink={0} gap={1}>
          <Stat label="Commits" value={String(snapshot().totalCommits)} width={Math.max(14, Math.floor((props.width - 8) / 3))} />
          <Stat label="Local branches" value={String(snapshot().localBranchCount)} width={Math.max(14, Math.floor((props.width - 8) / 3))} />
          <Stat label="Remote branches" value={String(snapshot().remoteBranchCount)} width={Math.max(14, Math.floor((props.width - 8) / 3))} />
        </box>
        <box flexDirection="row" flexShrink={0} gap={1}>
          <Stat label="Staged" value={String(props.data.staged.length)} color={ROLES.success} width={Math.max(14, Math.floor((props.width - 8) / 3))} />
          <Stat label="Unstaged" value={String(props.data.unstaged.length)} color={ROLES.statusRunning} width={Math.max(14, Math.floor((props.width - 8) / 3))} />
          <Stat label="Conflicts" value={String(props.data.conflicts.length)} color={props.data.conflicts.length ? ROLES.error : ROLES.success} width={Math.max(14, Math.floor((props.width - 8) / 3))} />
        </box>
      </box>
      <box flexDirection="row" flexShrink={0} minWidth={0} gap={1}>
        <For each={getVisibleGitDashboardTabs(props.tab, props.width)}>
          {(item) => <text fg={props.tab === item.id ? ROLES.brand : ROLES.mutedText} attributes={props.tab === item.id ? 1 : 0} wrapMode="none">{(props.tab === item.id ? "◆ " : "· ") + item.label}</text>}
        </For>
      </box>
      <text fg={ROLES.border} flexShrink={0} wrapMode="none">{"─".repeat(Math.max(1, props.width - 4))}</text>
      <scrollbox
        ref={(element) => { listScrollbox = element; }}
        width="100%"
        flexGrow={1}
        flexBasis={0}
        flexShrink={1}
        minWidth={0}
        minHeight={0}
        viewportCulling
        contentOptions={{ layoutMode: "list" }}
      >
      <Show when={props.tab === "overview"} fallback={<box height={0} />}>
        <text fg={ROLES.text}>Repository overview</text>
        <text fg={ROLES.mutedText}>HEAD: {snapshot().branch}  ·  Origin: {snapshot().origin}</text>
        <text fg={ROLES.mutedText}>Branches: {snapshot().localBranchCount} local / {snapshot().remoteBranchCount} remote  ·  Tags: {props.data.tags.length}  ·  Stashes: {props.data.stashes.length}</text>
        <text fg={ROLES.mutedText}>Latest commit: {latestCommitLabel()}</text>
        <text fg={ROLES.mutedText}>GitHub: {githubReady() ? "connected as @" + (props.github?.login ?? "unknown") : props.github?.message ?? "Not loaded"}</text>
        <text fg={ROLES.dimText}>Use ← / → or number keys to switch sections. Esc returns to the composer.</text>
      </Show>
      <Show when={props.tab === "graph"} fallback={<box height={0} />}>
        <text fg={ROLES.text}>Commit history · {snapshot().graphRows.length} shown of {snapshot().totalCommits}</text>
        <For each={snapshot().graphRows.slice(0, 120)}>
          {(row, index) => <GraphRow row={row} selected={selectedRow(index())} width={props.width} />}
        </For>
      </Show>
      <Show when={props.tab === "status"} fallback={<box height={0} />}>
        <text fg={ROLES.text}>Working tree · {changeFiles().length} paths</text>
        <Show when={props.data.conflicts.length > 0} fallback={<box height={0} />}><text fg={ROLES.error}>MERGE CONFLICTS</text><For each={props.data.conflicts}>{(file, index) => <DashboardRow value={file.code + "  " + file.path} width={props.width} selected={selectedRow(index())} color={ROLES.error} />}</For></Show>
        <text fg={ROLES.success}>STAGED</text><For each={props.data.staged}>{(file, index) => <DashboardRow value={file.code + "  " + file.path} width={props.width} selected={selectedRow(props.data.conflicts.length + index())} color={ROLES.success} />}</For>
        <text fg={ROLES.statusRunning}>UNSTAGED</text><For each={props.data.unstaged}>{(file, index) => <DashboardRow value={file.code + "  " + file.path} width={props.width} selected={selectedRow(props.data.conflicts.length + props.data.staged.length + index())} color={ROLES.statusRunning} />}</For>
        <text fg={ROLES.info}>UNTRACKED</text><For each={props.data.untracked}>{(file, index) => <DashboardRow value={"??  " + file.path} width={props.width} selected={selectedRow(props.data.conflicts.length + props.data.staged.length + props.data.unstaged.length + index())} color={ROLES.info} />}</For>
        <Show when={changeFiles().length === 0} fallback={<box height={0} />}><text fg={ROLES.success}>Working tree clean.</text></Show>
      </Show>
      <Show when={props.tab === "branches"} fallback={<box height={0} />}>
        <text fg={ROLES.text}>Branches · {props.data.branchDetails.filter((branch) => branch.kind === "local").length} local / {props.data.branchDetails.filter((branch) => branch.kind === "remote").length} remote</text>
        <text fg={ROLES.dimText}>Select a branch, then press Enter to switch. Remote selections create a tracking branch.</text>
        <Show when={props.data.branchDetails.length > 0} fallback={<text fg={ROLES.dimText}>No branches found.</text>}>
          <For each={props.data.branchDetails}>
            {(branch, index) => {
              const layout = branchLayout();
              const selected = selectedRow(index());
              return (
                <box
                  width={layout.rowWidth}
                  flexDirection="row"
                  alignItems="center"
                  flexShrink={0}
                  minWidth={0}
                  gap={1}
                  paddingX={0}
                >
                  <text width={2} fg={selected ? ROLES.brand : ROLES.dimText} attributes={selected ? 1 : 0} wrapMode="none">{selected ? "▸" : " "}</text>
                  <box width={layout.kindWidth} paddingX={1} backgroundColor={branch.kind === "local" ? ROLES.info : ROLES.mutedCompletion}>
                    <text fg={ROLES.pageBackground} attributes={1} wrapMode="none">{branch.kind === "local" ? "LOCAL" : "REMOTE"}</text>
                  </box>
                  <text width={layout.nameWidth} fg={branch.isCurrent ? ROLES.brand : selected ? ROLES.selection : ROLES.text} attributes={branch.isCurrent || selected ? 1 : 0} wrapMode="none">{clipText(branch.name, layout.nameWidth)}</text>
                  <Show when={layout.hashWidth > 0} fallback={<box width={0} height={0} />}>
                    <text width={layout.hashWidth} fg={ROLES.dimText} wrapMode="none">{branch.shortHash}</text>
                  </Show>
                  <box width={layout.subjectWidth} minWidth={0}>
                    <text fg={ROLES.mutedText} wrapMode="none">{clipText(branch.subject, layout.subjectWidth)}</text>
                  </box>
                  <Show when={layout.headWidth > 0} fallback={<box width={0} height={0} />}>
                    <box width={layout.headWidth} paddingX={1} backgroundColor={branch.isCurrent ? ROLES.success : ROLES.pageBackground}>
                      <text fg={branch.isCurrent ? ROLES.pageBackground : ROLES.pageBackground} attributes={1} wrapMode="none">{branch.isCurrent ? "HEAD" : ""}</text>
                    </box>
                  </Show>
                </box>
              );
            }}
          </For>
        </Show>
      </Show>
      <Show when={props.tab === "diff"} fallback={<box height={0} />}>
        <text fg={ROLES.text}>Diff summary</text>
        <DashboardRow value={"Staged: " + (props.data.stagedDiffStat || "No staged diff")} width={props.width} selected={false} color={ROLES.success} />
        <DashboardRow value={"Unstaged: " + (props.data.unstagedDiffStat || "No unstaged diff")} width={props.width} selected={false} color={ROLES.statusRunning} />
        <DashboardRow value="File-level diff inspection is not yet exposed in this view." width={props.width} selected={false} color={ROLES.dimText} />
      </Show>
      <Show when={props.tab === "stash"} fallback={<box height={0} />}><text fg={ROLES.text}>Stashes</text><For each={props.data.stashes}>{(item, index) => <DashboardRow value={item} width={props.width} selected={selectedRow(index())} />}</For><Show when={!props.data.stashes.length} fallback={<box height={0} />}><text fg={ROLES.dimText}>No stashes.</text></Show></Show>
      <Show when={props.tab === "remotes"} fallback={<box height={0} />}><text fg={ROLES.text}>Remote endpoints</text><For each={props.data.remotes}>{(item, index) => <DashboardRow value={item} width={props.width} selected={selectedRow(index())} />}</For><Show when={!props.data.remotes.length} fallback={<box height={0} />}><text fg={ROLES.dimText}>No remotes configured.</text></Show></Show>
      <Show when={props.tab === "tags"} fallback={<box height={0} />}><text fg={ROLES.text}>Tags</text><For each={props.data.tags}>{(item, index) => <DashboardRow value={item} width={props.width} selected={selectedRow(index())} />}</For><Show when={!props.data.tags.length} fallback={<box height={0} />}><text fg={ROLES.dimText}>No tags.</text></Show></Show>
      <Show when={props.tab === "github"} fallback={<box height={0} />}>
        <text fg={ROLES.text}>GitHub repository</text>
        <Show when={githubReady()} fallback={<text fg={ROLES.dimText}>{props.github?.message ?? "GitHub data unavailable."}</text>}>
          <text fg={ROLES.brand}>{props.github!.repository!.nameWithOwner ?? snapshot().name}</text>
          <text fg={ROLES.mutedText}>{props.github!.repository!.description ?? "No repository description."}</text>
          <text fg={ROLES.mutedText}>Visibility: {props.github!.repository!.isPrivate ? "Private" : "Public"}  ·  Default: {props.github!.repository!.defaultBranchRef?.name ?? "Unavailable"}</text>
          <text fg={ROLES.mutedText}>Language: {props.github!.repository!.primaryLanguage?.name ?? "Unavailable"}  ·  ★ {props.github!.repository!.stargazerCount ?? "—"}  ·  Forks {props.github!.repository!.forkCount ?? "—"}</text>
          <text fg={ROLES.info}>{props.github!.repository!.url ?? "Repository URL unavailable"}</text>
        </Show>
      </Show>
      <Show when={props.tab === "prs"} fallback={<box height={0} />}><text fg={ROLES.text}>Pull requests</text><Show when={githubReady()} fallback={<text fg={ROLES.dimText}>{props.github?.message ?? "GitHub data unavailable."}</text>}><For each={props.github!.pullRequests}>{(item, index) => <DashboardRow value={"#" + item.number + " " + item.title + " · " + (item.headRefName ?? "?") + " → " + (item.baseRefName ?? "?")} width={props.width} selected={selectedRow(index())} />}</For></Show></Show>
      <Show when={props.tab === "issues"} fallback={<box height={0} />}><text fg={ROLES.text}>Issues</text><Show when={githubReady()} fallback={<text fg={ROLES.dimText}>{props.github?.message ?? "GitHub data unavailable."}</text>}><For each={props.github!.issues}>{(item, index) => <DashboardRow value={"#" + item.number + " " + item.title + " · " + (item.state ?? "open")} width={props.width} selected={selectedRow(index())} />}</For></Show></Show>
      <Show when={props.tab === "actions"} fallback={<box height={0} />}><text fg={ROLES.text}>GitHub Actions</text><Show when={githubReady()} fallback={<text fg={ROLES.dimText}>{props.github?.message ?? "GitHub data unavailable."}</text>}><For each={props.github!.runs}>{(item, index) => <DashboardRow value={item.name + " · " + (item.status ?? "unknown") + (item.conclusion ? " / " + item.conclusion : "") + " · " + (item.headBranch ?? "branch unknown")} width={props.width} selected={selectedRow(index())} color={item.conclusion === "success" ? ROLES.success : item.conclusion === "failure" ? ROLES.error : ROLES.statusRunning} />}</For></Show></Show>
      <Show when={props.tab === "releases"} fallback={<box height={0} />}><text fg={ROLES.text}>Releases</text><Show when={githubReady()} fallback={<text fg={ROLES.dimText}>{props.github?.message ?? "GitHub data unavailable."}</text>}><For each={props.github!.releases}>{(item, index) => <DashboardRow value={(item.tagName ?? item.name ?? "Untitled release") + " · " + (item.publishedAt ?? (item.isDraft ? "Draft" : "date unavailable"))} width={props.width} selected={selectedRow(index())} />}</For><Show when={!props.github!.releases.length} fallback={<box height={0} />}><text fg={ROLES.dimText}>No releases found or release access unavailable.</text></Show></Show></Show>
      </scrollbox>
      <Show when={props.feedback} fallback={<box height={0} />}>
        <text fg={props.feedback?.tone === "error" ? ROLES.error : props.feedback?.tone === "success" ? ROLES.success : ROLES.info} flexShrink={0} wrapMode="none">{props.feedback?.message ?? ""}</text>
      </Show>
      <text fg={ROLES.dimText} flexShrink={0} wrapMode="none">{props.tab === "branches" ? "↑ ↓ select · PgUp/PgDn jump · Enter switch · ← → sections · Esc close" : "↑ ↓ select · PgUp/PgDn jump · ← → / 1–9 sections · Esc close"}</text>
    </box>
  );
}
