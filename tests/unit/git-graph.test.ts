import { describe, expect, it } from "vitest";
import { layoutGitGraph, parseGitGraphOutput, sanitizeGitRemoteUrl } from "../../src/runtime/git-graph.js";

const separator = "\x1f";
const commit = (hash: string, short: string, subject: string, parents = "", refs = "") =>
  [hash, short, "Krish Patel", "2 hours ago", subject, refs, parents].join(separator);

describe("parseGitGraphOutput", () => {
  it("parses commit metadata, ancestry and decorated branch references", () => {
    const rows = parseGitGraphOutput([
      commit("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "aaaaaaa", "Merge feature", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb cccccccccccccccccccccccccccccccccccccccc", "HEAD -> main, origin/main"),
      commit("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "bbbbbbb", "Feature work", "dddddddddddddddddddddddddddddddddddddddd", "feature/login"),
      commit("cccccccccccccccccccccccccccccccccccccccc", "ccccccc", "Main work", "dddddddddddddddddddddddddddddddddddddddd", "tag: v2.1.0"),
      commit("dddddddddddddddddddddddddddddddddddddddd", "ddddddd", "Initial commit"),
    ].join("\n"));

    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      shortHash: "aaaaaaa",
      subject: "Merge feature",
      parents: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "cccccccccccccccccccccccccccccccccccccccc"],
      refs: [
        { label: "main", kind: "head" },
        { label: "origin/main", kind: "remote" },
      ],
    });
    expect(rows[2]!.refs).toContainEqual({ label: "v2.1.0", kind: "tag", colorIndex: 0 });
  });

  it("lays out visible colored lanes and commit nodes across a merge", () => {
    const commits = parseGitGraphOutput([
      commit("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "aaaaaaa", "Merge feature", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb cccccccccccccccccccccccccccccccccccccccc", "HEAD -> main"),
      commit("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "bbbbbbb", "Feature work", "dddddddddddddddddddddddddddddddddddddddd", "feature/login"),
      commit("cccccccccccccccccccccccccccccccccccccccc", "ccccccc", "Main work", "dddddddddddddddddddddddddddddddddddddddd", "main"),
      commit("dddddddddddddddddddddddddddddddddddddddd", "ddddddd", "Initial commit"),
    ].join("\n"));

    const rows = layoutGitGraph(commits);
    expect(rows[0]).toMatchObject({ isHead: true, isMerge: true, laneIndex: 0 });
    expect(rows[0]!.lanes.map((lane) => lane.glyph)).toEqual(["◆", "·"]);
    expect(rows[1]!.lanes.map((lane) => lane.glyph)).toEqual(["●", "·"]);
    expect(rows[2]!.lanes.map((lane) => lane.glyph)).toEqual(["·", "●"]);
    expect(rows[0]!.lanes[0]!.colorIndex).not.toBe(rows[0]!.lanes[1]!.colorIndex);
    expect(rows[3]!.lanes).toHaveLength(1);
  });

  it("returns no rows for an empty history or malformed records", () => {
    expect(parseGitGraphOutput("")).toEqual([]);
    expect(parseGitGraphOutput("not a commit record")).toEqual([]);
  });
});

describe("sanitizeGitRemoteUrl", () => {
  it("shows HTTPS remotes without credentials or tokens", () => {
    expect(sanitizeGitRemoteUrl("https://user:secret-token@github.com/owner/repo.git"))
      .toBe("github.com/owner/repo");
  });

  it("normalizes SSH remotes", () => {
    expect(sanitizeGitRemoteUrl("git@github.com:owner/repo.git")).toBe("github.com/owner/repo");
    expect(sanitizeGitRemoteUrl("ssh://git@github.com/owner/repo.git")).toBe("github.com/owner/repo");
  });

  it("handles a missing remote", () => {
    expect(sanitizeGitRemoteUrl("")).toBe("not configured");
  });
});
