---
description: Security-check and deploy the project
argument-hint: <target host or notes>
---
Use the `project-manager` agent to run the **deploy** flow in `.agent-termo/workflow.md`. Target: $ARGUMENTS

Production deploys only happen because this command was run. `git-manager` reviews and commits any config changes. Every agent logs its work.