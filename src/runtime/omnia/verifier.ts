import type { OmniaRun, OmniaVerificationDecision } from "./types.js";

export interface ParsedOmniaVerification {
  decisions: OmniaVerificationDecision[];
  summary: string;
}

export function parseOmniaVerification(content: string, run: OmniaRun): ParsedOmniaVerification {
  const normalized = content.trim()
    .replace(/^\x60{3}(?:json)?\s*/i, "")
    .replace(/\s*\x60{3}$/i, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("The independent verifier did not return valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { requirements?: unknown }).requirements)) {
    throw new Error("The independent verifier response is missing its requirements array.");
  }

  const allowedIds = new Set(run.requirements.map((item) => item.id));
  const decisions: OmniaVerificationDecision[] = [];
  for (const value of (parsed as { requirements: unknown[] }).requirements) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    if (typeof item.requirementId !== "string" || !allowedIds.has(item.requirementId)) continue;
    const status = item.status === "verified" || item.status === "blocked" ? item.status : "unverified";
    const evidenceIds = Array.isArray(item.evidenceIds)
      ? item.evidenceIds.filter((id): id is string => typeof id === "string")
      : [];
    decisions.push({
      requirementId: item.requirementId,
      status,
      evidenceIds,
      reason: typeof item.reason === "string" ? item.reason.slice(0, 2_000) : "No verifier rationale was provided.",
    });
  }

  return {
    decisions,
    summary: typeof (parsed as { summary?: unknown }).summary === "string"
      ? (parsed as { summary: string }).summary.slice(0, 2_000)
      : "Independent requirement verification completed.",
  };
}
