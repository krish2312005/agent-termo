---
description: Add a new agent to the workflow
argument-hint: <agent-name> <what it does>
---
Add a new agent: $ARGUMENTS

1. Copy `.agent-termo/templates/agent.md` to `.agent-termo/agents/<agent-name>.md` and fill it in. Keep it under ~40 lines: role, Do, Don't, Output. Give it only the tools it needs.
2. Add a row to the Agents table in `.claude/workflow.md` (what it needs, what it produces).
3. Add it to the flows where it belongs. If its place isn't obvious, ask the user.
4. Run `git-manager` to review and commit, and log the change.
