export type OmniaStatus =
  | "queued" | "executing" | "verifying" | "completed"
  | "completed_with_warnings" | "blocked" | "failed" | "cancelled";

export type OmniaRequirementStatus = "pending" | "verified" | "unverified" | "blocked";
export type OmniaVerificationStrategy = "browser" | "automated" | "static" | "manual";

export interface OmniaVerificationDecision {
  requirementId: string;
  status: "verified" | "unverified" | "blocked";
  evidenceIds: string[];
  reason: string;
}

export interface OmniaRequirement {
  id: string;
  description: string;
  status: OmniaRequirementStatus;
  strategy: OmniaVerificationStrategy;
  verificationPlan: string;
  evidenceIds: string[];
}

export type OmniaEvidenceType = "tool" | "command" | "file" | "check" | "browser" | "review";

export interface OmniaEvidence {
  id: string;
  type: OmniaEvidenceType;
  source: string;
  description: string;
  success: boolean;
  timestamp: string;
  output?: string;
  requirementId?: string;
}

export interface OmniaRun {
  version: 1;
  id: string;
  goal: string;
  status: OmniaStatus;
  createdAt: string;
  updatedAt: string;
  repairAttempts: number;
  requirements: OmniaRequirement[];
  evidence: OmniaEvidence[];
  summary?: string;
  blocker?: string;
}
