import { describe, expect, it } from "vitest";
import { getOmniaDashboardItemCount, getOmniaDashboardStats } from "./omnia-dashboard.js";
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
  it("summarizes verification, evidence, and repair progress", () => {
    expect(getOmniaDashboardStats(run)).toEqual({
      verified: 1,
      total: 2,
      evidenceCount: 12,
      repairAttempts: 1,
      progressPercent: 50,
    });
  });

  it("bounds the navigable list to requirements and the latest eight evidence items", () => {
    expect(getOmniaDashboardItemCount(run)).toBe(10);
  });
});
