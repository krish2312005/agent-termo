# Workflow

Single source of truth for which agents exist and the order they run. `project-manager` reads this file on every run.

## Agents

| Agent | Needs | Produces (owner of) |
|---|---|---|
| project-manager | — | plan, `docs/MEMORY.md` |
| architect | — | `docs/ARCHITECTURE.md`, `.env.example` |
| uiux-designer | ARCHITECTURE | `docs/DESIGN.md`, theme/config files |
| backend-expert | ARCHITECTURE | backend code |
| frontend-expert | ARCHITECTURE, DESIGN | frontend code |
| test-agent | code | tests, `docs/TESTING.md` |
| security-expert | code, ARCHITECTURE | `docs/SECURITY.md` |
| deployment-expert | passing tests, no open critical/high security findings | `docs/DEPLOY.md`, CI/deploy config |
| git-manager | — | branches, commits, PRs, review notes |

## Flows

Stages run top to bottom. `+` means run in parallel. **After every stage, `git-manager` reviews and commits it.** Skip stages that don't apply and say why.

### build — new project
1. architect
2. uiux-designer
3. backend-expert + frontend-expert
4. test-agent
5. security-expert
6. deployment-expert (local setup and verification; production only if the user asks)

### feature — add to an existing project
1. architect (only if API, data model or pages change — extend the spec, don't rewrite it)
2. backend-expert + frontend-expert (only the sides affected)
3. test-agent
4. security-expert (only if auth, data or user input is touched)

### fix — bug
1. backend-expert or frontend-expert (whichever owns the bug)
2. test-agent (regression test)

### deploy
1. security-expert
2. deployment-expert

## Add or remove an agent
- **Add:** copy `.claude/templates/agent.md` to `.claude/agents/<name>.md` and fill it in (or run `/new-agent`). Add a row to the table above and put the agent in the flows where it belongs.
- **Remove:** delete `.claude/agents/<name>.md`, its table row, and its mentions in the flows.
- An agent listed here with no file, or a file with no row, is a mistake: `project-manager` stops and reports it.
