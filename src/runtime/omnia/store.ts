import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  OmniaEvidence,
  OmniaEvidenceType,
  OmniaRequirement,
  OmniaRun,
  OmniaStatus,
} from "./types.js";

const RUNS_DIRECTORY = (projectRoot: string): string =>
  resolve(projectRoot, ".agent-termo", "omnia", "runs");
const RUN_ID_PATTERN = /^[0-9a-f-]{36}$/i;
const MAX_GOAL_LENGTH = 20_000;
const MAX_REQUIREMENTS = 12;
const MAX_EVIDENCE = 500;
const MAX_EVIDENCE_TEXT = 2_000;

const TRANSITIONS: Record<OmniaStatus, readonly OmniaStatus[]> = {
  queued: ["executing", "failed", "cancelled"],
  executing: ["verifying", "blocked", "failed", "cancelled"],
  verifying: ["completed", "completed_with_warnings", "blocked", "failed", "cancelled"],
  blocked: ["executing", "cancelled", "failed"],
  completed: [],
  completed_with_warnings: [],
  failed: [],
  cancelled: [],
};

function requireGoal(goal: string): string {
  if (typeof goal !== "string" || !goal.trim()) throw new Error("An OMNIA goal is required.");
  return goal.trim().slice(0, MAX_GOAL_LENGTH);
}

export function deriveOmniaVerificationStrategy(description: string): {
  strategy: OmniaRequirement["strategy"];
  verificationPlan: string;
} {
  const text = description.toLowerCase();
  if (/\b(ui|user interface|frontend|front-end|visual|responsive|layout|page|screen|form|navigation|button|interaction|workflow)\b/.test(text) ||
      /\busers?\s+(can|should|must)\b/.test(text)) {
    return {
      strategy: "browser",
      verificationPlan: "Run the application and exercise the relevant user flow in a real browser. Assert visible outcomes, navigation, and interaction states at the relevant viewport sizes.",
    };
  }
  if (/\b(api|endpoint|backend|database|query|auth|authentication|authorization|security|integration|performance|algorithm|service)\b/.test(text)) {
    return {
      strategy: "automated",
      verificationPlan: "Run the narrowest relevant automated test or integration check, then run the project's applicable test, typecheck, lint, and build scripts.",
    };
  }
  if (/\b(documentation|readme|guide|docs|configuration|config|schema|migration)\b/.test(text)) {
    return {
      strategy: "static",
      verificationPlan: "Inspect the final changed files for completeness, consistency, valid syntax, and accurate references; run a parser or project check when available.",
    };
  }
  if (/\b(accessible|usability|intuitive|polished|beautiful|professional|easy to use|feel)\b/.test(text)) {
    return {
      strategy: "manual",
      verificationPlan: "Collect concrete implementation evidence and identify the remaining subjective judgment. Do not mark this requirement verified from build or test results alone.",
    };
  }
  return {
    strategy: "automated",
    verificationPlan: "Identify the most direct test for the requested behavior, run it, and record the exact command and observed result. If no direct test exists, leave the requirement unverified.",
  };
}

export function deriveOmniaRequirements(goal: string): OmniaRequirement[] {
  const lines = goal.split(/\r?\n/);
  const heading = lines.findIndex((line) =>
    /^\s{0,3}#{0,6}\s*(?:acceptance criteria|requirements)\s*:?\s*$/i.test(line),
  );
  const criteria: string[] = [];

  if (heading >= 0) {
    for (const line of lines.slice(heading + 1)) {
      if (/^\s{0,3}#{1,6}\s+/.test(line)) break;
      const match = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+?)\s*$/);
      if (match?.[1]) criteria.push(match[1].trim().slice(0, 500));
      if (criteria.length >= MAX_REQUIREMENTS) break;
    }
  }

  const descriptions = criteria.length > 0
    ? criteria
    : [goal.replace(/\s+/g, " ").trim().slice(0, 500)];

  return descriptions.map((description, index) => ({
    id: `req-${String(index + 1).padStart(2, "0")}`,
    description,
    status: "pending",
    ...deriveOmniaVerificationStrategy(description),
    evidenceIds: [],
  }));
}

function runPath(projectRoot: string, id: string): string {
  if (!RUN_ID_PATTERN.test(id)) throw new Error("Invalid OMNIA run ID.");
  return resolve(RUNS_DIRECTORY(projectRoot), id + ".json");
}

function normalizeRun(value: unknown): OmniaRun | undefined {
  if (!value || typeof value !== "object") return undefined;
  const run = value as Partial<OmniaRun>;
  const statuses: OmniaStatus[] = [
    "queued", "executing", "verifying", "completed",
    "completed_with_warnings", "blocked", "failed", "cancelled",
  ];
  if (
    run.version !== 1 ||
    typeof run.id !== "string" || !RUN_ID_PATTERN.test(run.id) ||
    typeof run.goal !== "string" || !run.goal.trim() ||
    !statuses.includes(run.status as OmniaStatus) ||
    typeof run.createdAt !== "string" ||
    typeof run.updatedAt !== "string" ||
    !Array.isArray(run.requirements) ||
    !Array.isArray(run.evidence)
  ) return undefined;

  const requirements = run.requirements.flatMap((value): OmniaRequirement[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as Partial<OmniaRequirement>;
    if (
      typeof item.id !== "string" ||
      typeof item.description !== "string" ||
      !["pending", "verified", "unverified", "blocked"].includes(item.status ?? "") ||
      !Array.isArray(item.evidenceIds) ||
      !item.evidenceIds.every((id) => typeof id === "string")
    ) return [];

    const derived = deriveOmniaVerificationStrategy(item.description);
    const strategy = ["browser", "automated", "static", "manual"].includes(item.strategy ?? "")
      ? item.strategy!
      : derived.strategy;
    return [{
      id: item.id,
      description: item.description,
      status: item.status!,
      strategy,
      verificationPlan: typeof item.verificationPlan === "string" ? item.verificationPlan : derived.verificationPlan,
      evidenceIds: item.evidenceIds,
    }];
  });
  const evidence = run.evidence.filter((item): item is OmniaEvidence =>
    Boolean(item) &&
    typeof item.id === "string" &&
    ["tool", "command", "file", "check", "browser", "review"].includes(item.type) &&
    typeof item.source === "string" &&
    typeof item.description === "string" &&
    typeof item.success === "boolean" &&
    typeof item.timestamp === "string",
  );

  return {
    version: 1,
    id: run.id,
    goal: run.goal.slice(0, MAX_GOAL_LENGTH),
    status: run.status as OmniaStatus,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    repairAttempts: Number.isInteger(run.repairAttempts) && (run.repairAttempts ?? 0) >= 0 ? run.repairAttempts! : 0,
    requirements,
    evidence,
    summary: typeof run.summary === "string" ? run.summary.slice(0, MAX_EVIDENCE_TEXT) : undefined,
    blocker: typeof run.blocker === "string" ? run.blocker.slice(0, MAX_EVIDENCE_TEXT) : undefined,
  };
}

function persistRun(projectRoot: string, run: OmniaRun): void {
  const path = runPath(projectRoot, run.id);
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = path + ".tmp";
  writeFileSync(temporaryPath, JSON.stringify(run, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
}

export function createOmniaRun(projectRoot: string, goalInput: string): OmniaRun {
  const goal = requireGoal(goalInput);
  const now = new Date().toISOString();
  const run: OmniaRun = {
    version: 1,
    id: randomUUID(),
    goal,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    repairAttempts: 0,
    requirements: deriveOmniaRequirements(goal),
    evidence: [],
  };
  persistRun(projectRoot, run);
  return run;
}

export function loadOmniaRun(projectRoot: string, id: string): OmniaRun | undefined {
  const path = runPath(projectRoot, id);
  if (!existsSync(path)) return undefined;
  try {
    return normalizeRun(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
}

export function getLatestOmniaRun(projectRoot: string): OmniaRun | undefined {
  const directory = RUNS_DIRECTORY(projectRoot);
  if (!existsSync(directory)) return undefined;
  const runs = readdirSync(directory)
    .filter((file) => file.endsWith(".json") && RUN_ID_PATTERN.test(file.slice(0, -5)))
    .map((file) => loadOmniaRun(projectRoot, file.slice(0, -5)))
    .filter((run): run is OmniaRun => run !== undefined)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return runs[0];
}

export function getActiveOmniaRun(projectRoot: string): OmniaRun | undefined {
  const run = getLatestOmniaRun(projectRoot);
  return run && ["queued", "executing", "verifying"].includes(run.status) ? run : undefined;
}

export function transitionOmniaRun(
  projectRoot: string,
  id: string,
  status: OmniaStatus,
  details: { summary?: string; blocker?: string } = {},
): OmniaRun {
  const run = loadOmniaRun(projectRoot, id);
  if (!run) throw new Error("OMNIA run not found.");
  if (run.status !== status && !TRANSITIONS[run.status].includes(status)) {
    throw new Error(`Invalid OMNIA transition: ${run.status} -> ${status}.`);
  }

  run.status = status;
  run.updatedAt = new Date().toISOString();
  if (details.summary !== undefined) run.summary = details.summary.slice(0, MAX_EVIDENCE_TEXT);
  if (details.blocker !== undefined) run.blocker = details.blocker.slice(0, MAX_EVIDENCE_TEXT);
  if (status === "completed_with_warnings" || status === "blocked" || status === "failed") {
    run.requirements = run.requirements.map((requirement) => ({
      ...requirement,
      status: requirement.status === "verified" ? "verified" : status === "blocked" ? "blocked" : "unverified",
    }));
  }
  persistRun(projectRoot, run);
  return run;
}

export function recordOmniaEvidence(
  projectRoot: string,
  input: {
    type: OmniaEvidenceType;
    source: string;
    description: string;
    success: boolean;
    output?: string;
    requirementId?: string;
  },
): OmniaEvidence | undefined {
  const run = getActiveOmniaRun(projectRoot);
  if (!run || run.evidence.length >= MAX_EVIDENCE) return undefined;

  const evidence: OmniaEvidence = {
    id: randomUUID(),
    type: input.type,
    source: input.source.slice(0, 120),
    description: input.description.replace(/\s+/g, " ").trim().slice(0, MAX_EVIDENCE_TEXT),
    success: input.success,
    timestamp: new Date().toISOString(),
    output: input.output?.slice(0, MAX_EVIDENCE_TEXT),
    requirementId: input.requirementId,
  };
  run.evidence.push(evidence);
  if (input.requirementId) {
    run.requirements = run.requirements.map((requirement) =>
      requirement.id === input.requirementId
        ? { ...requirement, evidenceIds: [...requirement.evidenceIds, evidence.id] }
        : requirement,
    );
  }
  run.updatedAt = new Date().toISOString();
  persistRun(projectRoot, run);
  return evidence;
}

export function incrementOmniaRepairAttempt(projectRoot: string, id: string): OmniaRun {
  const run = loadOmniaRun(projectRoot, id);
  if (!run) throw new Error("OMNIA run not found.");
  if (run.status !== "verifying") throw new Error("OMNIA repair attempts can only be incremented while a run is verifying.");
  run.repairAttempts++;
  run.updatedAt = new Date().toISOString();
  persistRun(projectRoot, run);
  return run;
}

export function applyOmniaVerification(
  projectRoot: string,
  id: string,
  decisions: readonly import("./types.js").OmniaVerificationDecision[],
  summary: string,
): OmniaRun {
  const run = loadOmniaRun(projectRoot, id);
  if (!run) throw new Error("OMNIA run not found.");
  if (run.status !== "verifying") throw new Error("OMNIA verification can only be applied while a run is verifying.");

  const decisionById = new Map(decisions.map((decision) => [decision.requirementId, decision]));
  const evidenceById = new Map(run.evidence.map((item) => [item.id, item]));
  const now = new Date().toISOString();

  run.requirements = run.requirements.map((requirement) => {
    const decision = decisionById.get(requirement.id);
    if (!decision && requirement.status === "verified") return requirement;
    const citedIds = [...new Set(decision?.evidenceIds ?? [])];
    const citedEvidence = citedIds.map((evidenceId) => evidenceById.get(evidenceId));
    const expectedType = requirement.strategy === "browser"
      ? "browser"
      : requirement.strategy === "automated"
        ? "check"
        : requirement.strategy === "static"
          ? "file"
          : undefined;
    const evidenceSupportsStrategy = Boolean(expectedType) &&
      citedEvidence.length > 0 &&
      citedEvidence.every((item) => item?.success === true && item.type === expectedType);
    const verified = decision?.status === "verified" &&
      requirement.strategy !== "manual" &&
      evidenceSupportsStrategy;
    const status = verified
      ? "verified"
      : decision?.status === "blocked" ? "blocked" : "unverified";
    const reason = decision?.reason?.trim() || "The independent verifier did not provide a supported finding.";
    const reviewEvidence: OmniaEvidence = {
      id: randomUUID(),
      type: "review",
      source: "OMNIA independent verifier",
      description: reason.slice(0, MAX_EVIDENCE_TEXT),
      success: verified,
      timestamp: now,
      requirementId: requirement.id,
    };
    run.evidence.push(reviewEvidence);
    return {
      ...requirement,
      status,
      evidenceIds: [...citedIds.filter((evidenceId) => evidenceById.has(evidenceId)), reviewEvidence.id],
    };
  });

  run.summary = summary.slice(0, MAX_EVIDENCE_TEXT);
  run.updatedAt = now;
  persistRun(projectRoot, run);
  return run;
}

export function formatOmniaReport(run: OmniaRun): string {
  const verified = run.requirements.filter((item) => item.status === "verified").length;
  const lines = [
    `# TERMO OMNIA — ${run.id.slice(0, 8)}`,
    "",
    `**Status:** ${run.status.replace(/_/g, " ")}`,
    `**Started:** ${run.createdAt}`,
    `**Updated:** ${run.updatedAt}`,
    `**Repair attempts:** ${run.repairAttempts}`,
    "",
    "## Goal",
    "",
    run.goal,
    "",
    "## Requirements",
    "",
    `Verified: ${verified}/${run.requirements.length}`,
    "",
    ...run.requirements.map((item) =>
      `- [${item.status === "verified" ? "x" : " "}] **${item.id}** — ${item.description} (${item.status}; strategy: ${item.strategy})\n  - Verification: ${item.verificationPlan}`,
    ),
    "",
    "## Execution evidence",
    "",
  ];

  if (run.evidence.length > 0) {
    lines.push(...run.evidence.map((item) =>
      `- ${item.success ? "PASS" : "FAIL"} · ${item.type} · ${item.source}: ${item.description}`,
    ));
  } else {
    lines.push("No execution evidence has been recorded.");
  }

  lines.push(
    "",
    "## Completion integrity",
    "",
    "Build, lint, and test results prove only that those checks ran. They do not independently prove every user requirement. Requirements remain unverified until observed evidence is explicitly mapped to them.",
  );
  if (run.blocker) lines.push("", "## Blocker", "", run.blocker);
  if (run.summary) lines.push("", "## Summary", "", run.summary);
  return lines.join("\n");
}
