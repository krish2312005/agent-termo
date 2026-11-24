# fix workspace approval security findings

- **Agent:** backend-expert
- **When:** 2026-11-23 18:09 PST
- **Branch:** feat/subagent-workspace

Why: Close docs/SECURITY.md findings SEC-01 (High, content-free sub-agent file-change approval), SEC-02 (High, bash:start/bash:stop/browser:verify bypass ask-mode approval), and SEC-04/09/07 (spoofable approval labels, reserved main id, main idle queue cap).
Changed:
- src/main.ts — approval prompts now pass real detail (command first line clipped 200; file change kind/path/+N -M/first 4 diff lines); prompt says "Accept change to <path>?"; ToolReviewOptions.onProposedChange records sub-agent proposal status + activity; sanitized requester label.
- src/ui/tui.tsx — ApprovalPromptState gains detail?: string; setApprovalPrompt(active, label?, detail?).
- src/runtime/permissions.ts — isCommandApprovalRequired covers bash:start, bash:stop, browser:verify; supportsPersistentApproval keeps stop/verify per call; commandApprovalKey shows stop session_id / verify base_url.
- src/runtime/subagents.ts — sanitizeAgentLabel/approvalRequesterLabel (strip C0/C1 + ESC, trim, clip, main -> main#<id6>); spawnSubAgent reserves MAIN_AGENT_ID.
- src/runtime/agent-workspace.ts — main idle/no-pending-question queue path enforces MAX_QUEUED_MESSAGES_PER_AGENT (SEC-07).
Verify: bun run typecheck exit 0; bun run test 394 passed / 2 skipped (43 files passed / 1 skipped); bun run build clean (dist/cli.js). No test files changed.
Revert: git checkout -- src/main.ts src/ui/tui.tsx src/runtime/permissions.ts src/runtime/subagents.ts src/runtime/agent-workspace.ts
