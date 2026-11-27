import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getGitFileDiff, loadGitDashboardData, runGitBranchAction } from "../../src/runtime/git-graph.js";

const roots: string[] = [];

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "agent-termo-git-dashboard-"));
  roots.push(root);
  execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Agent-Termo Tests"], { cwd: root });
  execFileSync("git", ["config", "user.email", "tests@example.invalid"], { cwd: root });
  writeFileSync(join(root, "tracked.txt"), "initial\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: root });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: root, stdio: "ignore" });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Git dashboard data", () => {
  it("separates staged, unstaged and untracked files and reads both diff layers", async () => {
    const root = createRepository();
    writeFileSync(join(root, "tracked.txt"), "initial\nstaged\n");
    execFileSync("git", ["add", "tracked.txt"], { cwd: root });
    writeFileSync(join(root, "tracked.txt"), "initial\nstaged\nunstaged\n");
    writeFileSync(join(root, "new.txt"), "untracked\n");

    const data = await loadGitDashboardData(root, 10);
    expect(data.staged.map((file) => file.path)).toContain("tracked.txt");
    expect(data.unstaged.map((file) => file.path)).toContain("tracked.txt");
    expect(data.untracked.map((file) => file.path)).toContain("new.txt");

    const diff = await getGitFileDiff(root, "tracked.txt");
    expect(diff).toContain("STAGED DIFF");
    expect(diff).toContain("UNSTAGED DIFF");
  });

  it("loads structured local and remote branches and checks out remote selections with tracking", async () => {
    const root = createRepository();
    const remote = mkdtempSync(join(tmpdir(), "agent-termo-git-remote-"));
    roots.push(remote);
    execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
    execFileSync("git", ["remote", "add", "origin", remote], { cwd: root });
    execFileSync("git", ["push", "-u", "origin", "main"], { cwd: root, stdio: "ignore" });

    execFileSync("git", ["switch", "-c", "feature/checkout"], { cwd: root });
    writeFileSync(join(root, "feature.txt"), "remote branch\n");
    execFileSync("git", ["add", "feature.txt"], { cwd: root });
    execFileSync("git", ["commit", "-m", "feature branch"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["push", "-u", "origin", "feature/checkout"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["switch", "main"], { cwd: root });
    execFileSync("git", ["branch", "--delete", "--force", "feature/checkout"], { cwd: root });
    execFileSync("git", ["fetch", "origin"], { cwd: root });

    const data = await loadGitDashboardData(root);
    expect(data.branchDetails).toContainEqual(expect.objectContaining({
      name: "main",
      kind: "local",
      isCurrent: true,
    }));
    const remoteBranch = data.branchDetails.find((item) => item.name === "origin/feature/checkout");
    expect(remoteBranch).toMatchObject({ kind: "remote", isCurrent: false });
    await runGitBranchAction(root, "checkout", remoteBranch!.name, remoteBranch!.kind);

    expect(execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim()).toBe("feature/checkout");
    expect(execFileSync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { cwd: root, encoding: "utf8" }).trim())
      .toBe("origin/feature/checkout");
  });

  it("requires clean work for merge and prevents deleting the checked-out branch", async () => {
    const root = createRepository();
    await runGitBranchAction(root, "create", "feature/dashboard");
    await expect(runGitBranchAction(root, "delete", "feature/dashboard")).rejects.toThrow("Switch to another branch");
    await runGitBranchAction(root, "checkout", "main");
    writeFileSync(join(root, "dirty.txt"), "keep me\n");
    await expect(runGitBranchAction(root, "merge", "feature/dashboard")).rejects.toThrow("working tree is not clean");
    await runGitBranchAction(root, "delete", "feature/dashboard");
  });
});
