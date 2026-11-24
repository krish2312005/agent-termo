# security hardening regression tests

- **Agent:** test-agent
- **When:** 2026-11-23 18:31 PST
- **Branch:** feat/subagent-workspace

Why: Prove the SEC-01/02/03/04/05/07/09 fixes on feat/subagent-workspace with deterministic regression tests; the audit's probes (escape injection, unbounded tool-result entry count, idle main queue bypass, reserved-main spawn) had no automated coverage.

Changed:
- tests/unit/display-text.test.ts (new) — 11 cases: 7/8-bit CSI/OSC/DCS/SOS/PM/APC, other two-char ESC + lone ESC, BEL/C0/C1/DEL/CR, ASCII/CJK/emoji/punctuation preservation, newline opt-in, unterminated control strings, 8k linear input; sanitizeDisplayLine flattening.
- tests/unit/permissions.test.ts (new) — approval gating for mcp_*/bash:execute/bash:start/bash:stop/browser:verify/git:commit/git:push vs read-only tools; supportsPersistentApproval exclusions; exact commandApprovalKey values for bash commands, bash:stop session ids, browser:verify base URLs, git messages and MCP JSON.
- tests/unit/subagents.test.ts — sanitizeAgentLabel escape/control stripping, trim/clip, empty fallback; approvalRequesterLabel #id6 for main/MAIN/Main and normal-name preservation; spawnSubAgent never returns the reserved main id under a non-main parent (main-2, main-3).
- tests/unit/workspace-view.test.ts — formatApprovalPanel owner/fallback label, max 6 real detail lines, preserved +/-/space diff prefixes, width clipping, no fabricated lines; sanitized row/content-status/composer formatting with CJK/emoji preserved and width invariant re-checked; main-spoof #id6 in rows/status/composer; 4,000-line tool result capped at first line + 40 continuations + one overflow marker with ok/error state and agent isolation.
- tests/unit/agent-workspace.test.ts — idle main with no pending REPL question accepts 10 queued messages, rejects the 11th with queue_full, keeps length 10, drains in FIFO and accepts again.
- docs/TESTING.md — new security coverage section plus manual-only limits (real-TTY escape rendering, approval panel painting/keys, SEC-01 prompt integration) and the 8-bit CSI body limitation of sanitizeAgentLabel.

Verify: targeted 5 files = 130 passed; bun run test = 446 passed / 2 skipped (45 files passed, 1 skipped; baseline 394/2); bun run typecheck exit 0; bun run build exit 0 (dist/cli.js 271,741 bytes). Existing assertions were not weakened or changed.

Revert: delete tests/unit/display-text.test.ts and tests/unit/permissions.test.ts; revert the appended describe blocks in tests/unit/subagents.test.ts, tests/unit/workspace-view.test.ts and tests/unit/agent-workspace.test.ts; restore docs/TESTING.md.
