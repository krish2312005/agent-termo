# Agent-Termo Quality-First Workflow

This workflow defines the bundled project lifecycle. Project-specific `TERMO.md` requirements may add constraints but must not weaken the quality gate.

## Agents
| Agent | Responsibility |
|---|---|
| `project-manager` | Coordination, acceptance criteria, and final quality gate. |
| `architect` | Application architecture, contracts, and technical risks. |
| `uiux-designer` | Design tokens, responsive behavior, interaction states, and accessibility. |
| `backend-expert` | Backend, data, API, and business logic. |
| `frontend-expert` | Complete frontend journeys and UI verification. |
| `test-agent` | Regression tests and actual validation commands. |
| `code-reviewer` | Independent evidence-backed code review; no implementation edits. |
| `security-expert` | Security-sensitive audits. |
| `deployment-expert` | Local integration and explicitly requested deployment. |
| `git-manager` | Final repository review and Git writes. |

## Global rules
- Delegate only to exact agent names listed above.
- Include scope, acceptance criteria, constraints, and expected evidence in every delegated task.
- Parallelize only independent tasks with non-overlapping file ownership.
- An agent's success response is not proof. Inspect actual outputs and verification evidence. Resume/reassign failed or budget-exhausted agents.
- Never weaken tests/checks or replace real behavior with stubs to appear complete.
- Do not commit or deploy unfinished work. Production deployment requires explicit user request.

## Build flow
1. `architect`: inspect the stack, define user journeys and acceptance criteria, write `docs/ARCHITECTURE.md` and required environment variable names.
2. `uiux-designer`: for a UI, define tokens, hierarchy, responsive layouts, accessibility, and interaction states in `docs/DESIGN.md`.
3. `backend-expert` and `frontend-expert`: implement separate areas only after specifications and ownership boundaries are clear.
4. Quality gate: run `test-agent` and `code-reviewer` independently after implementation. For UI work, verify responsive behavior and key interactions with existing browser tooling when available.
5. Repair loop: route findings to the owning implementation agent, rerun failed checks, and re-review changed code. Repeat up to three rounds. Failing required checks or critical/high findings block completion.
6. `security-expert`: audit security-sensitive work and resolve critical/high findings before ship.
7. `deployment-expert`: verify local integration; deploy only when explicitly requested.
8. `git-manager`: final diff review and commit only after the quality gate passes.

## Feature flow
1. `architect` updates architecture only when contracts, routes, data, or system behavior change; define acceptance criteria.
2. `uiux-designer` updates design tokens/spec when visible behavior changes.
3. The owning implementation expert(s) make focused changes.
4. Run `test-agent` and `code-reviewer` in parallel. UI changes also need responsive/interactions checks when possible.
5. Repair and rerun until required checks pass or three repair rounds are exhausted. Do not report completion with known blockers.
6. Run `security-expert` for sensitive boundaries; then ask `git-manager` for final review and commit.

## Fix flow
1. Identify owner and expected behavior; use architect only for ambiguity.
2. `test-agent` reproduces the bug and adds a failing regression test when practical.
3. Owning implementation expert fixes the cause with the smallest safe change.
4. `test-agent` reruns regression/relevant suite; `code-reviewer` reviews actual diff.
5. Repair/retest up to three rounds; report blockers honestly.
6. Security review when relevant; final Git review/commit only after checks pass.

## Deploy flow
1. `test-agent` runs available tests, type-check, lint, and build.
2. `code-reviewer` and `security-expert` inspect the current changes; critical/high findings block deployment.
3. `deployment-expert` verifies the app and key local user journey. Deploy only to the explicitly requested target.
4. `git-manager` reviews and commits approved configuration.

## Review flow
1. `code-reviewer` inspects the relevant implementation.
2. `test-agent` verifies reproducible behavior and runs relevant checks.
3. `security-expert` reviews security-sensitive findings.
4. `project-manager` reports evidence, severity, test results, and next steps; do not edit unless fixes were requested.

## Add-agent flow
1. Create `.agent-termo/agents/<name>.md` from the template.
2. Give the agent minimum necessary tools and define scope, boundaries, outputs.
3. Add it to the Agents table and relevant workflow stages.
4. Have `code-reviewer` inspect the new definition and `git-manager` review the final change.
