import { For, Show } from "solid-js";
import type { GitBranchInfo, GitDashboardData, GitGraphRow, GitHubSummary } from "../runtime/git-graph.js";
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

export interface GitDashboardViewProps {
  data: GitDashboardData;
  github: GitHubSummary | null;
  tab: GitDashboardTab;
  selected: number;
  width: number;
}

function Stat(props: { label: string; value: string; color?: string; width: number }) {
  return (
    <box flexDirection="column" width={props.width} paddingX={1}>
      <text fg={ROLES.mutedHeader} wrapMode="none">{props.label.toUpperCase()}</text>
      <text fg={props.color ?? ROLES.text} attributes={1} wrapMode="none">{props.value}</text>
    </box>
  );
}

function GraphRow(props: { row: GitGraphRow; selected: boolean; width: number }) {
  return (
    <box flexDirection="column" paddingX={1}>
      <box flexDirection="row" alignItems="center" gap={1}>
        <text fg={props.selected ? ROLES.brand : ROLES.dimText} attributes={props.selected ? 1 : 0} wrapMode="none">{props.selected ? "›" : " "}</text>
        <box flexDirection="row" minWidth={2}>
          <For each={props.row.lanes}>
            {(lane) => <text fg={laneColor(lane.colorIndex)} attributes={lane.isCommit ? 1 : 0} wrapMode="none">{lane.glyph + " "}</text>}
          </For>
        </box>
        <text fg={ROLES.mutedCompletion} wrapMode="none">{props.row.shortHash}</text>
        <text fg={props.row.isHead ? ROLES.brand : ROLES.text} attributes={props.row.isHead ? 1 : 0} wrapMode="none">{clipText(props.row.subject, Math.max(12, props.width - props.row.lanes.length * 2 - 36))}</text>
        <For each={props.row.refs.slice(0, 2)}>
          {(ref) => <text fg={ref.kind === "tag" ? ROLES.statusRunning : ref.kind === "remote" ? ROLES.info : laneColor(ref.colorIndex)} wrapMode="none">{ref.label}</text>}
        </For>
      </box>
      <box flexDirection="row">
        <box width={props.row.lanes.length * 2 + 9} />
        <text fg={ROLES.dimText} wrapMode="none">{clipText(props.row.author + " · " + props.row.relativeDate, Math.max(10, props.width - 16))}</text>
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
  return (
    <box flexDirection="column" flexGrow={1} minHeight={0} gap={1} paddingX={1} backgroundColor={ROLES.pageBackground}>
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <box flexDirection="column">
          <text fg={ROLES.brand} attributes={1}>GIT COMMAND CENTER</text>
          <text fg={ROLES.text}>{snapshot().name}  ·  {snapshot().branch}</text>
          <text fg={ROLES.mutedText}>{snapshot().origin}  ·  {snapshot().root}</text>
        </box>
        <text fg={snapshot().workingTreeClean ? ROLES.success : ROLES.statusRunning}>{snapshot().workingTreeClean ? "● CLEAN" : "● DIRTY · " + snapshot().changedPaths + " FILES"}</text>
      </box>
      <box flexDirection="column" gap={1}>
        <box flexDirection="row" gap={1}>
          <Stat label="Commits" value={String(snapshot().totalCommits)} width={Math.max(14, Math.floor((props.width - 8) / 3))} />
          <Stat label="Local branches" value={String(snapshot().localBranchCount)} width={Math.max(14, Math.floor((props.width - 8) / 3))} />
          <Stat label="Remote branches" value={String(snapshot().remoteBranchCount)} width={Math.max(14, Math.floor((props.width - 8) / 3))} />
        </box>
        <box flexDirection="row" gap={1}>
          <Stat label="Staged" value={String(props.data.staged.length)} color={ROLES.success} width={Math.max(14, Math.floor((props.width - 8) / 3))} />
          <Stat label="Unstaged" value={String(props.data.unstaged.length)} color={ROLES.statusRunning} width={Math.max(14, Math.floor((props.width - 8) / 3))} />
          <Stat label="Conflicts" value={String(props.data.conflicts.length)} color={props.data.conflicts.length ? ROLES.error : ROLES.success} width={Math.max(14, Math.floor((props.width - 8) / 3))} />
        </box>
      </box>
      <box flexDirection="row" flexWrap="wrap" gap={1}>
        <For each={TABS}>
          {(item) => <text fg={props.tab === item.id ? ROLES.brand : ROLES.mutedText} attributes={props.tab === item.id ? 1 : 0} wrapMode="none">{(props.tab === item.id ? "◆ " : "  ") + item.label + "  "}</text>}
        </For>
      </box>
      <text fg={ROLES.border} wrapMode="none">{"─".repeat(Math.max(1, props.width - 4))}</text>
      <scrollbox flexGrow={1} minHeight={0} viewportCulling>
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
        <Show when={props.data.conflicts.length > 0} fallback={<box height={0} />}><text fg={ROLES.error}>MERGE CONFLICTS</text><For each={props.data.conflicts}>{(file, index) => <text fg={selectedRow(index()) ? ROLES.selection : ROLES.error}>› {file.code}  {file.path}</text>}</For></Show>
        <text fg={ROLES.success}>STAGED</text><For each={props.data.staged}>{(file, index) => <text fg={selectedRow(props.data.conflicts.length + index()) ? ROLES.selection : ROLES.success}>› {file.code}  {file.path}</text>}</For>
        <text fg={ROLES.statusRunning}>UNSTAGED</text><For each={props.data.unstaged}>{(file, index) => <text fg={selectedRow(props.data.conflicts.length + props.data.staged.length + index()) ? ROLES.selection : ROLES.statusRunning}>› {file.code}  {file.path}</text>}</For>
        <text fg={ROLES.info}>UNTRACKED</text><For each={props.data.untracked}>{(file, index) => <text fg={selectedRow(props.data.conflicts.length + props.data.staged.length + props.data.unstaged.length + index()) ? ROLES.selection : ROLES.info}>› ??  {file.path}</text>}</For>
        <Show when={changeFiles().length === 0} fallback={<box height={0} />}><text fg={ROLES.success}>Working tree clean.</text></Show>
      </Show>
      <Show when={props.tab === "branches"} fallback={<box height={0} />}>
        <text fg={ROLES.text}>Branches · {props.data.branchDetails.filter((branch) => branch.kind === "local").length} local / {props.data.branchDetails.filter((branch) => branch.kind === "remote").length} remote</text>
        <Show when={props.data.branchDetails.length > 0} fallback={<text fg={ROLES.dimText}>No branches found.</text>}>
          <For each={props.data.branchDetails}>
            {(branch, index) => (
              <box flexDirection="row" alignItems="center" paddingX={1} gap={1}>
                <text fg={selectedRow(index()) ? ROLES.brand : ROLES.dimText} attributes={selectedRow(index()) ? 1 : 0}>{selectedRow(index()) ? "›" : " "}</text>
                <text fg={branch.kind === "local" ? ROLES.info : ROLES.mutedCompletion} attributes={1}>{branch.kind === "local" ? "LOCAL" : "REMOTE"}</text>
                <text fg={branch.isCurrent ? ROLES.brand : ROLES.text} attributes={branch.isCurrent ? 1 : 0}>{branch.name}</text>
                <text fg={ROLES.dimText}>{branch.shortHash}</text>
                <text fg={ROLES.mutedText}>{clipText(branch.subject, Math.max(8, props.width - 64))}</text>
                <Show when={branch.isCurrent} fallback={<box width={0} height={0} />}>
                  <text fg={ROLES.success} attributes={1}>CURRENT</text>
                </Show>
              </box>
            )}
          </For>
        </Show>
      </Show>
      <Show when={props.tab === "diff"} fallback={<box height={0} />}>
        <text fg={ROLES.text}>Diff summary</text>
        <text fg={ROLES.success}>Staged: {props.data.stagedDiffStat || "No staged diff"}</text>
        <text fg={ROLES.statusRunning}>Unstaged: {props.data.unstagedDiffStat || "No unstaged diff"}</text>
        <text fg={ROLES.dimText}>File-level diff inspection is not yet exposed in this view.</text>
      </Show>
      <Show when={props.tab === "stash"} fallback={<box height={0} />}><text fg={ROLES.text}>Stashes</text><For each={props.data.stashes}>{(item, index) => <text fg={selectedRow(index()) ? ROLES.selection : ROLES.text}>› {item}</text>}</For><Show when={!props.data.stashes.length} fallback={<box height={0} />}><text fg={ROLES.dimText}>No stashes.</text></Show></Show>
      <Show when={props.tab === "remotes"} fallback={<box height={0} />}><text fg={ROLES.text}>Remote endpoints</text><For each={props.data.remotes}>{(item, index) => <text fg={selectedRow(index()) ? ROLES.selection : ROLES.text}>› {item}</text>}</For><Show when={!props.data.remotes.length} fallback={<box height={0} />}><text fg={ROLES.dimText}>No remotes configured.</text></Show></Show>
      <Show when={props.tab === "tags"} fallback={<box height={0} />}><text fg={ROLES.text}>Tags</text><For each={props.data.tags}>{(item, index) => <text fg={selectedRow(index()) ? ROLES.selection : ROLES.text}>› {item}</text>}</For><Show when={!props.data.tags.length} fallback={<box height={0} />}><text fg={ROLES.dimText}>No tags.</text></Show></Show>
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
      <Show when={props.tab === "prs"} fallback={<box height={0} />}><text fg={ROLES.text}>Pull requests</text><Show when={githubReady()} fallback={<text fg={ROLES.dimText}>{props.github?.message ?? "GitHub data unavailable."}</text>}><For each={props.github!.pullRequests}>{(item, index) => <text fg={selectedRow(index()) ? ROLES.selection : ROLES.text}>› #{item.number} {item.title} · {item.headRefName ?? "?"} → {item.baseRefName ?? "?"}</text>}</For></Show></Show>
      <Show when={props.tab === "issues"} fallback={<box height={0} />}><text fg={ROLES.text}>Issues</text><Show when={githubReady()} fallback={<text fg={ROLES.dimText}>{props.github?.message ?? "GitHub data unavailable."}</text>}><For each={props.github!.issues}>{(item, index) => <text fg={selectedRow(index()) ? ROLES.selection : ROLES.text}>› #{item.number} {item.title} · {item.state ?? "open"}</text>}</For></Show></Show>
      <Show when={props.tab === "actions"} fallback={<box height={0} />}><text fg={ROLES.text}>GitHub Actions</text><Show when={githubReady()} fallback={<text fg={ROLES.dimText}>{props.github?.message ?? "GitHub data unavailable."}</text>}><For each={props.github!.runs}>{(item, index) => <text fg={selectedRow(index()) ? ROLES.selection : item.conclusion === "success" ? ROLES.success : item.conclusion === "failure" ? ROLES.error : ROLES.statusRunning}>› {item.name} · {item.status ?? "unknown"}{item.conclusion ? " / " + item.conclusion : ""} · {item.headBranch ?? "branch unknown"}</text>}</For></Show></Show>
      <Show when={props.tab === "releases"} fallback={<box height={0} />}><text fg={ROLES.text}>Releases</text><Show when={githubReady()} fallback={<text fg={ROLES.dimText}>{props.github?.message ?? "GitHub data unavailable."}</text>}><For each={props.github!.releases}>{(item, index) => <text fg={selectedRow(index()) ? ROLES.selection : ROLES.text}>› {item.tagName ?? item.name ?? "Untitled release"} · {item.publishedAt ?? (item.isDraft ? "Draft" : "date unavailable")}</text>}</For><Show when={!props.github!.releases.length} fallback={<box height={0} />}><text fg={ROLES.dimText}>No releases found or release access unavailable.</text></Show></Show></Show>
      </scrollbox>
      <text fg={ROLES.dimText} wrapMode="none">{props.tab === "branches" ? "↑ ↓ select · Enter switch branch · ← → sections · Esc close" : "↑ ↓ select · ← → / 1–9 sections · Esc close"}</text>
    </box>
  );
}
