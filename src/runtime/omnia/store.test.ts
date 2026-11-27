import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createOmniaRun,
  deriveOmniaRequirements,
  formatOmniaReport,
  getActiveOmniaRun,
  getLatestOmniaRun,
  loadOmniaRun,
  recordOmniaEvidence,
  transitionOmniaRun,
} from "./store.js";

const roots: string[] = [];

function projectRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "agent-termo-omnia-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("OMNIA run store", () => {
  it("extracts explicit acceptance criteria without inventing extra requirements", () => {
    const requirements = deriveOmniaRequirements(
      "Build a task manager.\n\nAcceptance criteria:\n- Users can add tasks.\n- Users can delete tasks.",
    );
    expect(requirements.map((item) => item.description)).toEqual([
      "Users can add tasks.",
      "Users can delete tasks.",
    ]);
    expect(requirements.every((item) => item.strategy === "browser")).toBe(true);
    expect(requirements.every((item) => item.verificationPlan.includes("real browser"))).toBe(true);
  });

  it("selects distinct verification strategies from requirement intent", () => {
    const requirements = deriveOmniaRequirements(
      "Project requirements:\n- Build a REST API endpoint.\n- Create a responsive dashboard UI.\n- Write setup documentation.\n- Make the experience intuitive.",
    );
    expect(requirements.map((item) => item.strategy)).toEqual([
      "automated", "browser", "static", "manual",
    ]);
    expect(requirements.every((item) => item.verificationPlan.length > 20)).toBe(true);
  });

  it("creates and reloads a persisted run", () => {
    const root = projectRoot();
    const run = createOmniaRun(root, "Build a small Kanban application.");

    expect(run.status).toBe("queued");
    expect(loadOmniaRun(root, run.id)?.goal).toBe(run.goal);
    expect(getLatestOmniaRun(root)?.id).toBe(run.id);
    expect(getActiveOmniaRun(root)?.id).toBe(run.id);

    const saved = JSON.parse(readFileSync(
      resolve(root, ".agent-termo", "omnia", "runs", run.id + ".json"),
      "utf8",
    )) as { version: number };
    expect(saved.version).toBe(1);
  });

  it("records evidence but does not pretend generic checks verify the user goal", () => {
    const root = projectRoot();
    const run = createOmniaRun(root, "Implement a feature.");
    transitionOmniaRun(root, run.id, "executing");
    const evidence = recordOmniaEvidence(root, {
      type: "command",
      source: "bun run test",
      description: "Project test suite passed.",
      success: true,
    });
    const updated = loadOmniaRun(root, run.id);

    expect(evidence?.success).toBe(true);
    expect(updated?.evidence).toHaveLength(1);
    expect(updated?.requirements[0]?.status).toBe("pending");
    expect(formatOmniaReport(updated!)).toContain("remain unverified");
  });

  it("rejects invalid lifecycle transitions", () => {
    const root = projectRoot();
    const run = createOmniaRun(root, "Implement a feature.");
    expect(() => transitionOmniaRun(root, run.id, "completed")).toThrow(
      "Invalid OMNIA transition",
    );
  });

  it("marks an interrupted execution as blocked rather than completed", () => {
    const root = projectRoot();
    const run = createOmniaRun(root, "Implement a feature.");
    transitionOmniaRun(root, run.id, "executing");
    const blocked = transitionOmniaRun(root, run.id, "blocked", {
      blocker: "The model call was cancelled.",
    });

    expect(blocked.status).toBe("blocked");
    expect(blocked.requirements[0]?.status).toBe("blocked");
  });
});
