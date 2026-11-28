import { describe, expect, it } from "vitest";
import { getOmniaDashboardItemCount, getOmniaDashboardScrollOffset, getOmniaDashboardStats, groupOmniaActivityEntries, shouldReopenOmniaDashboard } from "./omnia-dashboard.js";
import type { OmniaRun } from "../runtime/omnia/types.js";

const run: OmniaRun = {
  version: 1,
  id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  goal: "Build a task manager.",
  status: "verifying",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  repairAttempts: 1,
  requirements: [
    { id: "req-01", description: "Add tasks.", status: "verified", strategy: "browser", verificationPlan: "Check browser.", evidenceIds: [] },
    { id: "req-02", description: "Delete tasks.", status: "unverified", strategy: "browser", verificationPlan: "Check browser.", evidenceIds: [] },
  ],
  evidence: Array.from({ length: 12 }, (_, index) => ({
    id: "evidence-" + index,
    type: "check",
    source: "bun run test",
    description: "Check passed.",
    success: true,
    timestamp: "2026-01-01T00:00:00.000Z",
  })),
};

describe("OMNIA dashboard", () => {
  it("reopens from the workspace leader chord only inside the leader timeout", () => {
    expect(shouldReopenOmniaDashboard("text", "o", 1_000, 2_000)).toBe(true);
    expect(shouldReopenOmniaDashboard("text", "O", 1_000, 2_500)).toBe(true);
    expect(shouldReopenOmniaDashboard("text", "o", 1_000, 2_501)).toBe(false);
    expect(shouldReopenOmniaDashboard("text", "x", 1_000, 1_200)).toBe(false);
    expect(shouldReopenOmniaDashboard("ctrl+o", undefined, 1_000, 1_200)).toBe(false);
    expect(shouldReopenOmniaDashboard("text", "o", undefined, 1_200)).toBe(false);
  });

  it("groups an entire file diff into one activity item and preserves every line", () => {
    const entries = [
      { id: 10, kind: "info", content: "src/components/Board.tsx  MODIFY  +80 -12" },
      ...Array.from({ length: 150 }, (_, index) => ({
        id: 11 + index,
        kind: index % 3 === 0 ? "diff-add" : index % 3 === 1 ? "diff-remove" : "diff-context",
        content: String(index + 1).padStart(4) + " │ const value = " + index + ";",
      })),
      { id: 200, kind: "success", content: "File change applied." },
    ];
    const grouped = groupOmniaActivityEntries(entries);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({
      id: 10,
      kind: "code-diff",
      title: "src/components/Board.tsx  MODIFY  +80 -12",
    });
    expect(grouped[0]!.lines).toHaveLength(150);
    expect(grouped[0]!.lines?.[149]?.content).toContain("const value = 149");
    expect(grouped[1]).toMatchObject({ id: 200, kind: "success" });
  });

  it("keeps separate file diffs as separate selectable items", () => {
    const entries = [
      { id: 1, kind: "info", content: "src/a.ts  NEW  +2 -0" },
      { id: 2, kind: "diff-add", content: "+1 │ first" },
      { id: 3, kind: "diff-add", content: "+2 │ second" },
      { id: 4, kind: "info", content: "src/b.ts  MODIFY  +1 -1" },
      { id: 5, kind: "diff-remove", content: "-1 │ old" },
      { id: 6, kind: "diff-add", content: "+1 │ new" },
    ];
    const grouped = groupOmniaActivityEntries(entries);
    expect(grouped).toHaveLength(2);
    expect(grouped.map((item) => item.title)).toEqual([
      "src/a.ts  NEW  +2 -0",
      "src/b.ts  MODIFY  +1 -1",
    ]);
    expect(grouped.map((item) => item.lines?.length)).toEqual([2, 2]);
  });

  it("summarizes verification, evidence, and repair progress", () => {
    expect(getOmniaDashboardStats(run)).toEqual({
      verified: 1,
      total: 2,
      evidenceCount: 12,
      repairAttempts: 1,
      progressPercent: 50,
    });
  });

  it("includes bounded live activity in the navigable list", () => {
    expect(getOmniaDashboardItemCount(run, 60)).toBe(50);
  });

  it("maps selected requirements, evidence, and activity to rendered scroll rows", () => {
    const activity = [
      { id: 1, kind: "markdown", content: "Writing the page\nexport default function Page() {}" },
      { id: 2, kind: "diff-add", content: "+export default function App() {}" },
    ];
    expect(getOmniaDashboardScrollOffset(run, 0)).toBe(2);
    expect(getOmniaDashboardScrollOffset(run, 2)).toBe(12);
    expect(getOmniaDashboardScrollOffset(run, 10, activity)).toBe(38);
    expect(getOmniaDashboardScrollOffset(run, 11, activity)).toBe(42);
    expect(getOmniaDashboardItemCount(run, activity.length)).toBe(12);
  });
});
