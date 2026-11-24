# multi-agent workspace runtime

- **Agent:** backend-expert
- **When:** 2026-11-23 16:38 PST
- **Branch:** feat/subagent-workspace

Why: Implement the runtime half of the multi-agent workspace contract in docs/architecture.md §21 (D1-D5): stable agent identity/hierarchy, per-agent transcripts, follow-up dispatch with queueing/resume, main-agent state, stop-all, approval routing, and src/main.ts integration.
Changed:
- src/runtime/subagents.ts — added MAIN_AGENT_ID, parentId/usage/queued, resume/usage/queued mutators, clearSubAgentActivity, resumed/usage/queued events; child ids never equal the parent id.
- src/runtime/agent-tree.ts (new) — pure WorkspaceStatus/MainAgentState/AgentTreeNode plus buildAgentTree, moveAgentSelection, parentAgentId, reconcileSelection, visibleAgentRows.
- src/runtime/agent-transcript.ts (new) — per-agent transcript events/entries, 500-entry/256 KiB/8,000-char caps with one truncated marker, pure applyTranscriptEvent, snapshot/subscription store, summarizeToolArgs.
- src/runtime/agent-selection.ts (new) — selected agent id getter/setter/subscription/reset only.
- src/runtime/agent-workspace.ts (new) — decideMessageDisposition (pure), createAgentWorkspace/agentWorkspace, main state + queue, handle registry, sendAgentMessage, stopAllAgents, resetAgentWorkspace.
- src/main.ts — persistent DelegatedAgentSession with follow-up turns on the same client/messages, finally-drain queue, namespaced per-turn tool-call ids, per-agent checkpoint for follow-ups and detached TaskState, transcript recording, quiet sub-agent tool output, approval labels + suspend/resume + shouldAbort, main state/usage/queue drain, /clear reset, scoped follow-up cancellation.
- src/ui/tui.tsx — InputController.submitExternal/suspend/resume, approval-prompt signal (setApprovalPrompt/approvalPrompt).
- src/ui/screen.ts, src/ui/index.ts — re-export setApprovalPrompt/approvalPrompt; requester-labelled promptAcceptReject/promptCommandApproval.
- tests/integration/tool-loop.test.ts — added getUsage() to the fake NimClient stubs (additive contract dependency).
- tests/unit/subagent-view.test.ts — fixture gains required parentId/queued fields; assertions unchanged.
Verify: bun run typecheck exit 0; bun run test 275 passed / 2 skipped (38 files passed, 1 skipped); bun run build clean (dist/cli.js).
Revert: git checkout -- src/main.ts src/runtime/subagents.ts src/ui/tui.tsx src/ui/screen.ts src/ui/index.ts tests/integration/tool-loop.test.ts tests/unit/subagent-view.test.ts && rm src/runtime/agent-tree.ts src/runtime/agent-transcript.ts src/runtime/agent-selection.ts src/runtime/agent-workspace.ts
