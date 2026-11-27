import { describe, expect, it } from "vitest";
import { parseGitGraphOutput, sanitizeGitRemoteUrl } from "../../src/runtime/git-graph.js";

const separator = "\x1f";

describe("parseGitGraphOutput", () => {
  it("preserves graph lanes and parses commit metadata and references", () => {
    const output = [
      "* aaaaaaa" + separator + "Krish Patel" + separator + "2 hours ago" + separator + "Add GitGraph" + separator + "HEAD -> main, origin/main" + separator + "bbbbbbb ccccccc",
      "|\\",
      "| * ccccccc" + separator + "Krish Patel" + separator + "1 day ago" + separator + "Remote branch work" + separator + "origin/feature" + separator + "ddddddd",
      "* bbbbbbb" + separator + "Krish Patel" + separator + "2 days ago" + separator + "Merge branch" + separator + "" + separator + "ddddddd eeeeeee",
    ].join("\n");

    const rows = parseGitGraphOutput(output);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ hash: "aaaaaaa", tone: "main", subject: "Add GitGraph", parents: ["bbbbbbb", "ccccccc"] });
    expect(rows[1]).toMatchObject({ text: "|\\", tone: "lane" });
    expect(rows[2]).toMatchObject({ hash: "ccccccc", tone: "remote", decorations: "origin/feature" });
    expect(rows[3]).toMatchObject({ hash: "bbbbbbb", tone: "merge", parents: ["ddddddd", "eeeeeee"] });
  });

  it("classifies tags and ordinary commits without inventing decorations", () => {
    const output = [
      "* 1234567" + separator + "Author" + separator + "yesterday" + separator + "Release" + separator + "tag: v2.0.0" + separator,
      "* 7654321" + separator + "Author" + separator + "last week" + separator + "Earlier work" + separator + "" + separator,
    ].join("\n");

    expect(parseGitGraphOutput(output).map((row) => row.tone)).toEqual(["tag", "commit"]);
  });

  it("returns no rows for an empty history", () => {
    expect(parseGitGraphOutput("")).toEqual([]);
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
