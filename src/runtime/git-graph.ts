import { execFile } from "node:child_process";

const FIELD_SEPARATOR = "\x1f";
const MAX_GIT_OUTPUT = 5 * 1024 * 1024;

export type GitGraphRefKind = "head" | "branch" | "remote" | "tag";

export interface GitGraphRef {
  label: string;
  kind: GitGraphRefKind;
  colorIndex: number;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  relativeDate: string;
  decorations: string;
  parents: string[];
  refs: GitGraphRef[];
}

export interface GitGraphLane {
  colorIndex: number;
  glyph: "●" | "◆" | "│" | "╱" | "╲";
  isCommit: boolean;
}

export interface GitGraphRow extends GitCommit {
  lanes: GitGraphLane[];
  laneIndex: number;
  isHead: boolean;
  isMerge: boolean;
}

export interface GitSnapshot {
  root: string;
  name: string;
  branch: string;
  origin: string;
  workingTreeClean: boolean;
  changedPaths: number;
  totalCommits: number;
  localBranchCount: number;
  remoteBranchCount: number;
  branches: string[];
  graphRows: GitGraphRow[];
  commits: GitCommit[];
}

interface GitHubRepository {
  nameWithOwner?: string;
  url?: string;
  description?: string;
  isPrivate?: boolean;
  defaultBranchRef?: { name?: string };
  primaryLanguage?: { name?: string };
  stargazerCount?: number;
  forkCount?: number;
}

interface GitHubRelease {
  name?: string;
  tagName?: string;
  publishedAt?: string;
  url?: string;
  isDraft?: boolean;
}

interface GitHubPullRequest {
  number: number;
  title: string;
  url: string;
  headRefName?: string;
  baseRefName?: string;
  isDraft?: boolean;
}

interface GitHubIssue {
  number: number;
  title: string;
  url: string;
  state?: string;
}

interface GitHubRun {
  name: string;
  status?: string;
  conclusion?: string | null;
  url: string;
  headBranch?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GitHubSummary {
  connected: boolean;
  login?: string;
  repository?: GitHubRepository;
  pullRequests: GitHubPullRequest[];
  issues: GitHubIssue[];
  runs: GitHubRun[];
  releases: GitHubRelease[];
  message?: string;
}

function runProcess(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: MAX_GIT_OUTPUT,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || error.message || "Command failed").trim();
        reject(new Error(detail.slice(0, 500)));
        return;
      }
      resolve(String(stdout));
    });
  });
}

function runGit(cwd: string, args: string[]): Promise<string> {
  return runProcess("git", args, cwd);
}

function runGh(cwd: string, args: string[]): Promise<string> {
  return runProcess("gh", args, cwd);
}

export function sanitizeGitRemoteUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "not configured";

  if (!raw.includes("://")) {
    const scp = /^(?:[^@]+@)?([^:]+):(.+)$/.exec(raw);
    if (scp) return scp[1] + "/" + scp[2]!.replace(/\.git$/, "");
  }

  try {
    const parsed = new URL(raw);
    if (!parsed.hostname) return "configured";
    return parsed.host + parsed.pathname.replace(/\.git$/, "").replace(/\/$/, "");
  } catch {
    return "configured";
  }
}

function parseGitGraphRefs(decorations: string): GitGraphRef[] {
  return decorations
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value): GitGraphRef[] => {
      const head = /^HEAD -> (.+)$/.exec(value);
      if (head) return [{ label: head[1]!, kind: "head", colorIndex: 0 }];
      if (value === "HEAD") return [];
      if (value.startsWith("tag: ")) return [{ label: value.slice(5), kind: "tag", colorIndex: 0 }];
      const remote = /^(?:origin|upstream)\//.test(value);
      return [{ label: value, kind: remote ? "remote" : "branch", colorIndex: 0 }];
    });
}

/** Parse metadata-only git log output; visual graph geometry is calculated separately. */
export function parseGitGraphOutput(output: string): GitCommit[] {
  const commits: GitCommit[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const fields = rawLine.split(FIELD_SEPARATOR);
    if (fields.length < 7) continue;
    const hash = fields[0] ?? "";
    const shortHash = fields[1] ?? "";
    if (!/^[0-9a-f]{7,40}$/i.test(hash) || !/^[0-9a-f]{7,40}$/i.test(shortHash)) continue;
    const decorations = fields[5] ?? "";
    commits.push({
      hash,
      shortHash,
      author: fields[2] || "Unknown author",
      relativeDate: fields[3] || "date unknown",
      subject: fields[4] || "(no subject)",
      decorations,
      parents: (fields[6] || "").trim().split(/\s+/).filter(Boolean),
      refs: parseGitGraphRefs(decorations),
    });
  }
  return commits;
}

/** Build stable branch lanes from commit ancestry, independently of terminal glyph parsing. */
export function layoutGitGraph(commits: GitCommit[]): GitGraphRow[] {
  const activeLanes: Array<{ hash: string; colorIndex: number }> = [];
  let nextColorIndex = 0;
  const rows: GitGraphRow[] = [];

  for (const commit of commits) {
    let laneIndex = activeLanes.findIndex((lane) => lane.hash === commit.hash);
    if (laneIndex < 0) {
      laneIndex = 0;
      activeLanes.splice(laneIndex, 0, { hash: commit.hash, colorIndex: nextColorIndex++ });
    }

    const secondaryLaneIndexes: number[] = [];
    for (const parent of commit.parents.slice(1)) {
      let parentLane = activeLanes.findIndex((lane, index) => index !== laneIndex && lane.hash === parent);
      if (parentLane < 0) {
        parentLane = laneIndex + 1 + secondaryLaneIndexes.length;
        activeLanes.splice(parentLane, 0, { hash: parent, colorIndex: nextColorIndex++ });
      }
      secondaryLaneIndexes.push(parentLane);
    }

    const firstParent = commit.parents[0];
    const firstParentLane = firstParent
      ? activeLanes.findIndex((lane, index) => index !== laneIndex && lane.hash === firstParent)
      : -1;
    const currentColorIndex = activeLanes[laneIndex]!.colorIndex;
    const lanes: GitGraphLane[] = activeLanes.map((lane, index) => ({
      colorIndex: lane.colorIndex,
      glyph: index === laneIndex
        ? (commit.parents.length > 1 ? "◆" : "●")
        : secondaryLaneIndexes.includes(index)
          ? (index > laneIndex ? "╲" : "╱")
          : index === firstParentLane
            ? (index < laneIndex ? "╲" : "╱")
            : "│",
      isCommit: index === laneIndex,
    }));

    if (!firstParent) {
      activeLanes.splice(laneIndex, 1);
    } else if (firstParentLane >= 0) {
      activeLanes.splice(laneIndex, 1);
    } else {
      activeLanes[laneIndex] = { ...activeLanes[laneIndex]!, hash: firstParent };
    }

    rows.push({
      ...commit,
      refs: commit.refs.map((ref) => ({ ...ref, colorIndex: currentColorIndex })),
      lanes,
      laneIndex,
      isHead: commit.refs.some((ref) => ref.kind === "head"),
      isMerge: commit.parents.length > 1,
    });
  }
  return rows;
}

export async function loadGitSnapshot(projectPath: string, limit = 80): Promise<GitSnapshot> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 300) {
    throw new Error("Commit limit must be an integer from 1 to 300.");
  }

  let root: string;
  try {
    root = (await runGit(projectPath, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    throw new Error("This directory is not inside a Git repository.");
  }

  const [branchOutput, statusOutput, branchListOutput, countOutput, originOutput, graphOutput] = await Promise.all([
    runGit(root, ["branch", "--show-current"]),
    runGit(root, ["status", "--porcelain=v1", "--branch"]),
    runGit(root, ["branch", "--all", "--no-color", "--verbose"]),
    runGit(root, ["rev-list", "--all", "--count"]),
    runGit(root, ["remote", "get-url", "origin"]).catch(() => ""),
    runGit(root, [
      "log", "--all", "--topo-order", "--decorate=short", "--date=relative",
      "--format=%H%x1f%h%x1f%an%x1f%ar%x1f%s%x1f%D%x1f%P", "-n", String(limit),
    ]),
  ]);

  const branches = branchListOutput.split(/\r?\n/).filter(Boolean);
  const statusLines = statusOutput.split(/\r?\n/);
  const changedPaths = statusLines.slice(1).filter(Boolean).length;
  const commits = parseGitGraphOutput(graphOutput);
  const graphRows = layoutGitGraph(commits);
  const branch = branchOutput.trim() || "(detached HEAD)";

  return {
    root,
    name: root.split(/[\\/]/).filter(Boolean).pop() || root,
    branch,
    origin: sanitizeGitRemoteUrl(originOutput),
    workingTreeClean: changedPaths === 0,
    changedPaths,
    totalCommits: Number.parseInt(countOutput.trim(), 10) || 0,
    localBranchCount: branches.filter((line) => !line.includes("remotes/")).length,
    remoteBranchCount: branches.filter((line) => line.includes("remotes/")).length,
    branches,
    graphRows,
    commits,
  };
}

export interface GitWorkingTreeFile {
  path: string;
  code: string;
  state: "staged" | "unstaged" | "untracked" | "conflict";
}

export interface GitDashboardData {
  snapshot: GitSnapshot;
  staged: GitWorkingTreeFile[];
  unstaged: GitWorkingTreeFile[];
  untracked: GitWorkingTreeFile[];
  conflicts: GitWorkingTreeFile[];
  stashes: string[];
  tags: string[];
  remotes: string[];
  branchDetails: string[];
  unstagedDiffStat: string;
  stagedDiffStat: string;
}

/** Load supplementary local repository data without requiring GitHub authentication. */
export async function loadGitDashboardData(projectPath: string, limit = 80): Promise<GitDashboardData> {
  const snapshot = await loadGitSnapshot(projectPath, limit);
  const [status, stashes, tags, remotes, branchDetails, unstagedDiffStat, stagedDiffStat] = await Promise.all([
    runGit(snapshot.root, ["status", "--porcelain=v1", "--untracked-files=all"]).catch(() => ""),
    runGit(snapshot.root, ["stash", "list", "--format=%gd%x1f%gs"]).catch(() => ""),
    runGit(snapshot.root, ["tag", "--sort=-creatordate", "--format=%(refname:short)%x1f%(creatordate:relative)"]).catch(() => ""),
    runGit(snapshot.root, ["remote", "-v"]).catch(() => ""),
    runGit(snapshot.root, ["branch", "--all", "--verbose", "--no-abbrev"]).catch(() => ""),
    runGit(snapshot.root, ["diff", "--shortstat"]).catch(() => ""),
    runGit(snapshot.root, ["diff", "--cached", "--shortstat"]).catch(() => ""),
  ]);

  const staged: GitWorkingTreeFile[] = [];
  const unstaged: GitWorkingTreeFile[] = [];
  const untracked: GitWorkingTreeFile[] = [];
  const conflicts: GitWorkingTreeFile[] = [];
  for (const line of status.split(/\r?\n/)) {
    if (line.length < 4 || line.startsWith("?? ")) {
      if (line.startsWith("?? ")) untracked.push({ path: line.slice(3), code: "??", state: "untracked" });
      continue;
    }
    const code = line.slice(0, 2);
    const path = line.slice(3);
    if (/^(DD|AU|UD|UA|DU|AA|UU)$/.test(code)) {
      conflicts.push({ path, code, state: "conflict" });
      continue;
    }
    if (code[0] !== " ") staged.push({ path, code, state: "staged" });
    if (code[1] !== " ") unstaged.push({ path, code, state: "unstaged" });
  }

  return {
    snapshot,
    staged,
    unstaged,
    untracked,
    conflicts,
    stashes: stashes.split(/\r?\n/).filter(Boolean),
    tags: tags.split(/\r?\n/).filter(Boolean),
    remotes: remotes.split(/\r?\n/).filter(Boolean),
    branchDetails: branchDetails.split(/\r?\n/).filter(Boolean),
    unstagedDiffStat: unstagedDiffStat.trim(),
    stagedDiffStat: stagedDiffStat.trim(),
  };
}

export type GitBranchAction = "checkout" | "create" | "delete" | "merge";

/** Execute one explicitly requested branch operation with conservative safety checks. */
export async function runGitBranchAction(projectPath: string, action: GitBranchAction, branch: string): Promise<string> {
  const name = branch.trim();
  if (!name || name.startsWith("-") || /[\\0\\r\\n]/.test(name)) {
    throw new Error("Provide a valid branch name.");
  }
  const root = (await runGit(projectPath, ["rev-parse", "--show-toplevel"])).trim();
  await runGit(root, ["check-ref-format", "--branch", name]);

  if (action === "delete") {
    const current = (await runGit(root, ["branch", "--show-current"])).trim();
    if (current === name) throw new Error("Switch to another branch before deleting the current branch.");
    return (await runGit(root, ["branch", "--delete", name])).trim();
  }
  if (action === "merge") {
    const status = await runGit(root, ["status", "--porcelain"]);
    if (status.trim()) throw new Error("Merge is blocked because the working tree is not clean. Preserve or commit your changes first.");
    return (await runGit(root, ["merge", "--no-edit", "--", name])).trim() || "Merge completed.";
  }
  if (action === "create") {
    return (await runGit(root, ["switch", "--create", name])).trim() || "Created and switched to " + name + ".";
  }
  return (await runGit(root, ["switch", "--", name])).trim() || "Switched to " + name + ".";
}

export async function getGitCommitDetails(projectPath: string, hash: string): Promise<string> {
  if (!/^[0-9a-f]{7,40}$/i.test(hash)) {
    throw new Error("Use a commit hash with 7 to 40 hexadecimal characters.");
  }
  return (await runGit(projectPath, [
    "show", "--no-ext-diff", "--no-color", "--format=fuller", "--stat", "--no-renames", hash,
  ])).trimEnd();
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function getGitHubSummary(projectPath: string): Promise<GitHubSummary> {
  let login: string;
  try {
    login = (await runGh(projectPath, ["api", "user", "--jq", ".login"])).trim();
  } catch (error) {
    const missingCli = error instanceof Error && /spawn gh ENOENT/i.test(error.message);
    return {
      connected: false,
      pullRequests: [],
      issues: [],
      runs: [],
      releases: [],
      message: missingCli
        ? "GitHub CLI is not installed. Install gh, then run gh auth login."
        : "GitHub CLI is not authenticated. Run gh auth login; local GitGraph works without it.",
    };
  }

  let repository: GitHubRepository;
  try {
    repository = parseJson<GitHubRepository>(
      await runGh(projectPath, ["repo", "view", "--json", "nameWithOwner,url,description,isPrivate,defaultBranchRef,primaryLanguage,stargazerCount,forkCount"]),
      {},
    );
  } catch {
    return {
      connected: true,
      login,
      pullRequests: [],
      issues: [],
      runs: [],
      releases: [],
      message: "GitHub is authenticated, but this directory is not linked to a GitHub repository. Check the origin remote.",
    };
  }

  const [pullRequestOutput, issueOutput, runOutput, releaseOutput] = await Promise.all([
    runGh(projectPath, ["pr", "list", "--limit", "5", "--json", "number,title,url,headRefName,baseRefName,isDraft"]).catch(() => "[]"),
    runGh(projectPath, ["issue", "list", "--limit", "5", "--json", "number,title,url,state"]).catch(() => "[]"),
    runGh(projectPath, ["run", "list", "--limit", "3", "--json", "name,status,conclusion,url,headBranch,createdAt,updatedAt"]).catch(() => "[]"),
    runGh(projectPath, ["release", "list", "--limit", "5", "--json", "name,tagName,publishedAt,url,isDraft"]).catch(() => "[]"),
  ]);

  return {
    connected: true,
    login,
    repository,
    pullRequests: parseJson<GitHubPullRequest[]>(pullRequestOutput, []),
    issues: parseJson<GitHubIssue[]>(issueOutput, []),
    runs: parseJson<GitHubRun[]>(runOutput, []),
    releases: parseJson<GitHubRelease[]>(releaseOutput, []),
  };
}
