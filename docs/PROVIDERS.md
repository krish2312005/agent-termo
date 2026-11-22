# API Providers

Agent-Termo can use NVIDIA NIM and other model APIs. Configure providers inside the running CLI with:

```text
/providers
```

The provider picker lets you select an API, enter its key in a masked input, and choose a model from the provider's live catalogue when available. Provider settings are saved in your user configuration, so you do not need to re-enter the key each time.

## Commands

| Command | Action |
| --- | --- |
| `/providers` | Add or configure a provider |
| `/providers list` | List configured providers and the active provider |
| `/providers use <id>` | Switch to a provider already configured |
| `/model` | Pick a model from the active provider |
| `/model <model-id>` | Switch to a model ID directly |

Use `/providers` first, select a provider, enter its API key, and choose a model. After that, `/model` changes models without changing providers.

## Built-in providers

- NVIDIA NIM
- OpenAI
- Anthropic (native Claude Messages API)
- OpenRouter
- Google AI Studio / Gemini
- DeepSeek
- Groq
- Mistral AI
- xAI
- Together AI
- Fireworks AI
- Cerebras
- Custom OpenAI-compatible endpoint

OpenAI-compatible providers share the OpenAI chat-completions protocol. Anthropic uses its native Messages API and native tool-use format. OpenRouter can expose models from multiple model families through one API key; Claude through OpenRouter is configured as OpenRouter, while direct Anthropic access is configured as Anthropic.

## Custom endpoint

Choose **Custom OpenAI-compatible API** to enter a provider name, API base URL, API key, and model. The base URL should be the API root expected by the provider's OpenAI-compatible chat-completions endpoint (for example, a URL ending in `/v1`).

## Credentials and privacy

Provider API keys are stored in the user-level `~/.agent-termo/config.json` file (or the directory selected by `AGENT_TERMO_DIR`). On supported Unix systems Agent-Termo restricts this file to owner-only permissions (`0600`). Keys are not printed in the provider list or normal status output.

Do not commit API keys to source control. Environment variables take precedence over values loaded from `.env`; the active provider can also be selected explicitly with `AGENT_TERMO_PROVIDER`.

## Environment variables

The built-in environment key names are:

| Provider | Environment variable |
| --- | --- |
| NVIDIA NIM | `NIM_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Google AI Studio | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| xAI | `XAI_API_KEY` |
| Together AI | `TOGETHER_API_KEY` |
| Fireworks AI | `FIREWORKS_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |

For a custom setup, use `AGENT_TERMO_PROVIDER`, `AGENT_TERMO_API_KEY`, `AGENT_TERMO_BASE_URL`, and `AGENT_TERMO_MODEL`.

## Compatibility notes

OpenAI-compatible providers can differ in tool-calling support, streaming behavior, rate limits, model naming, and output-token parameters. A provider may expose models that do not support tool use; Agent-Termo will report the API error and may retry without tools using its existing fallback path. Anthropic direct API uses native tool calls.

The model list depends on the provider's model-list endpoint and the supplied API key's permissions. If model discovery is unavailable, Agent-Termo shows provider suggestions and allows a model ID to be entered manually. Always check the provider's documentation for the model ID and API limits available to your account.
