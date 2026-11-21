// =============================================================================
// Verification System — Structured completion checking with recovery
// =============================================================================

import type {
  VerificationResult,
  VerificationIssue,
  VerificationEvidence,
  ToolCall,
  TaskPlan,
} from './types.js';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

export { VerificationResult, VerificationIssue, VerificationEvidence };

export interface VerificationOptions {
  projectRoot: string;
  taskPlan?: TaskPlan;
  goal: string;
  evidence: VerificationEvidence;
  runChecks: () => Promise<CheckResults>;
}

export interface CheckResults {
  typecheck: { passed: boolean; output: string; errors: string[] };
  lint: { passed: boolean; output: string; errors: string[] };
  test: { passed: boolean; output: string; errors: string[] };
  build: { passed: boolean; output: string; errors: string[] };
}

export class CompletionVerifier {
  private taskPlan?: TaskPlan;
  private goal: string;
  private evidence: VerificationEvidence;
  private runChecks: () => Promise<CheckResults>;
  
  constructor(options: VerificationOptions) {
    this.taskPlan = options.taskPlan;
    this.taskPlan = options.taskPlan;
    this.goal = options.goal;
    this.evidence = options.evidence;
    this.runChecks = options.runChecks;
  }
  
  async verify(): Promise<VerificationResult> {
    const issues: VerificationIssue[] = [];
    
    // 1. Check for stub implementations in written files
    issues.push(...this.checkStubImplementations());
    
    // 2. Check if task plan steps are complete
    if (this.taskPlan) {
      issues.push(...this.checkTaskPlanCompletion());
    }
    
    // 3. Run project checks (typecheck, lint, test, build)
    const checkResults = await this.runChecks();
    issues.push(...this.checkResultsToIssues(checkResults));
    
    // 4. Check if goal-specific requirements are met
    issues.push(...await this.checkGoalRequirements());
    
    const errorIssues = issues.filter(i => i.severity === 'error');
    const ok = errorIssues.length === 0;
    
    return { ok, issues, evidence: this.evidence };
  }
  
  private checkStubImplementations(): VerificationIssue[] {
    const issues: VerificationIssue[] = [];
    
    for (const [path, content] of this.evidence.filesWritten) {
      // Check for common stub patterns
      const stubPatterns = [
        { pattern: /TODO:/gi, message: 'Contains TODO comment' },
        { pattern: /FIXME:/gi, message: 'Contains FIXME comment' },
        { pattern: /^\s*\/\/.*stub/gi, message: 'Contains stub comment' },
        { pattern: /placeholder/gi, message: 'Contains placeholder' },
        { pattern: /not implemented/gi, message: 'Contains "not implemented"' },
        { pattern: /throw new Error\(['"]Not implemented['"]\)/gi, message: 'Throws NotImplementedError' },
        { pattern: /return null;\s*$/gm, message: 'Returns null (possible stub)' },
        { pattern: /return undefined;\s*$/gm, message: 'Returns undefined (possible stub)' },
        { pattern: /\/\/\s*@ts-ignore/gi, message: 'Contains @ts-ignore' },
        { pattern: /\/\/\s*eslint-disable/gi, message: 'Contains eslint-disable' },
      ];
      
      for (const { pattern, message } of stubPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          issues.push({
            type: 'stub_implementation',
            message: `${path}: ${message} (${matches.length} occurrence${matches.length > 1 ? 's' : ''})`,
            file: path,
            severity: 'error',
          });
        }
      }
      
      // Check for empty function bodies that should have implementation
      const emptyFunctionPattern = /function\s+\w+\s*\([^)]*\)\s*{\s*}/g;
      const emptyArrowPattern = /const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*{\s*}/g;
      
      if (emptyFunctionPattern.test(content) || emptyArrowPattern.test(content)) {
        issues.push({
          type: 'stub_implementation',
          message: `${path}: Contains empty function body`,
          file: path,
          severity: 'warning',
        });
      }
    }
    
    return issues;
  }
  
  private checkTaskPlanCompletion(): VerificationIssue[] {
    const issues: VerificationIssue[] = [];
    
    if (!this.taskPlan) return issues;
    
    for (const step of this.taskPlan.steps) {
      if (step.status !== 'completed') {
        issues.push({
          type: 'custom',
          message: `Plan step ${step.id} "${step.title}" is not completed (status: ${step.status})`,
          severity: step.status === 'in_progress' ? 'error' : 'warning',
        });
      }
      
      // Check if affected files were actually modified
      for (const file of step.affectedFiles) {
        if (!this.evidence.filesWritten.has(file) && !this.evidence.commandsRun.some(c => c.includes(file))) {
          issues.push({
            type: 'custom',
            message: `Plan step ${step.id} expected to modify ${file} but no evidence found`,
            file,
            severity: 'warning',
          });
        }
      }
    }
    
    return issues;
  }
  
  private checkResultsToIssues(results: CheckResults): VerificationIssue[] {
    const issues: VerificationIssue[] = [];
    
    const checks = [
      { name: 'typecheck', result: results.typecheck, type: 'type_error' as VerificationIssue['type'] },
      { name: 'lint', result: results.lint, type: 'lint_error' as VerificationIssue['type'] },
      { name: 'test', result: results.test, type: 'missing_test' as VerificationIssue['type'] },
      { name: 'build', result: results.build, type: 'build_failure' as VerificationIssue['type'] },
    ];
    
    for (const { name, result, type } of checks) {
      if (!result.passed) {
        // Extract key errors
        const errorLines = result.errors.slice(0, 5);
        const message = `${name} failed:\n${errorLines.join('\n')}${result.errors.length > 5 ? `\n... and ${result.errors.length - 5} more errors` : ''}`;
        
        issues.push({
          type,
          message,
          severity: 'error',
        });
      } else if (result.errors.length > 0) {
        // Passed but with warnings
        issues.push({
          type,
          message: `${name} passed with warnings: ${result.errors.slice(0, 3).join(', ')}`,
          severity: 'warning',
        });
      }
    }
    
    return issues;
  }
  
  private async checkGoalRequirements(): Promise<VerificationIssue[]> {
    const issues: VerificationIssue[] = [];
    
    // Goal-specific checks could be added here
    // For example, if goal mentions "add tests", check if test files were created
    if (this.goal.toLowerCase().includes('test')) {
      const hasTestFiles = Array.from(this.evidence.filesWritten.keys()).some(f => 
        f.includes('.test.') || f.includes('.spec.') || f.includes('/tests/') || f.includes('/__tests__/')
      );
      if (!hasTestFiles) {
        issues.push({
          type: 'missing_test',
          message: 'Goal mentions tests but no test files were created',
          severity: 'warning',
        });
      }
    }
    
    if (this.goal.toLowerCase().includes('document') || this.goal.toLowerCase().includes('readme')) {
      const hasDocFiles = Array.from(this.evidence.filesWritten.keys()).some(f => 
        f.endsWith('.md') || f.endsWith('.txt') || f.includes('/docs/')
      );
      if (!hasDocFiles) {
        issues.push({
          type: 'custom',
          message: 'Goal mentions documentation but no documentation files were created',
          severity: 'warning',
        });
      }
    }
    
    return issues;
  }
}

// Run project checks (typecheck, lint, test, build)
export async function runProjectChecks(projectRoot: string): Promise<CheckResults> {
  const results: CheckResults = {
    typecheck: { passed: true, output: '', errors: [] },
    lint: { passed: true, output: '', errors: [] },
    test: { passed: true, output: '', errors: [] },
    build: { passed: true, output: '', errors: [] },
  };
  
  // Check for package.json to determine available scripts
  const packageJsonPath = resolve(projectRoot, 'package.json');
  let hasPackageJson = false;
  let scripts: Record<string, string> = {};
  
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      scripts = pkg.scripts ?? {};
      hasPackageJson = true;
    } catch {
      // Ignore parse errors
    }
  }
  
  // Run typecheck if available
  if (hasPackageJson && (scripts.typecheck || scripts['type-check'] || scripts.tsc)) {
    const cmd = scripts.typecheck || scripts['type-check'] || scripts.tsc || 'tsc --noEmit';
    results.typecheck = await runCheck(projectRoot, cmd, 'typecheck');
  } else if (existsSync(resolve(projectRoot, 'tsconfig.json'))) {
    // Try tsc directly
    results.typecheck = await runCheck(projectRoot, 'npx tsc --noEmit', 'typecheck');
  }
  
  // Run lint if available
  if (hasPackageJson && (scripts.lint || scripts['lint:fix'])) {
    const cmd = scripts.lint || scripts['lint:fix'] || 'npx eslint .';
    results.lint = await runCheck(projectRoot, cmd, 'lint');
  } else if (existsSync(resolve(projectRoot, 'eslint.config.js')) || 
             existsSync(resolve(projectRoot, '.eslintrc')) ||
             existsSync(resolve(projectRoot, '.eslintrc.json'))) {
    results.lint = await runCheck(projectRoot, 'npx eslint .', 'lint');
  }
  
  // Run tests if available
  if (hasPackageJson && (scripts.test || scripts['test:run'])) {
    const cmd = scripts.test || scripts['test:run'] || 'npx vitest run';
    results.test = await runCheck(projectRoot, cmd, 'test');
  } else if (existsSync(resolve(projectRoot, 'vitest.config.ts')) ||
             existsSync(resolve(projectRoot, 'jest.config.js'))) {
    results.test = await runCheck(projectRoot, 'npx vitest run', 'test');
  }
  
  // Run build if available
  if (hasPackageJson && (scripts.build || scripts.compile)) {
    const cmd = scripts.build || scripts.compile || 'npm run build';
    results.build = await runCheck(projectRoot, cmd, 'build');
  }
  
  return results;
}

async function runCheck(
  projectRoot: string,
  command: string,
  _name: string
): Promise<{ passed: boolean; output: string; errors: string[] }> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: projectRoot,
      shell: true,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      timeout: 120000,
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });
    
    child.on('close', (code) => {
      const output = stdout + stderr;
      const errors = output
        .split('\n')
        .filter(line => line.trim() && (line.includes('error') || line.includes('Error') || line.includes('FAIL')))
        .slice(0, 20);
      
      resolve({
        passed: code === 0,
        output,
        errors,
      });
    });
    
    child.on('error', (err) => {
      resolve({
        passed: false,
        output: err.message,
        errors: [err.message],
      });
    });
  });
}

// Recovery Action Generator
export interface RecoveryAction {
  type: 'retry_tool' | 'modify_approach' | 'run_checks' | 'read_files' | 'ask_user';
  description: string;
  toolCall?: ToolCall;
  suggestedArgs?: Record<string, unknown>;
  filesToRead?: string[];
}

export function generateRecoveryActions(
  verification: VerificationResult,
  _lastToolCalls: ToolCall[]
): RecoveryAction[] {
  const actions: RecoveryAction[] = [];
  
  for (const issue of verification.issues) {
    if (issue.severity !== 'error') continue;
    
    switch (issue.type) {
      case 'type_error':
        actions.push({
          type: 'run_checks',
          description: 'Run typecheck to see current errors',
          suggestedArgs: { command: 'npx tsc --noEmit' },
        });
        actions.push({
          type: 'read_files',
          description: 'Read files with type errors to understand the issue',
          filesToRead: verification.evidence.filesWritten.size > 0 
            ? Array.from(verification.evidence.filesWritten.keys()).slice(0, 5)
            : [],
        });
        break;
        
      case 'lint_error':
        actions.push({
          type: 'run_checks',
          description: 'Run linter to see current errors',
          suggestedArgs: { command: 'npx eslint .' },
        });
        break;
        
      case 'build_failure':
        actions.push({
          type: 'run_checks',
          description: 'Run build to see current errors',
          suggestedArgs: { command: 'npm run build' },
        });
        break;
        
      case 'missing_test':
        actions.push({
          type: 'modify_approach',
          description: 'Add tests for the implemented functionality',
        });
        actions.push({
          type: 'run_checks',
          description: 'Run tests to verify implementation',
          suggestedArgs: { command: 'npm test' },
        });
        break;
        
      case 'stub_implementation':
        if (issue.file) {
          actions.push({
            type: 'read_files',
            description: `Read ${issue.file} to see the stub implementation`,
            filesToRead: [issue.file],
          });
        }
        actions.push({
          type: 'modify_approach',
          description: 'Replace stub with real implementation',
        });
        break;
        
      case 'custom':
        actions.push({
          type: 'modify_approach',
          description: issue.message,
        });
        break;
    }
  }
  
  // Deduplicate
  const seen = new Set<string>();
  return actions.filter(a => {
    const key = `${a.type}:${a.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}