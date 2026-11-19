import { describe, expect, it } from 'vitest';
import { formatTaskPlanDocument, formatTaskPlanMarkdown, parseTaskPlan, updatePlanStep, writeTaskPlanFile } from '../../src/runtime/plans.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const validPlan = JSON.stringify({
  title: 'Add feature',
  summary: 'Implement and validate the feature.',
  risks: ['Existing callers may rely on the old behavior.'],
  steps: [
    { title: 'Inspect', description: 'Review the relevant implementation.', affectedFiles: ['src/main.ts'], risks: [], dependsOn: [] },
    { title: 'Implement', description: 'Make the smallest required changes.', affectedFiles: ['src/main.ts'], risks: ['Regression risk'], dependsOn: [1] },
  ],
});

describe('execution plans', () => {
  it('parses a draft with ordered steps and affected files', () => {
    const plan = parseTaskPlan(validPlan, 'Add the feature');
    expect(plan.status).toBe('draft');
    expect(plan.request).toBe('Add the feature');
    expect(plan.steps.map((step) => step.number)).toEqual([1, 2]);
    expect(plan.steps[1]?.dependsOn).toEqual([1]);
    expect(plan.steps[0]?.affectedFiles).toEqual(['src/main.ts']);
  });

  it('formats plans as readable Markdown with status, progress, and grouped details', () => {
    const plan = parseTaskPlan(validPlan, 'Add the feature');
    const markdown = formatTaskPlanMarkdown(plan);
    expect(markdown).toContain('# Add feature');
    expect(markdown).toContain('**Status:** draft · **Progress:** 0/2 steps');
    expect(markdown).toContain('1. ○ **Inspect**');
    expect(markdown).toContain('- **Files:** `src/main.ts`');
    expect(markdown).toContain('- **Depends on:** steps 1');
    expect(markdown).toContain('## Overall risks');
    plan.steps[0]!.status = 'completed';
    expect(formatTaskPlanMarkdown(plan)).toContain('**Progress:** 1/2 steps');
  });

  it('exports an approved agent handoff document to PLAN.md', () => {
    const plan = parseTaskPlan(validPlan, 'Build the feature using specialist agents');
    const document = formatTaskPlanDocument(plan);
    expect(document).toContain('# Add feature');
    expect(document).toContain('## Goal');
    expect(document).toContain('Build the feature using specialist agents');
    expect(document).toContain('### 1. Inspect');
    expect(document).toContain('Affected files:** `src/main.ts`');
    expect(document).toContain('## Agent handoff');
    expect(document).toContain('have not been executed');

    const root = mkdtempSync(resolve(tmpdir(), 'agent-termo-plan-'));
    try {
      const path = writeTaskPlanFile(root, plan);
      expect(path).toBe(resolve(root, 'PLAN.md'));
      expect(readFileSync(path, 'utf-8')).toBe(document);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects invalid or forward dependencies', () => {
    const invalid = JSON.stringify({
      title: 'Bad plan',
      summary: 'Invalid dependency',
      steps: [
        { title: 'First', description: 'First step', dependsOn: [2] },
        { title: 'Second', description: 'Second step', dependsOn: [] },
      ],
    });
    expect(() => parseTaskPlan(invalid, 'Do work')).toThrow(/incomplete plan/i);
  });

  it('requires approval, respects dependencies, and tracks verified progress', () => {
    const plan = parseTaskPlan(validPlan, 'Add the feature');
    expect(() => updatePlanStep(plan, 1, 'in_progress')).toThrow(/approved plan/i);
    plan.status = 'in_progress';
    expect(() => updatePlanStep(plan, 2, 'in_progress')).toThrow(/Complete step 1/);
    const ordered = parseTaskPlan(validPlan, 'Add the feature');
    ordered.status = 'in_progress';
    ordered.steps[1]!.dependsOn = [];
    expect(() => updatePlanStep(ordered, 2, 'in_progress')).toThrow(/Complete step 1/);
    expect(updatePlanStep(plan, 1, 'in_progress')).toContain('marked in_progress');
    expect(updatePlanStep(plan, 1, 'completed', 'Typecheck passed')).toContain('marked completed');
    expect(updatePlanStep(plan, 2, 'in_progress')).toContain('marked in_progress');
    expect(updatePlanStep(plan, 2, 'completed', 'Tests passed')).toContain('marked completed');
    expect(updatePlanStep(plan, 2, 'completed')).toContain('already complete');
    expect(plan.steps.every((step) => step.status === 'completed')).toBe(true);
  });
});
