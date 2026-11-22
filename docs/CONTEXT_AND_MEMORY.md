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

Agent-Termo uses NVIDIA's published per-model limits for verified NIM model IDs. The default code model, Step-3.7-Flash, has a 262,144-token context window; the `.env.example` model, Llama 3.1 8B, has 131,072 tokens. Llama 3.3 and Kimi K2 Instruct are also documented at 128K, while Qwen2.5-Coder 32B is 32K and GPT-OSS 120B is 128K. Models without a verified entry use a conservative 32,768-token fallback.

The default output reserve is 8,192 tokens and the safety margin is 2,048 tokens. Provider-specific generation limits are applied separately: the input budget retains the configured reserve, while the outgoing `max_tokens` is capped to the selected model's documented generation maximum. This prevents a context reserve from being mistaken for an API-permitted output length.

- `AGENT_TERMO_CONTEXT_WINDOW` — optional total context-window override for custom or unlisted deployments. Leave unset to use the provider model catalogue.
- `AGENT_TERMO_OUTPUT_RESERVE_TOKENS` — output tokens reserved when calculating the input budget (default 8,192).
- `AGENT_TERMO_CONTEXT_SAFETY_MARGIN` — additional input headroom (default 2,048).

NVIDIA's OpenAI-compatible `/v1/models` endpoint supplies the model IDs, not a dependable context-window field; known limits are therefore maintained against NVIDIA's per-model API references in `src/llm/models.ts`. Unknown model IDs retain the conservative fallback rather than inheriting another model's capacity.

The `/context` command displays the estimated input, total context window, output reserve, safety margin, and resulting input budget. Token estimation remains heuristic and is not a provider tokenizer.

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
