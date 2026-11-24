# fix workspace UI security findings

- **Agent:** frontend-expert
- **When:** 2026-11-23 18:21 PST
- **Branch:** feat/subagent-workspace

Why: Close the frontend half of the multi-agent workspace security audit on top of the backend detail contract: SEC-01 (content-free sub-agent approvals), SEC-03 (shared terminal-control sanitizer), SEC-04 display remainder (main-name spoofing), SEC-05 (tool-result entry explosion) and SEC-08 (stale per-agent drafts).
Changed:
- src/ui/display-text.ts — new linear, backtracking-safe display sanitizer: OSC/DCS/SOS/PM/APC (7/8-bit), CSI (7/8-bit), remaining ESC sequences, BEL/C0/C1/DEL and CR; newline-preserving and single-line variants.
- src/ui/workspace-view.ts — sanitize row label/activity/goal/task/error/meta, content status, composer prefix/placeholder and every transcript entry; add displayAgentLabel (sub-agent named main, any case, gets #<id6>; duplicate suffixes preserved) and pure formatApprovalPanel(state, width, maxDetailLines) that keeps diff prefixes; cap tool results at first line + 40 continuation lines + one dim "… N more line(s)" entry.
- src/ui/tui.tsx — approval detail panel above the composer visible for every selected agent; rejection notice stays one row; panel rows included in overlayAvailableRows/textarea max-height (80x24 fits with 6 detail lines; <=14 rows compacts status/overflow/hint rows and keeps owner + one detail + composer); cleanAnsi now delegates to the shared sanitizer; notices sanitized; stale drafts for absent ids pruned after selection reconcile (ordinary switching untouched); composer can shrink to one row under approval at the 12-row minimum.
Verify: bun run typecheck exit 0; bun run test exit 0 = 394 passed / 2 skipped (43 files passed / 1 skipped, 44 total); bun run build exit 0 (dist/cli.js). No existing tests changed. Removed /tmp probe covered diff/ESC panel lines, ESC/OSC/CJK/emoji rows/content/composer, 4,000-line result -> 43 UI entries, main spoof suffix, and 996 approval-layout cases for rows 12-30. Live TTY behavior not exercised.
Revert: git checkout -- src/ui/tui.tsx src/ui/workspace-view.ts && rm src/ui/display-text.ts
