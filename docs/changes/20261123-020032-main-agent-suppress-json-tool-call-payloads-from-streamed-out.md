# suppress JSON tool-call payloads from streamed output

- **Agent:** main-agent
- **When:** 2026-11-23 02:00 PST
- **Branch:** local-branch

Why: The stream only suppressed text tool-call JSON when it was the first output; once prose was emitted, JSON tool payloads streamed to the screen (and appeared duplicated), while the calls still executed.
Changed:
- src/llm/client.ts — add ToolCallTextFilter + stripToolCallJson: suppress recognized JSON tool-call blocks (single-line, chunk-split, and pretty-printed multi-line) anywhere in the stream; route streamed and final visible content through it; apply the same cleanup to non-streaming complete().
- tests/unit/tool-json-filter.test.ts — cover prose+JSON, adjacent payloads, chunk-split, pretty-printed, non-tool JSON, and stripToolCallJson.
Verify: bun run typecheck (exit 0); bun run test (248 passed / 2 skipped); bun run build (dist/cli.js).
Revert: git revert <this-commit>
