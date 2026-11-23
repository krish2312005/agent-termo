# AI Agent Workflow

A small team of specialist agents run by `project-manager`. Who exists and in what order they run is defined in one file: **`.claude/workflow.md`**.

## Run it
- `claude --agent project-manager`, then describe the goal. Or use `/build`, `/feature`, `/fix`, `/deploy`.
- Add an agent with `/new-agent <name> <role>`. Remove one by deleting its file and its row in `workflow.md`.

## Rules for every agent
1. **Start:** read `docs/MEMORY.md` and the last 20 lines of `docs/TIMELINE.md`.
2. **Stay in role.** If something is outside it, tell `project-manager` instead of doing it.
3. **Never run git write commands** (commit, push, merge, branch). Only `git-manager` does.
4. **Never write secrets.** Use env vars; commit only `.env.example`.
5. **Update docs, don't duplicate them.** Each doc has one owner (see `workflow.md`).
6. **Finish by logging.** No log entry = the work is not done.

## Logging (mandatory)

```bash
bash .claude/scripts/log.sh <agent-name> "<short title>" <<'EOF'
Why: <reason for the change>
Changed:
- <path> — <what changed>
Verify: <how to check it works>
Revert: <how to undo it>
EOF
```

This writes `docs/changes/<time>-<agent>-<title>.md` and appends a row to `docs/TIMELINE.md`. The script stamps the real time and branch. Never type timestamps yourself, and never edit past entries.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.