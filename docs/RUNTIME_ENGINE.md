# Runtime execution architecture

Agent-Termo keeps the provider transcript and execution history as separate models with distinct responsibilities.

## Session transcript

The existing `.agent-termo/sessions/<session-id>.json` snapshot remains the provider-facing conversation. It stores OpenAI-compatible assistant tool-call messages followed by tool messages, model selection, task state, plan state, and the current conversation. This format is deliberately kept compatible with the existing session restore and fork commands.

## Durable event journal

Every tool-assisted run is also recorded in `.agent-termo/events/<session-id>.jsonl`. The journal is append-only and each record contains a schema version, monotonic session sequence, unique event ID, session ID, run ID, timestamp, event type, and structured data. Lifecycle transitions are flushed to disk before the runtime proceeds past them.

The primary event vocabulary is:

- `run.started`, `run.completed`, `run.paused`, `run.failed`, `run.interrupted`
- `assistant.started`, `assistant.text.delta`, `assistant.completed`
- `tool.called`, `tool.started`, `tool.output.delta`, `tool.completed`, `tool.failed`, `tool.interrupted`

A tool call keeps its provider `callId` from request through completion. Shell stdout/stderr chunks are streamed to the same journal and to the terminal panel while the process runs. Tool completion retains the command, working directory, exit code, duration, stdout, stderr, output, and error. Output is bounded to prevent an unbounded event log from one noisy process. Text/output deltas are appended without forcing an fsync for every token; state transitions are synchronously flushed.

## Recovery contract

On opening a run journal, Agent-Termo projects the event stream into run and tool state. Any prior run still marked `running`, and any tool still `pending` or `running`, is transitioned to `interrupted` with a durable recovery reason. Partial stdout/stderr captured before the interruption is retained and can be reconstructed into the provider transcript. An interrupted action is never silently marked successful. The model must inspect the current filesystem/process state before retrying it.

The final newline is the JSONL record commit boundary. A torn final record is discarded on read; corruption in a complete record or a broken sequence is reported rather than silently ignored.

## Verification and repair

Verification evidence is ordered relative to file changes:

1. A successful check can verify code only until the next accepted file edit.
2. Every accepted file change invalidates earlier check evidence.
3. A failed check is represented as failed evidence with its actual diagnostic; it is not treated as proof that a check ran successfully.
4. A completion-gate failure is written back into the conversation as a structured repair request. The model gets a bounded automatic repair opportunity, and the same run remains open until verification passes or the runtime pauses with the blocker recorded.

This is intentionally a bounded recovery policy, not an infinite retry loop. The existing hard tool-iteration cap still protects the process from runaway tool generation.

## Boundaries

The journal is the durable lifecycle source; `ConversationMessage[]` is the provider protocol projection; `AgentRunJournal` owns run transitions; the CLI renders progress and asks for permission; the tool registry performs actual effects. The filesystem-backed JSONL store adds no database or external service requirement. A future multi-process server can replace the store implementation with a transactional database while retaining the event and projection contracts.
