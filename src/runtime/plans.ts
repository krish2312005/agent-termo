import type { ToolDef } from '../types/index.js';

export type TaskPlanStatus = 'draft' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
export type PlanStepStatus = 'pending' | 'in_progress' | 'completed';

export interface TaskPlanStep {
  number: number;
  title: string;
  description: string;
  affectedFiles: string[];
  risks: string[];
  dependsOn: number[];
  status: PlanStepStatus;
  summary?: string;
}

export interface TaskPlan {
  request: string;
  title: string;
  summary: string;
  createdAt: string;
  status: TaskPlanStatus;
  risks: string[];
  steps: TaskPlanStep[];
}

function stringList(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 300))
    .slice(0, limit);
}

export function normalizeTaskPlan(value: unknown): TaskPlan | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  const statuses: TaskPlanStatus[] = ['draft', 'approved', 'in_progress', 'completed', 'cancelled'];
  if (
    typeof input.request !== 'string' ||
    typeof input.title !== 'string' ||
    typeof input.summary !== 'string' ||
    typeof input.createdAt !== 'string' ||
    !statuses.includes(input.status as TaskPlanStatus) ||
    !Array.isArray(input.steps) ||
    input.steps.length < 1 ||
    input.steps.length > 8
  ) return undefined;

  const steps: TaskPlanStep[] = [];
  for (let index = 0; index < input.steps.length; index++) {
    const raw = input.steps[index];
    if (!raw || typeof raw !== 'object') return undefined;
    const step = raw as Record<string, unknown>;
    const stepStatuses: PlanStepStatus[] = ['pending', 'in_progress', 'completed'];
    if (
      step.number !== index + 1 ||
      typeof step.title !== 'string' ||
      typeof step.description !== 'string' ||
      !stepStatuses.includes(step.status as PlanStepStatus)
    ) return undefined;
    const dependsOn = Array.isArray(step.dependsOn)
      ? step.dependsOn.filter((item): item is number => Number.isInteger(item))
      : [];
    if (dependsOn.some((dependency) => dependency < 1 || dependency >= index + 1) || new Set(dependsOn).size !== dependsOn.length) {
      return undefined;
    }
    steps.push({
      number: index + 1,
      title: step.title.slice(0, 120),
      description: step.description.slice(0, 600),
      affectedFiles: stringList(step.affectedFiles),
      risks: stringList(step.risks),
      dependsOn,
      status: step.status as PlanStepStatus,
      summary: typeof step.summary === 'string' ? step.summary.slice(0, 500) : undefined,
    });
  }

  return {
    request: input.request.slice(0, 20_000),
    title: input.title.slice(0, 120),
    summary: input.summary.slice(0, 800),
    createdAt: input.createdAt,
    status: input.status as TaskPlanStatus,
    risks: stringList(input.risks),
    steps,
  };
}

/** Parse and validate the planner's JSON response. Dependencies use 1-based step numbers. */
export function parseTaskPlan(content: string, request: string): TaskPlan {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The planner did not return a JSON plan.');
  let value: unknown;
  try {
    value = JSON.parse(content.slice(start, end + 1));
  } catch {
    throw new Error('The planner returned invalid JSON. Run /plan again.');
  }
  if (!value || typeof value !== 'object') throw new Error('The planner returned an invalid plan.');
  const raw = value as Record<string, unknown>;
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
  const normalized = normalizeTaskPlan({
    request,
    title: raw.title,
    summary: raw.summary,
    createdAt: new Date().toISOString(),
    status: 'draft',
    risks: raw.risks,
    steps: rawSteps.map((item, index) => {
      const step = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        number: index + 1,
        title: step.title,
        description: step.description,
        affectedFiles: step.affectedFiles,
        risks: step.risks,
        dependsOn: step.dependsOn,
        status: 'pending',
      };
    }),
  });
  if (!normalized) {
    throw new Error('The planner returned an incomplete plan. It must include a title, summary, and 1–8 valid ordered steps.');
  }
  return normalized;
}


/** Render a plan as readable Markdown for the terminal's assistant-message renderer. */
export function formatTaskPlanMarkdown(plan: TaskPlan): string {
  const completed = plan.steps.filter((step) => step.status === 'completed').length;
  const lines = [
    '# ' + plan.title,
    '**Status:** ' + plan.status.replace(/_/g, ' ') + ' · **Progress:** ' + completed + '/' + plan.steps.length + ' steps',
    '',
    plan.summary,
    '',
    '## Steps',
  ];

  for (const step of plan.steps) {
    const marker = step.status === 'completed' ? '✓' : step.status === 'in_progress' ? '›' : '○';
    lines.push('', step.number + '. ' + marker + ' **' + step.title + '**', '   ' + step.description);
    if (step.affectedFiles.length > 0) {
      lines.push('   - **Files:** ' + step.affectedFiles.map((file) => '`' + file + '`').join(', '));
    }
    if (step.dependsOn.length > 0) lines.push('   - **Depends on:** steps ' + step.dependsOn.join(', '));
    if (step.risks.length > 0) lines.push('   - **Risks:** ' + step.risks.join('; '));
    if (step.summary) lines.push('   - **Result:** ' + step.summary);
  }

  if (plan.risks.length > 0) {
    lines.push('', '## Overall risks', ...plan.risks.map((risk) => '- ' + risk));
  }
  return lines.join('\n');
}

export function updatePlanStep(
  plan: TaskPlan,
  stepNumber: number,
  status: PlanStepStatus,
  summary = '',
): string {
  if (plan.status !== 'in_progress') throw new Error('There is no approved plan currently executing.');
  if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > plan.steps.length) {
    throw new Error('Step number is outside the plan.');
  }
  const step = plan.steps[stepNumber - 1]!;
  if (status === 'in_progress') {
    if (step.status === 'completed') return 'Step ' + stepNumber + ' is already complete.';
    const prerequisites = [...new Set([...step.dependsOn, ...plan.steps.slice(0, stepNumber - 1).map((previous) => previous.number)])];
    const blocked = prerequisites.find((dependency) => plan.steps[dependency - 1]?.status !== 'completed');
    if (blocked) throw new Error('Complete step ' + blocked + ' before starting step ' + stepNumber + '.');
    step.status = 'in_progress';
  } else if (status === 'completed') {
    if (step.status === 'completed') return 'Step ' + stepNumber + ' is already complete.';
    if (step.status !== 'in_progress') throw new Error('Mark step ' + stepNumber + ' in progress before completing it.');
    step.status = 'completed';
  } else {
    throw new Error('Unsupported plan step status.');
  }
  if (summary.trim()) step.summary = summary.trim().slice(0, 500);
  return 'Step ' + stepNumber + ' marked ' + status + ': ' + step.title;
}

export function buildPlanContext(plan: TaskPlan): string {
  const steps = plan.steps.map((step) => {
    const files = step.affectedFiles.length > 0 ? ' | Files: ' + step.affectedFiles.join(', ') : '';
    const dependencies = step.dependsOn.length > 0 ? ' | Depends on: ' + step.dependsOn.join(', ') : '';
    return step.number + '. [' + step.status + '] ' + step.title + ': ' + step.description + files + dependencies;
  });
  return [
    '## Approved Execution Plan',
    'Title: ' + plan.title,
    'Goal: ' + plan.request,
    'Summary: ' + plan.summary,
    ...steps,
    '',
    'Follow these steps in order and do not skip dependencies. Before starting a step, call plan:update with its step number and status "in_progress". After verifying the step is complete, call plan:update with status "completed" and a concise summary. Do not mark work complete unless it has actually been implemented and checked. Report blockers instead of claiming completion.',
  ].join('\n');
}

export const PLAN_PROGRESS_TOOL: ToolDef = {
  name: 'plan:update',
  description: 'Update progress for the currently approved execution plan. Call once before starting a step and again after its work is verified.',
  parameters: {
    type: 'object',
    properties: {
      step: { type: 'integer', description: '1-based plan step number' },
      status: { type: 'string', enum: ['in_progress', 'completed'] },
      summary: { type: 'string', description: 'Brief result or verification note' },
    },
    required: ['step', 'status'],
  },
};
