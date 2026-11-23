# reject degenerate raw control-token output and add nemotron limit

- **Agent:** backend-expert
- **When:** 2026-11-23 01:51 PST
- **Branch:** local-branch

Why: The model echoed raw chat-template control tokens as plain text and repeated them, so parseToolCallsFromText found no calls and the stream never ended (stuck tool loop). The model was also missing from the limits table, so its context fell back to 32,768.
Changed:
- src/llm/models.ts — added nvidia/nemotron-3.5-super-vl-120b-a12b with contextWindowTokens 262_144 and user-reported source
- src/llm/client.ts — added exported isDegenerateModelOutput guard and non-retryable MalformedModelOutputError; streamComplete aborts and throws on runaway control-token repetition; complete() rejects degenerate assembled content
- tests/unit/malformed-output.test.ts — covers guard (prose, <tool_call> markup, thresholds), non-retryable error, and the new model limit
Verify: bun run typecheck (clean); bun run test (238 passed / 2 skipped, 34 files passed / 1 skipped); bun run build (dist/cli.js)
Revert: revert src/llm/models.ts, src/llm/client.ts, and delete tests/unit/malformed-output.test.ts
