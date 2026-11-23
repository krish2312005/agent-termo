# review runtime event spec - changes requested

- **Agent:** git-manager
- **When:** 2026-11-23 01:17 PST
- **Branch:** local-branch

Why: Stage 1 review (docs-only architecture spec). Review found the doc asserting implemented runtime/UI code that does not exist in the tree, so the commit was withheld.
Changed:
- (no commit) - review only, verdict: changes requested
Verify: Confirm src/runtime/events.ts is absent and `grep -rn "AgentEventHub\|formatContextMeter" src/` returns no matches; then re-read docs/architecture/target-architecture.md lines 52, 141-143, 150, 310-313, 330-336 which describe it as present.
Revert: n/a (no commit, no staged changes)
Notes: Passes - diff is docs-only, six event types + at:number, 7-cell clamp contract, src/ui/tui.tsx, no src/ui/format.ts, no subscribeAgentStatus, both architect change logs + TIMELINE rows, no secrets/build output. Blocked on status markers claiming implementation (see report). testing-archi/ and todo-app/ correctly left untracked/unstaged.
