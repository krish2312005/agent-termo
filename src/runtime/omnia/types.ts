export type OmniaStatus =
  | "queued" | "executing" | "verifying" | "completed"
  | "completed_with_warnings" | "blocked" | "failed" | "cancelled";

export type OmniaRequirementStatus = "pending" | "verified" | "unverified" | "blocked";

export interface OmniaRequirement {
  id: string;
  description: string;
  status: OmniaRequirementStatus;
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
  requirements: OmniaRequirement[];
  evidence: OmniaEvidence[];
  summary?: string;
  blocker?: string;
}
