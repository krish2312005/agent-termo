# Agent-Termo Context and Memory

## Context layers

1. **System and project instructions** — built-in Agent-Termo rules, applicable project instruction files, active custom-agent instructions, and the skill catalog.
2. **Durable project memory** — `docs/MEMORY.md`, refreshed whenever the session system prompt is rebuilt. Keep this for stable project facts, architecture, decisions, conventions, and constraints.
3. **Project activity timeline** — `docs/TIMELINE.md`; recent project activity is included as lightweight history.
4. **Session working state** — current task, goal, plan, and the recent tail of `.agent-termo/logs/session.md`.
5. **Recent conversation** — complete recent turns with assistant tool calls and matching tool results. Older turns are represented by bounded summaries and retained in a local archive.

Delegated agents receive project memory and timeline plus a bounded excerpt of the parent's recent transcript, alongside their focused task and explicit context.

## Token budgeting

Before every model request—including requests after tool execution—Agent-Termo estimates the serialized messages, assistant tool-call JSON, tool schemas, and message framing. The estimate is a conservative character-based heuristic, not the model's tokenizer. Provider-reported usage remains the authoritative usage figure.

The fallback context window is 32,768 tokens. The default input budget subtracts up to 8,192 output tokens and 2,048 safety-margin tokens. NVIDIA NIM does not provide a reliable context-window field for every selectable model, so configure the selected model's documented limit when known:

- `AGENT_TERMO_CONTEXT_WINDOW` — total context window in tokens.
- `AGENT_TERMO_OUTPUT_RESERVE_TOKENS` — output tokens reserved for the response.
- `AGENT_TERMO_CONTEXT_SAFETY_MARGIN` — additional input headroom.

The `/context` command displays the preflight estimate and configured budget. The existing `max_tokens: 8192` setting is an output limit, not the input context window.

## Compaction and recovery

Compaction is triggered by estimated input size immediately before each model request; it is not based on a fixed message count. The latest complete conversation turns are retained, including assistant tool-call messages and all matching tool results. Older user, assistant, and tool messages are condensed into a deterministic extractive summary that preserves tool names, arguments, and result excerpts. Repeated compactions carry the prior summary forward.

Full messages removed from the active transcript are appended to `.agent-termo/sessions/<session-id>.archive.jsonl`. Archives are private local files. Oversized tool messages are shortened before the next request, with the original retained in the archive. If the provider explicitly rejects a request because of context length, Agent-Termo compacts more aggressively and retries once.

This compactor does not invoke another model to produce semantic summaries. It keeps context management deterministic and avoids spending additional tokens to summarize.

## Durable memory and session recall

- `/memory` — display `docs/MEMORY.md`.
- `/remember <fact>` — explicitly append a durable project fact.
- `memory:remember(entry)` — tool the agent can use to save a stable project fact or decision.
- `/timeline` — display `docs/TIMELINE.md`.
- `/recall <query>` — search saved session snapshots and full compacted archives, then add matching excerpts to the active conversation as historical context.
- `/history [count]` — inspect the current active transcript.
- `/compact` — manually compact older turns and archive the originals.
- `/clear` — clear the active conversation and task state. It does not delete project memory, session logs, saved sessions, or archives.

Never save credentials, API keys, secrets, private personal information, transient debugging noise, or speculative claims as durable project memory.
