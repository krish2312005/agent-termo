# Agent-Termo Default Workflow

This file defines the default specialist workflow used by the bundled slash commands. Project-specific instructions in `TERMO.md` take precedence when they add constraints.

## Agents

| Agent | Responsibility |
|---|---|
| `project-manager` | Owns coordination and delegates each stage. |
| `architect` | Specifies stack, API, data model, auth, and pages. |
| `uiux-designer` | Specifies visual tokens and UI states. |
| `backend-expert` | Implements backend and data-layer work. |
| `frontend-expert` | Implements frontend pages, components, and API integration. |
| `test-agent` | Creates regression tests and verifies changes. |
| `security-expert` | Audits security-sensitive changes and deployment readiness. |
| `deployment-expert` | Verifies local integration and performs explicitly requested deployment work. |
| `git-manager` | Reviews changes and owns Git write operations. |

## Stage rules

- Delegate only to the exact agent names listed above.
- Independent implementation stages may run in parallel after their shared specifications are ready.
- After each stage that changes files, ask `git-manager` to review it before starting the next stage.
- Do not commit a stage with failing checks, unrelated changes, secrets, or unreviewed changes.
- Do not deploy to production unless the user explicitly requested it.
- If a specification is incomplete or contradictory, stop and report the blocker rather than inventing requirements.
- Keep `docs/MEMORY.md` and `docs/TIMELINE.md` current when the project workflow requires them.

## Build flow

1. `architect`: choose the stack and write `docs/ARCHITECTURE.md` plus required environment-variable names in `.env.example`.
2. `uiux-designer`: when the project has a UI, write `docs/DESIGN.md` and establish the theme tokens.
3. `backend-expert` and `frontend-expert`: implement their respective areas from the approved architecture and design. Run these in parallel when the work is independent; skip an area that the project does not need.
4. `test-agent`: write and run relevant unit and integration tests, then document coverage and remaining gaps in `docs/TESTING.md`.
5. `security-expert`: audit security-sensitive functionality and record findings in `docs/SECURITY.md`; critical/high findings must be resolved before deployment.
6. `deployment-expert`: verify the local application end to end after checks pass. Configure and deploy to production only when the user asks.

## Feature flow

1. `architect`: update `docs/ARCHITECTURE.md` only when the feature changes the API, data model, authentication, or pages.
2. `uiux-designer`: update `docs/DESIGN.md` and theme tokens only when the feature changes the UI.
3. `backend-expert` and/or `frontend-expert`: implement only the affected areas from the approved specification.
4. `test-agent`: add regression and feature tests, run relevant checks, and update `docs/TESTING.md` when useful.
5. `security-expert`: audit changes involving authentication, authorization, user data, input handling, or other security-sensitive behavior.
6. `deployment-expert`: run local integration checks after tests pass; production deployment requires an explicit user request.

## Fix flow

1. Identify the owning area. Use `backend-expert` for backend/data issues or `frontend-expert` for frontend issues; use `architect` only when the fix requires a specification decision.
2. `test-agent`: add a regression test that reproduces the bug before the implementation fix.
3. The owning implementation expert fixes the cause with the smallest focused change.
4. `test-agent`: run the regression test and relevant suite; report real pass/fail results.
5. `security-expert`: audit the fix when it touches security-sensitive behavior.

## Deploy flow

1. `test-agent`: run the required test suite and report actual results.
2. `security-expert`: audit the current code and update `docs/SECURITY.md`. Critical/high findings block deployment.
3. `deployment-expert`: verify local setup and an end-to-end user flow. Add CI/deploy configuration and deploy only to the target explicitly requested by the user.
4. `git-manager`: review and commit any approved configuration changes.

## Review flow

1. Select the relevant specialist to inspect the requested area.
2. `test-agent` verifies any proposed fix or regression behavior.
3. `security-expert` reviews security-sensitive findings.
4. `project-manager` summarizes findings, evidence, and recommended next steps. Do not modify files unless the user asked for fixes.

## Add-agent flow

1. Create `.agent-termo/agents/<name>.md` using `.agent-termo/templates/agent.md`.
2. Give the agent only the tools it needs and define its responsibility, boundaries, and output.
3. Add the agent to the Agents table and relevant workflow stages in this file.
4. `git-manager` reviews the workflow and agent definition before commit.
