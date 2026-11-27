import { describe, expect, it } from "vitest";
import { parseOmniaVerification } from "./verifier.js";
import type { OmniaRun } from "./types.js";

const run: OmniaRun = {
  version: 1,
  id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  goal: "Build a feature.",
  status: "verifying",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  requirements: [{
    id: "req-01",
    description: "Create a responsive page.",
    status: "pending",
    strategy: "browser",
    verificationPlan: "Verify in browser.",
    evidenceIds: [],
  }],
  evidence: [],
};

describe("OMNIA independent verifier response", () => {
  it("accepts valid JSON and only keeps known requirement IDs", () => {
    const result = parseOmniaVerification(JSON.stringify({
      summary: "Checked one requirement.",
      requirements: [
        { requirementId: "req-01", status: "verified", evidenceIds: ["evidence-1"], reason: "Browser assertion passed." },
        { requirementId: "req-99", status: "verified", evidenceIds: ["evidence-2"], reason: "Unknown requirement." },
      ],
    }), run);
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.requirementId).toBe("req-01");
  });

  it("rejects malformed verifier output", () => {
    expect(() => parseOmniaVerification("not json", run)).toThrow("valid JSON");
  });
});
