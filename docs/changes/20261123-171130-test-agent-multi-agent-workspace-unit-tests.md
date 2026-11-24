# multi-agent workspace unit tests

- **Agent:** test-agent
- **When:** 2026-11-23 17:11 PST
- **Branch:** feat/subagent-workspace

Why: Stage 4 of the build flow: automate the docs/architecture.md §21.9 test seams for the multi-agent workspace (tree/selection, per-agent transcripts, dispatch/queue/stop-all, workspace UI helpers) and extend the sub-agent registry coverage, without touching product code.
Changed:
- tests/unit/agent-tree.test.ts — new (19 tests): main-first DFS hierarchy, depth, sibling sort, active child counts, retention, duplicate names, orphan/cycle attach, selection clamping/parent/reconcile, visibleAgentRows window bounds, cancelled->stopped.
- tests/unit/agent-transcript.test.ts — new (21 tests): agent isolation/background snapshots, assistant delta+final replacement, tool pairing with late/mismatched ends ignored, status dedupe, error finalization, 500-entry/256 KiB/8,000-char caps with one truncated marker, subscriptions, tool arg summaries.
- tests/unit/agent-selection.test.ts — new (6 tests): get/set/subscribe/unsubscribe/reset, throwing listener isolation, navigation-only proof (selection never mutates the registry).
- tests/unit/agent-workspace.test.ts — new (26 tests): decideMessageDisposition matrix incl. duplicate queued text and 2,000 ms window boundary and 10-message cap; id-only routing with duplicate names; unknown never falls back; unavailable only without main bindings; submitExternal/FIFO main queue; live queueing and queue-full; stop-all count/cancel-once/queue clear; reset semantics; workspace subscriptions; main-state patches; module wrappers.
- tests/unit/workspace-view.test.ts — new (35 tests): composer routing all branches; reduceWorkspaceKey focus/leader-window/reconcile behavior; formatAgentRow marker/glyphs/connectors/duplicate suffix/drop order/no fabricated metrics/width truncation; formatContentStatus; transcriptToUiEntries mapping/isolation; composer prefix+placeholder.
- tests/unit/subagents.test.ts — +9 cases (5 -> 14); existing assertions unchanged: MAIN_AGENT_ID, parentId default/custom, id never equals parent, resume transitions/events, usage/queued counters and events, clearSubAgentActivity keeps listeners.
- docs/TESTING.md — coverage for the new suites, current baseline, and known gaps (TTY-only workspace scenarios, literal TUI labels, main.ts session FIFO/drain, narrow-terminal row risk).
Verify: bunx vitest run tests/unit/agent-tree.test.ts tests/unit/agent-transcript.test.ts tests/unit/agent-selection.test.ts tests/unit/agent-workspace.test.ts tests/unit/workspace-view.test.ts tests/unit/subagents.test.ts tests/unit/subagent-view.test.ts = 7 files passed, 132 tests passed. bun run test = 391 passed / 2 skipped (43 files passed, 1 skipped; baseline 275/2, 38/1). bun run typecheck exit 0. bun run build exit 0 (dist/cli.js, 266,256 bytes). No product bug found; no failing test left behind.
Revert: rm tests/unit/agent-tree.test.ts tests/unit/agent-transcript.test.ts tests/unit/agent-selection.test.ts tests/unit/agent-workspace.test.ts tests/unit/workspace-view.test.ts && git checkout -- tests/unit/subagents.test.ts docs/TESTING.md
