# harden approval label case spoof

- **Agent:** backend-expert
- **When:** 2026-11-23 18:22 PST
- **Branch:** feat/subagent-workspace

Why: approvalRequesterLabel(id, agentName) only disambiguated a sub-agent whose sanitized display name was exactly lowercase `main`; a project agent named `MAIN` or `Main` could appear as `@MAIN` in the approval banner/panel and be mistaken for the real main agent.
Changed:
- src/runtime/subagents.ts — approvalRequesterLabel now compares label.toLowerCase() against MAIN_AGENT_ID, so any case variant of `main` becomes `main#<first 6 id chars>` with the original sanitized casing preserved (e.g. MAIN#abcdef). Empty fallback (`agent`), clipping, and all other behavior unchanged; display-only, routing stays id-based.
Verify: bun run typecheck exit 0; bun run test = 394 passed / 2 skipped (43 files passed, 1 skipped), matches baseline; bun run build = dist/cli.js. Inline probe: ('abcdef123','MAIN') -> MAIN#abcdef, ('abcdef123','Main') -> Main#abcdef, ('abcdef123','main') -> main#abcdef, ('abcdef123','frontend-expert') -> frontend-expert, ('abcdef123','') -> agent, control-only -> agent.
Revert: change the comparison back to label === MAIN_AGENT_ID in src/runtime/subagents.ts.
