import { execFile } from "node:child_process";

const FIELD_SEPARATOR = "\x1f";
const MAX_GIT_OUTPUT = 5 * 1024 * 1024;

export type GitGraphTone = "main" | "remote" | "merge" | "tag" | "commit" | "lane";

export interface GitGraphRow {
  text: string;
  tone: GitGraphTone;
  hash?: string;
  subject?: string;
  author?: string;
  relativeDate?: string;
  decorations?: string;
  parents?: string[];
}

export interface GitCommit extends GitGraphRow {
  hash: string;
  subject: string;
  author: string;
  relativeDate: string;
  decorations: string;
  parents: string[];
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
}

export interface GitHubSummary {
  connected: boolean;
  login?: string;
  repository?: GitHubRepository;
  pullRequests: GitHubPullRequest[];
  issues: GitHubIssue[];
  runs: GitHubRun[];
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

export function parseGitGraphOutput(output: string): GitGraphRow[] {
  const rows: GitGraphRow[] = [];

  for (const rawLine of output.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;

    const separatorIndex = rawLine.indexOf(FIELD_SEPARATOR);
    if (separatorIndex < 0) {
      rows.push({ text: rawLine.replace(/\s+$/, ""), tone: "lane" });
      continue;
    }

    const graphAndHash = rawLine.slice(0, separatorIndex);
    const hashMatch = /([0-9a-f]{7,40})$/i.exec(graphAndHash);
    if (!hashMatch || hashMatch.index === undefined) {
      rows.push({ text: rawLine.replace(/\s+$/, ""), tone: "lane" });
      continue;
    }

    const fields = rawLine.slice(separatorIndex + 1).split(FIELD_SEPARATOR);
    const hash = hashMatch[1]!;
    const graphPrefix = graphAndHash.slice(0, hashMatch.index);
    const author = fields[0] || "Unknown author";
    const relativeDate = fields[1] || "date unknown";
    const subject = fields[2] || "(no subject)";
    const decorations = fields[3] || "";
    const parents = (fields[4] || "").trim().split(/\s+/).filter(Boolean);
    const hasHead = /(^|,\s*)HEAD\b/.test(decorations);
    const hasRemote = /(?:^|[,/ ])(?:origin|upstream)\//.test(decorations);
    const hasTag = /(?:^|,\s*)tag:\s*/.test(decorations);

    let tone: GitGraphTone = "commit";
    if (hasHead) tone = "main";
    else if (parents.length > 1) tone = "merge";
    else if (hasTag) tone = "tag";
    else if (hasRemote) tone = "remote";

    const refLabel = decorations ? " [" + decorations + "]" : "";
    const text = graphPrefix + hash + refLabel + "  " + subject + "  · " + author + " · " + relativeDate;
    rows.push({ text, tone, hash, subject, author, relativeDate, decorations, parents });
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
      "log", "--all", "--graph", "--topo-order", "--decorate=short", "--date=relative",
      "--pretty=format:%h%x1f%an%x1f%ar%x1f%s%x1f%D%x1f%P", "-n", String(limit),
    ]),
  ]);

  const branches = branchListOutput.split(/\r?\n/).filter(Boolean);
  const statusLines = statusOutput.split(/\r?\n/);
  const changedPaths = statusLines.slice(1).filter(Boolean).length;
  const graphRows = parseGitGraphOutput(graphOutput);
  const commits = graphRows.filter((row): row is GitCommit => Boolean(
    row.hash && row.subject !== undefined && row.author !== undefined && row.relativeDate !== undefined,
  ));
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
      message: missingCli
        ? "GitHub CLI is not installed. Install gh, then run gh auth login."
        : "GitHub CLI is not authenticated. Run gh auth login; local GitGraph works without it.",
    };
  }

  let repository: GitHubRepository;
  try {
    repository = parseJson<GitHubRepository>(
      await runGh(projectPath, ["repo", "view", "--json", "nameWithOwner,url,description,isPrivate"]),
      {},
    );
  } catch {
    return {
      connected: true,
      login,
      pullRequests: [],
      issues: [],
      runs: [],
      message: "GitHub is authenticated, but this directory is not linked to a GitHub repository. Check the origin remote.",
    };
  }

  const [pullRequestOutput, issueOutput, runOutput] = await Promise.all([
    runGh(projectPath, ["pr", "list", "--limit", "5", "--json", "number,title,url,headRefName,baseRefName,isDraft"]).catch(() => "[]"),
    runGh(projectPath, ["issue", "list", "--limit", "5", "--json", "number,title,url,state"]).catch(() => "[]"),
    runGh(projectPath, ["run", "list", "--limit", "3", "--json", "name,status,conclusion,url"]).catch(() => "[]"),
  ]);

  return {
    connected: true,
    login,
    repository,
    pullRequests: parseJson<GitHubPullRequest[]>(pullRequestOutput, []),
    issues: parseJson<GitHubIssue[]>(issueOutput, []),
    runs: parseJson<GitHubRun[]>(runOutput, []),
  };
}
