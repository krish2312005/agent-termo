# AGENT TERMO — PRINCIPAL ARCHITECTURE AUDIT, COMPARISON & PRODUCTION-GRADE REENGINEERING

You are acting as the **Principal Software Architect, Staff Systems Engineer, and Lead Runtime Engineer** responsible for transforming Agent Termo into a production-grade AI coding agent.

Your task is to deeply analyze the architecture of Agent Termo, compare it against the actual implementations of OpenCode and OpenAI Codex, identify architectural weaknesses and root causes, and implement the necessary improvements.

This is not a superficial refactoring task.

The objective is to build an agent runtime that follows the same level of architectural discipline, reliability, modularity, extensibility, execution safety, and maintainability demonstrated by mature coding agents such as OpenCode and Codex.

You must investigate the actual source code, understand how the systems work internally, identify what makes their architectures reliable, and implement the most valuable architectural principles in Agent Termo.

**Do not simply produce a report. You must implement the improvements in the existing repository and verify them.**

---

# 1. PROJECT INFORMATION

Project: Agent Termo

Repository:
https://github.com/krish2312005/agent-termo

Primary architectural references:

**OpenCode**
https://github.com/anomalyco/opencode

**OpenAI Codex**
https://github.com/openai/codex

Official Codex architecture references:

https://openai.com/index/unrolling-the-codex-agent-loop/

https://openai.com/index/unlocking-the-codex-harness/

OpenCode documentation:

https://opencode.ai/docs/

Use the actual latest available source code and architecture documentation from these projects. Do not base your analysis on outdated articles, assumptions, third-party summaries, or old implementations.

First identify the exact source versions, branches, and commit SHAs being examined.

If necessary, clone the reference repositories into temporary directories outside Agent Termo. Never copy their entire implementations into this project.

Study their architecture, execution model, and engineering decisions. Learn from their design rather than blindly replicating it.

---

# 2. PRIMARY OBJECTIVE

Transform Agent Termo into a modular, reliable, extensible, provider-independent coding-agent architecture.

The resulting architecture should have:

- A well-defined agent execution lifecycle.
- A reliable and deterministic agent loop.
- A robust model-provider abstraction.
- A provider-independent tool execution system.
- Correct streaming and tool-call processing.
- Reliable session and conversation management.
- Persistent and recoverable execution state.
- Proper terminal and subprocess lifecycle management.
- Strong permission and execution boundaries.
- Predictable cancellation and interruption.
- Efficient context management and compaction.
- Reliable token accounting and observability.
- A modular extension and plugin architecture.
- Strong error handling and recovery.
- Comprehensive automated testing.
- Clear architectural boundaries and contracts.
- A terminal interface that consumes runtime events instead of directly implementing agent logic.

The target is not to make Agent Termo look like OpenCode or Codex.

The target is to make its underlying engineering architecture comparable in quality.

Do not introduce unnecessary complexity just to make the architecture look enterprise-grade.

---

# 3. NON-NEGOTIABLE ENGINEERING RULES

Before changing anything, understand the existing project.

Follow these rules throughout the entire task.

### 3.1 Preserve existing functionality

Do not unnecessarily remove, replace, or break existing functionality.

Preserve:

- Existing provider support.
- Existing model configuration.
- Existing tool integrations.
- Existing terminal interface.
- Existing command execution features.
- Existing conversation functionality.
- Existing configuration formats.
- Existing authentication and API-key handling.
- Existing user-facing workflows.

Identify existing functionality before modifying it.

### 3.2 No unnecessary rewrites

Do not rewrite the entire codebase just because you discovered a better architecture.

Prefer controlled architectural improvements with clearly defined boundaries.

Retain the current language, runtime, package manager, and build system unless a change is genuinely necessary and supported by technical evidence.

Do not introduce unnecessary frameworks, dependencies, databases, message brokers, or abstraction layers.

### 3.3 Protect the Git repository

Before making changes:

- Inspect the current branch.
- Inspect the working tree.
- Inspect existing uncommitted modifications.
- Identify the current HEAD commit.
- Inspect the repository remotes.

Stay on the current branch.

Do not discard existing user modifications.

Do not reset, force-checkout, rebase, merge, commit, or push unless explicitly requested.

### 3.4 Evidence before implementation

Never assume that a feature is broken merely because it appears in this task.

Reproduce existing issues where possible.

For each architectural problem, identify:

1. The observed behavior.
2. The root cause.
3. The responsible module.
4. The architectural weakness.
5. The proposed solution.
6. The test required to prevent regression.

Do not hide problems behind retries, arbitrary delays, broad exception handling, or hardcoded special cases.

### 3.5 Implementation is mandatory

Do not stop after producing an architecture report.

After the audit and architectural design, proceed with implementation.

Do not mark incomplete work as completed.

---

# 4. PHASE ONE — DEEP ARCHITECTURAL RESEARCH

Before modifying Agent Termo, investigate OpenCode and Codex.

You must inspect their actual source code.

Do not only read their README files.

## 4.1 OpenCode architecture investigation

Repository:

https://github.com/anomalyco/opencode

Investigate the current implementation of:

1. Application entry points.
2. Runtime initialization.
3. Session management.
4. Agent execution loop.
5. Model-provider integration.
6. Streaming response processing.
7. Tool registry.
8. Tool execution lifecycle.
9. Permission management.
10. Configuration management.
11. Context management.
12. Context compaction.
13. MCP integration.
14. Skills and extensions.
15. Plugin architecture.
16. Subagent execution.
17. Event system.
18. Persistence and recovery.
19. Error handling.
20. Terminal interface integration.
21. Testing architecture.

Pay particular attention to how responsibility is separated between runtime, application, shared infrastructure, and user-facing interfaces.

Inspect relevant implementation files in the current repository, including architecture specifications where applicable.

Understand how a user request travels through the system:

User Input → Session → Prompt Construction → Model Invocation → Tool Processing → Permission Checks → Execution → Result Processing → Next Model Iteration → Final Response.

Identify which architectural decisions make this flow maintainable and reliable.

## 4.2 Codex architecture investigation

Repository:

https://github.com/openai/codex

Investigate:

1. Codex core.
2. Agent loop.
3. Model inference.
4. Prompt construction.
5. Conversation and thread lifecycle.
6. Turn execution.
7. Tool invocation and tool results.
8. Approval workflows.
9. Sandbox and execution boundaries.
10. Shell execution.
11. Process management.
12. Context management.
13. Token accounting.
14. Event streaming.
15. Session persistence.
16. Configuration management.
17. Application Server.
18. Client-server communication.
19. Recovery and interruption.
20. Testing architecture.

Pay special attention to:

- Separation between the agent harness and user interface.
- Durable conversation/thread management.
- Distinction between threads, turns, and execution items.
- Event-driven execution updates.
- Structured tool execution.
- Human approval requests.
- Cancellation and interruption.
- Application Server protocol.
- Reusability of the same execution engine across multiple clients.

Understand how the Codex architecture separates the underlying agent runtime from the CLI, IDE, and other interfaces.

Do not confuse Codex CLI internals with its application-server or hosted-platform architecture. Identify which design principles apply to a local CLI coding agent.

## 4.3 Create a source-backed comparison

Create a detailed comparison between OpenCode, Codex, and Agent Termo.

Compare these dimensions:

| Dimension | OpenCode | Codex | Agent Termo |
|---|---|---|---|
| Overall architecture | Investigate | Investigate | Investigate |
| Runtime initialization | Investigate | Investigate | Investigate |
| Agent loop | Investigate | Investigate | Investigate |
| Provider abstraction | Investigate | Investigate | Investigate |
| Streaming architecture | Investigate | Investigate | Investigate |
| Tool execution | Investigate | Investigate | Investigate |
| Tool calling reliability | Investigate | Investigate | Investigate |
| Session management | Investigate | Investigate | Investigate |
| Context management | Investigate | Investigate | Investigate |
| Persistence | Investigate | Investigate | Investigate |
| Process management | Investigate | Investigate | Investigate |
| Permissions and security | Investigate | Investigate | Investigate |
| Cancellation | Investigate | Investigate | Investigate |
| Error recovery | Investigate | Investigate | Investigate |
| Event system | Investigate | Investigate | Investigate |
| Plugin architecture | Investigate | Investigate | Investigate |
| MCP integration | Investigate | Investigate | Investigate |
| Observability | Investigate | Investigate | Investigate |
| Testing | Investigate | Investigate | Investigate |
| Extensibility | Investigate | Investigate | Investigate |

Do not fill this table with generic descriptions.

Every important finding must be supported by actual source-code locations, implementation references, or official documentation.

Record the reference commit SHAs so the comparison is reproducible.

---

# 5. PHASE TWO — COMPLETE AGENT TERMO ARCHITECTURE AUDIT

Now investigate the entire Agent Termo codebase.

Understand the system before changing it.

Inspect:

- Repository structure.
- Package configuration.
- Runtime entry points.
- CLI initialization.
- Model-provider implementations.
- Agent orchestration.
- Tool definitions.
- Tool execution.
- Streaming implementation.
- Terminal handling.
- Conversation management.
- Persistence.
- Configuration.
- Context and token management.
- Extension systems.
- Error handling.
- Existing tests.
- Build and packaging infrastructure.

Trace the actual execution path of a typical request.

For example:

User Input
→ CLI
→ Runtime
→ Conversation Manager
→ Context Builder
→ Provider Adapter
→ Model Response
→ Response Normalizer
→ Tool Dispatcher
→ Permission Evaluation
→ Tool Execution
→ Tool Result
→ Model Continuation
→ Final Response
→ Session Persistence.

Determine whether this is actually how Agent Termo currently operates.

Identify all points where responsibilities are mixed, duplicated, tightly coupled, or incorrectly owned.

## 5.1 Identify architectural anti-patterns

Search for:

- God objects.
- Circular dependencies.
- Excessive global state.
- Hidden shared mutable state.
- Duplicate provider-specific logic.
- Inconsistent tool interfaces.
- Runtime logic inside UI components.
- UI assumptions inside execution modules.
- Incorrect error propagation.
- Uncontrolled asynchronous execution.
- Missing cancellation propagation.
- Unhandled process failures.
- Inconsistent event formats.
- Fragile string-based dispatch.
- Duplicate session state.
- Unnecessary abstractions.
- Unbounded execution loops.
- Uncontrolled retries.
- Missing resource cleanup.
- Incorrect concurrency behavior.
- Silent failure handling.
- Missing schema validation.
- Unsafe filesystem operations.
- Inadequate permission enforcement.

## 5.2 Produce a root-cause report

For every significant issue, document:

- Issue ID.
- Severity: Critical, High, Medium, or Low.
- Affected files.
- Existing implementation.
- Root cause.
- Why the current architecture permits the problem.
- How OpenCode or Codex handles the corresponding responsibility, where applicable.
- Proposed architectural improvement.
- Regression test.

Prioritize actual reliability and security problems over cosmetic refactoring.

---

# 6. PHASE THREE — DESIGN THE TARGET ARCHITECTURE

Based on your research, design the architecture Agent Termo should actually implement.

Do not copy OpenCode or Codex module names blindly.

Design around Agent Termo's existing technologies and requirements.

The architecture should establish clear boundaries between the following responsibilities.

## 6.1 CLI / Presentation Layer

The CLI must be responsible for:

- Rendering the interface.
- Accepting user input.
- Displaying execution events.
- Displaying streaming output.
- Displaying tool execution.
- Displaying permission requests.
- Displaying errors.
- Showing token usage.
- Handling keyboard interaction.

It must not own the actual agent execution loop.

The CLI should consume events and issue commands to the runtime.

The same runtime should eventually be reusable by alternative interfaces without duplicating agent logic.

## 6.2 Application / Runtime Layer

Establish a clearly defined runtime responsible for:

- Application initialization.
- Dependency composition.
- Service lifecycle.
- Session coordination.
- Execution ownership.
- Cancellation propagation.
- Resource cleanup.
- Shutdown behavior.

The runtime must not become another God object.

Separate orchestration from implementation details.

## 6.3 Agent Orchestration Layer

Create a reliable agent execution engine.

It must own:

- User-turn initialization.
- Prompt construction coordination.
- Model invocation.
- Streaming response consumption.
- Tool-call detection.
- Tool dispatch.
- Tool-result handling.
- Continuation decisions.
- Termination conditions.
- Error propagation.
- Cancellation.
- Execution limits.

Define an explicit execution state machine.

Possible states include:

- Idle.
- Initializing.
- WaitingForModel.
- StreamingResponse.
- ExecutingTool.
- AwaitingApproval.
- Continuing.
- Completed.
- Cancelled.
- Failed.

Use only the states that are genuinely required.

Define valid transitions and reject invalid transitions.

Prevent multiple prompts from accidentally interleaving within one session.

Make sure the loop cannot silently terminate while tool calls remain outstanding.

## 6.4 Model Provider Architecture

Create a clean provider-independent model interface.

Separate:

- Provider configuration.
- Authentication.
- Model metadata.
- Request construction.
- Streaming transport.
- Response normalization.
- Tool-call normalization.
- Token usage.
- Error translation.

The agent runtime must not contain scattered provider-specific conditionals.

Introduce provider adapters only where they provide real isolation.

Preserve existing model and provider support.

Support different model APIs without assuming they all implement identical tool-calling behavior.

Provider-specific protocol differences must be normalized at the adapter boundary.

---

# 7. PHASE FOUR — REBUILD THE TOOL-CALLING ARCHITECTURE

This is a critical subsystem.

Tool calling must work reliably across different model providers, including OpenAI-compatible endpoints and Anthropic-compatible APIs.

Do not make it work only for one particular model.

## 7.1 Tool registry

Implement a centralized and validated tool registry.

Each tool should have:

- Stable identifier.
- Name.
- Description.
- Input schema.
- Execution handler.
- Permission requirements.
- Result format.
- Error behavior.

Validate tool definitions at registration time.

Reject duplicate or malformed registrations.

## 7.2 Provider-independent tool-call normalization

All provider responses must be normalized into a common internal representation.

The runtime should not depend directly on a provider's raw JSON tool-call format.

Handle:

- Complete tool calls.
- Multiple tool calls in one response.
- Partial streaming tool-call fragments.
- Fragmented JSON arguments.
- Tool-call IDs.
- Missing identifiers.
- Malformed arguments.
- Unknown tool names.
- Invalid tool schemas.
- Empty arguments.
- Tool execution errors.
- Tool results.
- Model continuation after execution.

Do not execute incomplete streaming tool calls.

Do not execute a tool until its arguments have been completely assembled and validated.

Preserve call IDs and correctly associate every result with its originating request.

Never silently discard a tool call.

## 7.3 Execution lifecycle

Every tool invocation should have a predictable lifecycle:

Registration
→ Model Request
→ Tool Call Received
→ Normalization
→ Validation
→ Permission Check
→ Execution
→ Result Normalization
→ Result Persistence
→ Model Continuation.

Tool execution must be controlled by the runtime, not independently implemented by individual providers.

## 7.4 Failure handling

Implement proper handling for:

- Invalid tool arguments.
- Unknown tools.
- Permission denial.
- Tool timeout.
- Tool crash.
- Provider errors.
- Malformed model responses.
- Interrupted execution.
- Duplicate calls.
- Missing tool results.

Retries must be bounded and applied only to appropriate retryable failures.

Do not automatically retry non-idempotent operations without a safe deduplication strategy.

A failed tool must not corrupt the conversation history or permanently break the agent loop.

## 7.5 Tool execution isolation

Tool execution must have well-defined:

- Execution context.
- Working directory.
- Environment variables.
- Cancellation signal.
- Timeout.
- Permission policy.
- Output limits.
- Result format.

Tools should not be able to bypass the central execution and permission policies.

---

# 8. PHASE FIVE — TERMINAL AND PROCESS RUNTIME

Treat terminal execution as a critical runtime subsystem.

Investigate the existing implementation deeply.

It must reliably manage the lifecycle of every process started by Agent Termo.

Implement or repair:

- Process creation.
- Process ownership.
- Process tracking.
- Standard output streaming.
- Standard error streaming.
- Exit-code handling.
- Signal propagation.
- Timeout handling.
- Cancellation.
- Child-process cleanup.
- Process-tree cleanup.
- Shutdown behavior.
- Resource disposal.

## 8.1 Terminal lifecycle

When Agent Termo starts a command, the runtime must retain control over the process.

When the user interrupts execution:

- Stop the active command.
- Propagate cancellation appropriately.
- Terminate relevant child processes.
- Release resources.
- Prevent orphaned processes.
- Return the agent to a consistent state.

Ensure Ctrl+C behaves correctly across operating systems and terminal environments.

Do not confuse interrupting the active process with copying selected terminal text.

Support Windows and Unix-like operating systems according to the project's actual supported platform matrix.

## 8.2 Terminal output

The user must be able to see the complete command being executed.

Do not truncate or silently hide important command information.

Output must stream correctly without blocking the agent loop.

Handle large output, partial chunks, backpressure, and long-running commands.

Do not buffer unlimited terminal output in memory.

## 8.3 Terminal interaction

Preserve and verify:

- Text selection.
- Copying selected terminal text.
- Keyboard shortcuts.
- Interactive command execution.
- Terminal rendering.
- Scroll behavior.
- Active-command indication.

Copying selected text must not accidentally kill a running process.

---

# 9. PHASE SIX — SESSION, THREAD AND CONVERSATION ARCHITECTURE

Build a reliable conversation lifecycle.

A session must have explicit ownership and predictable state transitions.

Investigate the best applicable principles from OpenCode and Codex.

Consider the separation between:

- Session / Thread.
- Turn.
- Message.
- Tool call.
- Tool result.
- Execution event.

Do not introduce separate entities unless they solve an actual state-management problem.

Support:

- Creating sessions.
- Resuming sessions.
- Listing sessions.
- Persisting conversation history.
- Recovering interrupted sessions.
- Handling incomplete turns.
- Handling tool execution history.
- Maintaining message order.
- Safe session switching.
- Session isolation.
- Consistent IDs.

Prevent concurrent turns from corrupting a session.

Persist important state at predictable points.

Make recovery possible after unexpected application termination.

Where persistence is used, introduce appropriate schema validation and migration handling.

Do not silently discard incompatible historical sessions.

---

# 10. PHASE SEVEN — CONTEXT MANAGEMENT AND TOKEN ACCOUNTING

Implement a dedicated context-management subsystem.

Responsibilities:

- Model context-window information.
- Token budget calculation.
- System instruction management.
- Conversation history selection.
- Tool-result inclusion.
- Context truncation.
- Context compaction.
- Compaction safety.
- Prompt construction.
- Token usage tracking.

Context handling must be provider/model aware.

Do not use one hardcoded context window for every model.

Protect important conversation information during compaction.

Avoid unnecessary repeated context.

Make compaction deterministic and testable.

## Token accounting

Implement accurate token usage reporting using provider-reported usage whenever available.

Support:

- Input tokens.
- Output tokens.
- Cached tokens where available.
- Total tokens.
- Per-turn usage.
- Session-level usage.
- Model information.
- Usage availability and estimation status.

Never represent estimated token usage as exact provider-reported usage.

Ensure live updates reach the CLI through the runtime event system.

---

# 11. PHASE EIGHT — EVENT-DRIVEN ARCHITECTURE

Establish a consistent, typed event system between the runtime and presentation layer.

The runtime should publish events for:

- Session created.
- Turn started.
- Turn completed.
- Turn failed.
- Turn cancelled.
- Assistant response started.
- Assistant response delta.
- Assistant response completed.
- Tool call received.
- Tool execution started.
- Tool execution output.
- Tool execution completed.
- Permission requested.
- Permission resolved.
- Token usage updated.
- Context compacted.
- Runtime error.
- Process exited.

Define a common event envelope with identifiers, timestamps, and relevant session/turn context.

Use a consistent naming convention and type-safe payloads.

Ensure events cannot be emitted in invalid lifecycle states.

Avoid duplicate events and uncontrolled subscriptions.

Prevent listeners from leaking after sessions or runtime instances are closed.

Ensure important events are not silently lost.

The UI must not have to guess what the agent is doing.

It should be able to reconstruct the execution timeline from reliable runtime events and persisted state where required.

## Future client architecture

The runtime should have a clear interface that could support:

- Current terminal UI.
- Future desktop UI.
- Future IDE integration.
- External clients.

Do not build additional clients now unless required.

First establish the runtime boundary.

---

# 12. PHASE NINE — SECURITY AND PERMISSION ARCHITECTURE

Treat safety as part of architecture, not an afterthought.

Investigate and implement appropriate protections for:

### Tool permissions

- Tool-specific permissions.
- Command execution permissions.
- Filesystem permissions.
- Network permissions where applicable.
- User approval.
- Permission denial.
- Approval timeout.
- Permission persistence, only where appropriate.

### Filesystem safety

- Path traversal.
- Working-directory boundaries.
- Symlink handling.
- Unexpected file deletion.
- Unsafe writes.
- Atomic file operations where required.

### Shell safety

- Command execution boundaries.
- Shell injection risks.
- Environment-variable exposure.
- Credential leakage.
- Uncontrolled subprocesses.
- Permission bypass.

### Configuration and credentials

- API-key handling.
- Secret redaction.
- Secure configuration loading.
- Error-message redaction.
- Safe logging.

Use a centralized permission mechanism.

Individual tools must not implement incompatible security rules.

Do not claim that an unrestricted local shell is sandboxed merely because it is behind a permission prompt.

Clearly distinguish approval controls from actual operating-system isolation.

---

# 13. PHASE TEN — PLUGINS, MCP AND EXTENSIBILITY

Investigate how OpenCode handles integrations and how Codex handles tool extensions.

Design a clean extension boundary for Agent Termo.

Consider:

- Tools.
- MCP servers.
- Plugins.
- Skills.
- Provider adapters.
- Runtime hooks.

Each integration should have a clear registration and lifecycle contract.

Avoid tightly coupling external integrations to the agent loop.

Define:

- Initialization.
- Validation.
- Registration.
- Execution.
- Error handling.
- Shutdown.
- Resource disposal.

An extension failure must not unintentionally crash the entire runtime.

Preserve existing integrations.

Do not add an extension ecosystem simply for architectural appearance. Establish the foundation needed to extend the system reliably.

---

# 14. PHASE ELEVEN — ERROR HANDLING AND RESILIENCE

Create a consistent error-handling architecture.

Distinguish between:

- Provider errors.
- Authentication errors.
- Rate limits.
- Temporary network failures.
- Invalid model requests.
- Tool validation errors.
- Tool execution failures.
- Permission errors.
- Filesystem errors.
- Process errors.
- Persistence errors.
- Runtime failures.
- User cancellation.

Errors should have:

- Stable internal classification.
- Useful messages.
- Optional recovery guidance.
- Original causal information.
- Appropriate retryability.
- Consistent event reporting.

Do not swallow exceptions.

Do not convert every failure into a generic error string.

Do not retry indefinitely.

Ensure one tool failure cannot unexpectedly corrupt unrelated sessions.

Implement recovery behavior only where it is safe.

---

# 15. PHASE TWELVE — CONFIGURATION AND PROVIDER RELIABILITY

Review the configuration architecture.

Ensure that:

- Configuration has a defined schema.
- Invalid configuration produces useful errors.
- Defaults are centralized.
- Configuration precedence is predictable.
- Environment overrides are well-defined.
- Secrets are not exposed.
- Provider settings are validated.
- Model limits are handled correctly.
- Existing configuration files remain compatible where possible.

Inspect provider-specific streaming behavior and compatibility.

Verify the system handles:

- API timeouts.
- HTTP 401.
- HTTP 403.
- HTTP 404.
- HTTP 429.
- HTTP 500.
- HTTP 502.
- HTTP 503.
- Empty responses.
- Invalid responses.
- Interrupted streams.
- Malformed tool calls.
- Missing usage information.

Never assume that an HTTP success response means the model produced a valid response.

---

# 16. PHASE THIRTEEN — TESTING ARCHITECTURE

Create a testing strategy comparable in discipline to mature production software.

Do not rely only on a few happy-path unit tests.

## Unit tests

Test:

- Agent state machine.
- Provider normalization.
- Tool registry.
- Tool argument validation.
- Tool result processing.
- Context management.
- Token accounting.
- Permission policies.
- Error classification.
- Event generation.
- Configuration validation.

## Integration tests

Test:

- User input to final response.
- Multiple model iterations.
- Multiple tool calls.
- Tool call followed by another tool call.
- Model continuation after tool execution.
- Tool errors.
- Provider errors.
- Session persistence.
- Session recovery.
- Cancellation.
- Runtime shutdown.
- Event delivery.

## Tool-calling tests

Use deterministic mock providers.

Test:

1. Single tool call.
2. Multiple tool calls.
3. Fragmented tool-call streaming.
4. Partial JSON arguments.
5. Malformed JSON.
6. Unknown tools.
7. Invalid arguments.
8. Missing tool-call IDs.
9. Duplicate tool calls.
10. Tool failure and recovery.
11. Permission denial.
12. Cancellation during execution.
13. Provider-specific response differences.

## Terminal tests

Test:

1. Basic command execution.
2. Large command output.
3. Streaming output.
4. Nonzero exit codes.
5. Long-running processes.
6. Ctrl+C interruption.
7. Child-process termination.
8. Process cleanup.
9. Runtime shutdown with active processes.
10. Repeated command execution.
11. No orphaned processes after cancellation.
12. Platform-specific behavior.

## Stress tests

Test:

- Long conversations.
- Large tool outputs.
- Multiple sessions.
- Repeated cancellation.
- Rapid user input.
- Multiple tool calls per turn.
- Repeated provider failures.
- Context compaction.
- Long-running commands.
- Runtime shutdown during active execution.

Tests should verify actual behavior, not merely mock the function being tested.

Never weaken assertions or skip failing tests merely to achieve a passing test suite.

---

# 17. PHASE FOURTEEN — IMPLEMENTATION STRATEGY

After completing the architecture investigation, implement improvements incrementally.

Do not attempt a giant uncontrolled rewrite.

Prioritize changes based on:

1. Correctness.
2. Security.
3. Runtime stability.
4. Tool-calling reliability.
5. Process lifecycle.
6. Session integrity.
7. Provider compatibility.
8. Context management.
9. Event architecture.
10. Extensibility.
11. Observability.
12. Maintainability.

For each architectural change:

1. Identify the current implementation.
2. Explain the root problem.
3. Define the intended responsibility boundary.
4. Implement the smallest correct change.
5. Add regression tests.
6. Run the relevant tests.
7. Check for regressions.
8. Document the resulting design.

Make changes in small, understandable increments.

Avoid changing unrelated functionality.

Do not leave half-implemented abstractions or dead compatibility layers.

Remove only redundant code made unnecessary by the changes.

Do not create interfaces without actual consumers.

Do not introduce multiple competing implementations of the same responsibility.

---

# 18. KNOWN AGENT TERMO REGRESSION AREAS TO AUDIT

The following are previously encountered issues. They must be explicitly investigated and regression-tested where applicable. Do not assume they are still present.

### A. Terminal process lifecycle

Previously, terminating the terminal interface did not always terminate the underlying process.

Investigate process ownership, cancellation propagation, signal handling, child-process cleanup, and runtime shutdown.

### B. Tool calling with different models

Tool calling has previously failed with some model-provider combinations.

Investigate provider normalization, streaming fragments, JSON argument assembly, tool IDs, and tool-result association.

Do not implement model-name-specific workarounds.

### C. Terminal command visibility

Previously, only part of a command was shown during execution.

Ensure that the complete executed command is available to the user and that execution details are streamed correctly.

### D. Live execution status

Previously, it was difficult to determine whether the agent was working and how much token usage had occurred.

Establish reliable runtime events for execution status, progress, and token usage.

### E. Terminal text selection and copying

Previously, using Ctrl+C could interrupt the terminal rather than simply copying selected text.

Ensure that selection, copying, and process interruption have distinct and predictable behavior.

These are important regression areas. Fix their underlying architectural causes, not just their visible symptoms.

---

# 19. REQUIRED ARCHITECTURAL DOCUMENTATION

Maintain documentation as part of the implementation.

Inspect existing documentation first and update it where appropriate rather than creating duplicate documents.

Produce the following deliverables:

### Architecture comparison

`docs/architecture/architecture-comparison.md`

Include:

- OpenCode architecture.
- Codex architecture.
- Current Agent Termo architecture.
- Comparison matrix.
- Source references.
- Architectural strengths.
- Identified gaps.

### Current architecture audit

`docs/architecture/current-architecture-audit.md`

Include:

- Existing architecture diagram.
- Runtime flow.
- Module ownership.
- Dependency relationships.
- Root-cause findings.
- Severity and priorities.

### Target architecture

`docs/architecture/target-architecture.md`

Include:

- Target architecture diagram.
- Component responsibilities.
- Module boundaries.
- Core interfaces.
- Execution lifecycle.
- Event architecture.
- Tool execution lifecycle.
- Session lifecycle.
- Security boundaries.

### Implementation plan

Inspect existing `plan.md` first. Preserve its relevant information and update it if appropriate.

Otherwise create:

`docs/architecture/implementation-plan.md`

Include:

- Implementation phases.
- Dependencies.
- Priorities.
- Test requirements.
- Completed work.
- Outstanding work.
- Known risks.

Documentation must reflect the actual code, not an aspirational architecture that has not been implemented.

Use Mermaid diagrams where useful.

---

# 20. DEFINITION OF DONE

The work is not complete simply because the code compiles.

The following criteria must be verified.

### Architecture

- [ ] Agent execution has a clearly defined owner.
- [ ] Presentation logic is separated from runtime logic.
- [ ] Provider-specific behavior is isolated.
- [ ] Tool execution has a common lifecycle.
- [ ] Session ownership is predictable.
- [ ] Events have a consistent contract.
- [ ] Cancellation propagates through the runtime.
- [ ] Resources have explicit lifecycle management.
- [ ] Permission enforcement has a clear boundary.
- [ ] Context management is independently testable.

### Reliability

- [ ] Tool calls are correctly normalized.
- [ ] Multiple tool calls work.
- [ ] Streaming tool calls work.
- [ ] Tool results are correctly associated with their calls.
- [ ] Provider failures do not corrupt sessions.
- [ ] Cancellation does not leave orphaned processes.
- [ ] Runtime shutdown works correctly.
- [ ] Sessions recover consistently.
- [ ] Context compaction preserves important information.
- [ ] Token usage is correctly represented.

### Security

- [ ] Tool permissions cannot be bypassed through alternate execution paths.
- [ ] Filesystem boundaries are tested.
- [ ] Sensitive data is appropriately redacted.
- [ ] Invalid tool arguments are rejected.
- [ ] Shell execution behavior is documented accurately.
- [ ] Uncontrolled process execution is addressed.

### Testing

- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] Tool-calling regression tests pass.
- [ ] Terminal lifecycle tests pass.
- [ ] Type checking passes.
- [ ] Linting passes.
- [ ] Production build passes.
- [ ] Existing tests remain functional.
- [ ] No important tests have been disabled or weakened.

### Documentation

- [ ] Source-backed comparison is documented.
- [ ] Current architecture is documented.
- [ ] Target architecture is documented.
- [ ] Implementation progress is documented.
- [ ] Remaining limitations are explicitly documented.

If something cannot be implemented or verified, explain exactly why. Do not mark it complete.

---

# 21. FINAL ENGINEERING STANDARD

Use the following engineering principles throughout the project:

**Correctness over cleverness.**

**Explicit ownership over shared mutable state.**

**Small interfaces over tightly coupled modules.**

**Deterministic execution over hidden behavior.**

**Structured events over UI assumptions.**

**Centralized policies over scattered permission checks.**

**Testable components over large interconnected systems.**

**Root-cause fixes over temporary workarounds.**

**Measured improvements over speculative rewrites.**

**Backward compatibility over unnecessary breaking changes.**

Do not optimize for the number of files created or the amount of code written.

Optimize for the quality of the resulting architecture.

The codebase should be understandable by another experienced engineer who has never worked on Agent Termo before.

A new developer should be able to understand:

- How a user request enters the application.
- How a session is created and managed.
- How the agent communicates with a model.
- How tool calls are received and executed.
- How permissions are enforced.
- How terminal processes are managed.
- How events reach the UI.
- How errors are handled.
- How cancellation works.
- How conversation history is persisted.
- How a new provider or tool can be added.

---

# 22. EXECUTION INSTRUCTIONS

Work in the following order:

**Step 1 — Preflight**

Inspect the current Git state, project structure, package configuration, and existing tests.

**Step 2 — Research**

Inspect the actual current OpenCode and Codex implementations.

**Step 3 — Audit**

Trace Agent Termo's runtime and identify architectural problems with source-code evidence.

**Step 4 — Compare**

Create a detailed architecture comparison and identify the highest-impact gaps.

**Step 5 — Design**

Define a practical target architecture with explicit ownership and boundaries.

**Step 6 — Plan**

Create or update the implementation plan.

**Step 7 — Implement**

Implement the architecture incrementally, starting with critical reliability issues.

**Step 8 — Verify**

Run unit, integration, regression, type-checking, linting, and build tests.

**Step 9 — Review**

Review the complete diff for regressions, unnecessary complexity, incomplete migrations, and duplicated implementations.

**Step 10 — Report**

Provide an engineering completion report.

IMPORTANT:

Do not stop after Steps 1–6.

Continue into actual implementation and verification.

Do not ask for approval for every ordinary code change. Use engineering judgment and proceed with safe, reversible implementation decisions.

For destructive operations, data migrations, or actions outside the repository, stop and request approval.

If the full task is too large for one uninterrupted implementation, complete the highest-priority safe vertical slices, keep the implementation plan accurate, and clearly distinguish completed work from remaining work.

---

# FINAL EXPECTATION

I want Agent Termo to become a serious coding-agent platform with an architecture that can be maintained, extended, tested, and improved over several years.

Study what makes OpenCode and Codex successful at the engineering level.

Understand their architectural decisions.

Identify where Agent Termo is weaker.

Fix the underlying problems.

Do not copy their code blindly.

Do not introduce unnecessary complexity.

Build a reliable, modular, provider-independent agent runtime.

**The ultimate goal is not to make Agent Termo a clone of OpenCode or Codex. The goal is to build an independently engineered coding agent whose architecture is strong enough to compete with them.**