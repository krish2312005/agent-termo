import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyOmniaVerification,
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
      "Build a project.\n\nRequirements:\n- Build a REST API endpoint.\n- Create a responsive dashboard UI.\n- Write setup documentation.\n- Make the experience intuitive.",
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

  it("loads version-one runs created before verification strategies were added", () => {
    const root = projectRoot();
    const run = createOmniaRun(root, "Build a responsive dashboard.");
    const path = resolve(root, ".agent-termo", "omnia", "runs", run.id + ".json");
    const legacy = JSON.parse(readFileSync(path, "utf8")) as {
      requirements: Array<Record<string, unknown>>;
    };
    delete legacy.requirements[0]!.strategy;
    delete legacy.requirements[0]!.verificationPlan;
    writeFileSync(path, JSON.stringify(legacy), "utf8");

    const loaded = loadOmniaRun(root, run.id);
    expect(loaded?.requirements[0]?.strategy).toBe("browser");
    expect(loaded?.requirements[0]?.verificationPlan).toContain("real browser");
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

  it("only verifies requirements with successful evidence of the required kind", () => {
    const root = projectRoot();
    const run = createOmniaRun(root,
      "Implement a project.\\n\\nRequirements:\\n- Create a responsive dashboard UI.\\n- Implement an API endpoint.\\n- Write setup documentation.\\n- Make the interface intuitive.",
    );
    transitionOmniaRun(root, run.id, "executing");
    transitionOmniaRun(root, run.id, "verifying");
    const browser = recordOmniaEvidence(root, {
      type: "browser", source: "browser:verify", description: "Dashboard flow passed.", success: true,
    })!;
    const check = recordOmniaEvidence(root, {
      type: "check", source: "bun run test", description: "API tests passed.", success: true,
    })!;
    const file = recordOmniaEvidence(root, {
      type: "file", source: "docs/setup.md", description: "Documentation file applied.", success: true,
    })!;

    const verified = applyOmniaVerification(root, run.id, [
      { requirementId: "req-01", status: "verified", evidenceIds: [browser.id], reason: "The browser flow and visible dashboard behavior passed." },
      { requirementId: "req-02", status: "verified", evidenceIds: [browser.id], reason: "A browser check does not prove the API endpoint." },
      { requirementId: "req-03", status: "verified", evidenceIds: [file.id], reason: "The requested documentation file was written and reviewed." },
      { requirementId: "req-04", status: "verified", evidenceIds: [file.id], reason: "Subjective usability still needs human judgment." },
    ], "Independent verification finished.");

    expect(verified.requirements.map((item) => item.status)).toEqual([
      "verified", "unverified", "verified", "unverified",
    ]);
    expect(verified.evidence.filter((item) => item.type === "review")).toHaveLength(4);
  });

  it("rejects verification updates outside the verifying lifecycle state", () => {
    const root = projectRoot();
    const run = createOmniaRun(root, "Implement a feature.");
    expect(() => applyOmniaVerification(root, run.id, [], "No verification.")).toThrow(
      "OMNIA verification can only be applied while a run is verifying",
    );
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
