# multi-agent workspace security audit

- **Agent:** security-expert
- **When:** 2026-11-23 18:01 PST
- **Branch:** feat/subagent-workspace

Why: Baseline security audit of the multi-agent workspace branch (feat/subagent-workspace, HEAD d8e4893) before deployment; no docs/SECURITY.md existed.
Changed:
- docs/SECURITY.md — created: scope/threat model, findings table (SEC-01..SEC-14), clean-area list, deployment gate statement, exact verification commands/results, false-positive caveats.
Reported (not fixed, per role):
- SEC-01 High (new): sub-agent file-change approvals show no diff/path because quiet suppresses the diff viewer and transcripts never record the proposed change (src/main.ts:651-652,674; src/ui/index.ts:296-297). Owner: backend-expert + frontend-expert.
- SEC-02 High (pre-existing on master): bash:start is not in isCommandApprovalRequired, so ask mode can run arbitrary background commands without approval (src/runtime/permissions.ts:27-29; src/tools/index.ts:705-722). Owner: backend-expert.
- SEC-03..SEC-14: terminal escape injection on new workspace surfaces (medium), approval label spoofing via agent names (medium), transcript line-expansion UI DoS (medium), unbounded retained sessions/checkpoints (medium), plus low/informational state-integrity and routing-hardening notes.
Verify: bun run typecheck exit 0; bun run test 394 passed / 2 skipped; targeted workspace suites 124 passed; bun audit = 2 moderate, 0 high/critical; secret-pattern scan of git diff master...HEAD = 0 matches; read-only bun probes confirmed ESC passthrough (row-has-ESC true; 4,003 UI entries from one result) and the latent spawnSubAgent("main", non-main parent) id collision.
Revert: delete docs/SECURITY.md and remove this log entry/change file; no product code was modified.
