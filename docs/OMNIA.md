# TERMO OMNIA

TERMO OMNIA is Agent-Termo's outcome-driven execution mode. It wraps the existing main agent, task tools, permission system, checkpoints, and specialist agents with a persistent run record and an evidence report.

## Commands

| Command | Description |
|---|---|
| `/omnia <goal>` | Start an outcome-driven run. |
| `/omnia status` | Show the latest run and its evidence. |
| `/omnia report [run-id]` | Render a report for the latest or specified run. |
| `/omnia resume` | Resume the latest blocked run. |
| `/omnia stop` | Cancel the active run and request cancellation of active work. |

A run is exclusive within the project: start another run only after the active one has completed, become blocked, or been cancelled.

## Execution contract

When a run is active, the main agent receives the goal, explicit acceptance criteria (when the user supplied an `Acceptance criteria:` or `Requirements:` section), and instructions to:

1. Inspect the project and its instructions before editing.
2. Reuse existing Agent-Termo planning, tools, permissions, checkpoints, and specialist agents.
3. Implement the requested behavior.
4. Run real project checks that exist.
5. Report each requirement against actual commands, tests, browser observations, or other evidence.
6. Disclose anything that was not verified.

OMNIA records tool outcomes, command outcomes, browser verification calls, and applied file changes that pass through the main tool loop. Evidence is stored with the run under `.agent-termo/omnia/runs/<run-id>.json`.

## Run status

- `queued`: accepted and awaiting execution.
- `executing`: the existing Agent-Termo main agent is working on the goal.
- `verifying`: the agent execution loop has ended and the result is being settled.
- `completed with warnings`: the execution loop completed, but requirement-level proof is not complete.
- `blocked`: execution paused and can be resumed.
- `cancelled`: the user requested cancellation.
- `failed`: the run could not be started or resumed.

## Verification policy

The current incremental implementation deliberately does **not** infer that a user requirement is satisfied merely because a build, lint, or test command passes. Those checks are recorded as evidence, but product requirements stay unverified until observed evidence is explicitly mapped to them.

This avoids false completion claims. Independent requirement-by-requirement review, browser artifact capture, and richer repair orchestration are subsequent milestones.

## Storage and privacy

Run records are local project data stored in `.agent-termo/omnia/runs/`. Outputs are bounded before persistence. Provider credentials are not copied into OMNIA records. The run store validates IDs and persisted record shape before loading records.
