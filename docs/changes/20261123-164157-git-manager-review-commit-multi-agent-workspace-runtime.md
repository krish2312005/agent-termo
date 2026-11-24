# review+commit multi-agent workspace runtime

- **Agent:** git-manager
- **When:** 2026-11-23 16:41 PST
- **Branch:** feat/subagent-workspace

Why: Stage 3a (backend-expert) of the multi-agent workspace build flow: review and commit the runtime half of the docs/architecture.md §21 contract (D1-D5) on feat/subagent-workspace.
Changed:
- src/runtime/agent-tree.ts (new) — pure WorkspaceStatus/MainAgentState/AgentTreeNode, buildAgentTree, moveAgentSelection, parentAgentId, reconcileSelection, visibleAgentRows; orphans/cycles attach to main; duplicateName only among siblings.
- src/runtime/agent-transcript.ts (new) — per-agent transcript events/entries, 500-entry/256 KiB/8,000-char caps with a single truncated marker, pure applyTranscriptEvent, snapshot/subscribe store, summarizeToolArgs.
- src/runtime/agent-selection.ts (new) — selected agent id/getter/setter/subscription/reset; runtime reads it only to scope follow-up cancellation.
- src/runtime/agent-workspace.ts (new) — decideMessageDisposition (unknown_agent/empty/duplicate/queue_full, no fallback), main state/queue, handle registry, sendAgentMessage, stopAllAgents, resetAgentWorkspace, MAX_QUEUED_MESSAGES_PER_AGENT = 10.
- src/runtime/subagents.ts — MAIN_AGENT_ID, parentId/usage/queued, resumeSubAgent/setSubAgentUsage/setSubAgentQueued/clearSubAgentActivity, resumed/usage/queued events; child id never equals parent id.
- src/main.ts — DelegatedAgentSession with follow-up turns on the same NimClient/messages/agent tool defs/permissions/root, per-turn namespaced tool-call ids, detached follow-up TaskState, per-agent lazily created checkpoint, finally-drain of the session queue, transcript recording, quiet sub-agent prints with requester-labelled approvals via input.suspend/resume + shouldAbort guard, main state/usage updates, main queue drain, stop-all guard, scoped follow-up cancellation, /clear disposes sessions + resets workspace.
- src/ui/tui.tsx — InputController.submitExternal/suspend/resume; approval-prompt signal (setApprovalPrompt/approvalPrompt). No navigator or content-switching UI (next stage).
- src/ui/screen.ts, src/ui/index.ts — re-export setApprovalPrompt/approvalPrompt; optional requester prefix on promptAcceptReject/promptCommandApproval.
- tests/integration/tool-loop.test.ts — fake NimClient stubs gain getUsage() only (5 lines, additive).
- tests/unit/subagent-view.test.ts — fixture gains required parentId/queued fields only; assertions unchanged.
- docs/changes/20261123-162435-git-manager-review-commit-multi-agent-workspace-design-spec.md — previous stage's git-manager log; committed now.
- docs/changes/20261123-163802-backend-expert-multi-agent-workspace-runtime.md — backend-expert log; committed.
- docs/TIMELINE.md — committed only the previous git-manager row and the backend-expert row; the app-generated "Agent-Termo session started"/"Commands" lines remain unstaged.
Verify: commit 5191664 ("feat: add multi-agent workspace runtime and follow-up dispatch", 14 files, 1532 insertions, 142 deletions); `bun run typecheck` exit 0; `bun run test` = 275 passed / 2 skipped (38 files passed, 1 skipped); `bun run build` clean (dist/cli.js); scope diff contains no package.json/env/events.ts/approval-queue changes, no secrets and no build output; no input.close() remains in approval paths; unknown agent ids are rejected, never routed to main.
Revert: `git revert 5191664` before merge; afterwards also restore the four new runtime modules and the two change logs if the revert is partial.
Verdict: approved. Non-blocking notes: (1) main's queue-full cap is only enforced while main is running/waiting; messages queued in the brief idle-with-consumed-question window can exceed 10. (2) A throw from the turn `finally` drain would reject the voided follow-up promise (no observed throw path). (3) No new unit tests for the four new modules in this stage; test-agent coverage is expected next. (4) createAgentWorkspace subscribes to the registry without unsubscribe (test seam only).
