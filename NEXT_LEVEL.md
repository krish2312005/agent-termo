# AGENT-TERMO — COMPLETE ARCHITECTURE REBUILD, ROOT-CAUSE FIXES & PRODUCTION READINESS

## ROLE

Act as a **Principal Software Architect, Senior Systems Engineer, Runtime Engineer, AI Agent Engineer, Security Engineer, and Quality Assurance Lead**.

Your assignment is to transform the existing **Agent-Termo** project into a reliable, maintainable, secure, high-performance, production-grade CLI coding agent.

The architectural and user-experience quality benchmarks are:

- Claude Code
- OpenCode
- Codex CLI

These products are reference points for engineering quality, not templates to copy blindly.

You must understand how a professional coding agent should work internally, identify the weaknesses in our current implementation, and fix the actual underlying causes.

This is not a small bug-fixing task.

This is a complete engineering review and remediation of the existing Agent-Termo architecture.

---

# 1. PRIMARY OBJECTIVE

Make Agent-Termo a dependable CLI coding agent that can:

1. Understand a user's request.
2. Plan complex software engineering tasks.
3. Inspect and understand an existing codebase.
4. Select the appropriate tools.
5. Execute tools reliably.
6. Read, create, modify, and delete files safely.
7. Execute terminal commands and monitor their execution.
8. Interact with different model providers.
9. Handle model tool calls correctly.
10. Maintain conversation and task context.
11. Stream responses and execution events.
12. Recover gracefully from failures.
13. Cancel ongoing operations immediately.
14. Provide accurate execution visibility.
15. Work consistently across supported operating systems.
16. Run for extended sessions without memory leaks, orphaned processes, deadlocks, or corrupted state.

The system must be engineered so that its components have clearly defined responsibilities, explicit contracts, predictable lifecycle management, and independently testable behavior.

**Do not simply make the current implementation appear to work. Make the underlying system correct.**

---

# 2. NON-NEGOTIABLE ENGINEERING RULES

These rules apply throughout the entire project.

## 2.1 Understand before modifying

Before changing code:

- Inspect the entire repository.
- Read the architecture documentation.
- Inspect the package configuration and dependency graph.
- Understand the application entry points.
- Understand the execution lifecycle.
- Understand how messages flow between components.
- Understand how model responses become tool calls.
- Understand how tools are executed and their results returned.
- Understand the terminal implementation.
- Understand persistence, configuration, and provider management.
- Inspect all existing tests.

Do not assume that existing documentation accurately describes the implementation.

Verify every important architectural assumption against the actual source code.

Do not start rewriting major components after inspecting only a few files.

## 2.2 Fix root causes, not symptoms

For every defect:

1. Reproduce the problem.
2. Identify the exact failing execution path.
3. Trace the failure through all involved components.
4. Find the underlying root cause.
5. Design the smallest correct architectural change.
6. Implement the fix.
7. Add a regression test.
8. Run relevant existing tests.
9. Verify that the fix does not introduce regressions.

Do not add arbitrary retries, timeouts, fallback values, conditionals, or exception suppression merely to make errors disappear.

A fix is not complete until its original failure scenario is tested.

## 2.3 Preserve working functionality

Do not unnecessarily rewrite working systems.

Do not remove existing features just because replacing them is easier.

Do not introduce unnecessary abstractions, frameworks, dependencies, or configuration options.

Avoid large, unrelated formatting changes.

Preserve existing user-facing behavior unless it is demonstrably defective or an intentional improvement is required.

Every modified line must contribute to a defined objective.

## 2.4 No fake reliability

Never:

- Silently swallow exceptions.
- Return fake successful responses.
- Pretend a tool executed when it did not.
- Mark a task complete before the work is actually complete.
- Hide failed tool executions.
- Retry indefinitely.
- Treat a malformed model response as a valid tool call.
- Claim that a command was cancelled when its process is still running.
- Claim that tests passed when they were not executed.
- Hardcode provider-specific assumptions into shared runtime logic.

Failures must be visible, actionable, and correctly classified.

## 2.5 Maintainability is mandatory

Every subsystem must have:

- A clearly defined responsibility.
- Explicit input and output contracts.
- Predictable error behavior.
- Correct resource ownership.
- Well-defined lifecycle management.
- Appropriate tests.
- Clear boundaries from unrelated subsystems.

Avoid circular dependencies, unnecessary global state, duplicated implementations, giant classes, and tightly coupled modules.

---

# 3. PHASE ONE — COMPLETE REPOSITORY AND ARCHITECTURE AUDIT

Begin with a complete repository assessment.

Inspect all relevant files, not just files that look problematic.

Include:

- Source code.
- Runtime and execution engines.
- Provider implementations.
- Tool definitions and registrations.
- Tool execution logic.
- Agent orchestration.
- Terminal and process management.
- User interface and rendering.
- Conversation and session management.
- Context management.
- Configuration and environment loading.
- Persistence and storage.
- Streaming implementation.
- Error handling.
- Logging.
- Build and packaging.
- Dependencies.
- Unit tests.
- Integration tests.
- End-to-end tests.
- Documentation.
- CI/CD configuration.

## 3.1 Build an architecture map

Create `plan.md` in the repository root.

Document:

1. Current architecture.
2. Main application entry points.
3. Execution lifecycle.
4. Provider-to-agent communication.
5. Agent-to-tool communication.
6. Tool registration and discovery.
7. Tool execution lifecycle.
8. Terminal process lifecycle.
9. Message and event flow.
10. State management.
11. Persistence boundaries.
12. Dependency relationships.
13. Existing architectural weaknesses.

Include an architecture diagram using Mermaid where useful.

## 3.2 Identify architectural problems

Look for:

- Circular dependencies.
- Excessive coupling.
- God objects.
- Duplicate business logic.
- Unclear ownership of state.
- Multiple sources of truth.
- Incorrect abstraction boundaries.
- Inconsistent interfaces.
- Unsafe type assertions.
- Missing runtime validation.
- Unhandled asynchronous operations.
- Race conditions.
- Deadlocks.
- Resource leaks.
- Incorrect cancellation propagation.
- Fragile event handling.
- Incorrect stream parsing.
- Invalid assumptions about provider response formats.
- Unbounded memory or output accumulation.
- Inconsistent error propagation.
- Platform-specific implementation mistakes.

## 3.3 Produce an actionable defect register

For every identified issue, record:

| Field | Description |
|---|---|
| ID | Unique issue identifier |
| Severity | Critical, High, Medium, Low |
| Component | Affected subsystem |
| Problem | What is broken |
| Root cause | Why it is broken |
| Impact | User or system consequences |
| Required fix | What must change |
| Verification | How the fix will be tested |

Prioritize issues using their actual risk and impact.

Do not invent defects just to make the report larger.

**After completing the initial audit, continue into implementation. Do not stop after writing the report.**

---

# 4. PHASE TWO — REBUILD THE CORE AGENT ARCHITECTURE

The central agent runtime must be deterministic, maintainable, and provider-independent wherever possible.

Review and correct the following responsibilities.

## 4.1 Agent orchestration

Establish a clear execution lifecycle:

1. Receive user input.
2. Validate the request and current session state.
3. Construct the model request.
4. Send the request to the selected provider.
5. Process streaming or non-streaming responses.
6. Detect and validate tool calls.
7. Execute approved tools.
8. Collect tool results.
9. Return tool results to the model using the correct format.
10. Continue the execution cycle when appropriate.
11. Detect final assistant responses.
12. Update conversation state.
13. Emit final execution events.
14. Release resources.

Ensure that the lifecycle works correctly for:

- Normal text responses.
- Single tool calls.
- Multiple tool calls.
- Parallel tool calls.
- Sequential tool calls.
- Tool execution failures.
- Provider errors.
- Malformed responses.
- User cancellation.
- Timeouts.
- Context exhaustion.
- Network interruptions.
- Long-running operations.

## 4.2 Execution state machine

Avoid loosely coordinated booleans and implicit execution states.

Define explicit states appropriate to the existing architecture, such as:

- Idle
- Preparing
- Requesting
- Streaming
- ProcessingToolCalls
- ExecutingTools
- AwaitingToolResults
- Continuing
- Completed
- Failed
- Cancelled

Define valid state transitions.

Prevent:

- Completing an already cancelled task.
- Executing tools after cancellation.
- Processing stale responses.
- Concurrent execution of the same task.
- Duplicate finalization.
- Incorrect state transitions after failures.

State transitions should have one authoritative owner.

## 4.3 Execution identity

Make sure every agent execution, model request, tool call, and tool result can be correlated.

Preserve the correct relationships between:

- Session ID.
- Conversation ID, if applicable.
- Execution ID.
- Request ID.
- Tool call ID.
- Tool execution ID.
- Parent execution ID.

Never associate a tool result with the wrong tool call.

Never reuse stale results between separate executions.

---

# 5. PHASE THREE — FIX THE PROVIDER AND MODEL INTEGRATION ARCHITECTURE

Provider integration is one of the most critical parts of Agent-Termo.

The same agent runtime should work across different providers without embedding provider-specific behavior throughout the application.

## 5.1 Provider abstraction

Inspect all existing providers and establish a consistent contract for:

- Authentication.
- Model selection.
- Request construction.
- System instructions.
- Message conversion.
- Tool definitions.
- Tool call responses.
- Streaming.
- Usage information.
- Finish reasons.
- Error handling.
- Timeouts.
- Cancellation.
- Context limits.

Do not force all providers into an abstraction that cannot represent their actual capabilities.

Use explicit capability handling where providers differ.

## 5.2 Tool calling must be reliable

This is a critical requirement.

Inspect the complete tool-calling pipeline:

`Agent → Provider Adapter → API Request → Provider Response → Stream Parser → Tool Call Parser → Tool Validator → Tool Registry → Tool Executor → Tool Result → Provider Adapter → Next Model Request`

Test every stage.

Handle:

- Multiple tool calls in a single response.
- Parallel tool calls.
- Sequential tool calls.
- Partial streamed tool-call arguments.
- Tool-call arguments arriving in multiple chunks.
- Different tool-call indexes.
- Tool-call IDs arriving in separate chunks.
- Incomplete JSON.
- Invalid JSON.
- Empty arguments.
- Incorrect argument types.
- Unknown tool names.
- Missing tool-call IDs.
- Duplicate tool-call IDs.
- Provider-specific tool-call structures.
- Tool results with errors.
- Tool execution timeouts.
- Tool execution cancellation.

Never execute partial arguments.

Never execute malformed tool calls.

Never lose a tool-call ID while reconstructing streaming responses.

The parser must correctly assemble complete tool calls from streamed chunks.

## 5.3 Provider-specific adapters

Keep provider-specific conversion logic inside the appropriate adapter.

Do not let one provider's message format leak into other providers.

Explicitly test providers that differ in:

- Tool calling.
- Streaming.
- Usage metadata.
- Finish reasons.
- Message roles.
- Tool-result formats.
- Parallel calls.
- Context limits.

## 5.4 DeepSeek compatibility and upstream errors

Investigate existing DeepSeek integration failures, including:

`503 Service Suspended`

Do not assume this is necessarily a defect in Agent-Termo.

Distinguish between:

1. Incorrect API configuration.
2. Invalid or missing API credentials.
3. Incorrect base URL.
4. Unsupported model configuration.
5. Incorrect request format.
6. Incorrect tool definitions.
7. Provider-side account or service suspension.
8. Provider-side temporary outages.
9. Network failures.
10. Agent-Termo response parsing defects.

A provider-side 503 must not be mislabeled as a successful application-level fallback.

Implement appropriate error classification, useful diagnostics, and bounded retry behavior for genuinely transient errors.

Authentication failures, invalid requests, account suspensions, and other non-retryable errors must not enter endless retry loops.

Never print API keys or sensitive request headers in logs.

## 5.5 Streaming correctness

Verify that:

- Text chunks are appended in their original order.
- Tool-call chunks are reconstructed correctly.
- Usage information is preserved.
- Finish reasons are interpreted correctly.
- Stream termination is detected.
- Network failures are propagated.
- Cancellation closes the active request.
- Partial output is handled consistently.
- No duplicate content is emitted.
- No chunks are silently lost.

The same logical response must produce consistent results whether the provider responds through streaming or non-streaming mode, subject to documented provider differences.

---

# 6. PHASE FOUR — TOOL SYSTEM ARCHITECTURE

Tools are the foundation of a coding agent.

Audit and repair the entire tool framework.

## 6.1 Tool contracts

Every tool must have:

- A stable name.
- A useful description.
- A valid parameter schema.
- Runtime argument validation.
- A clearly defined execution function.
- A structured result.
- Consistent error handling.
- Cancellation support where appropriate.
- Appropriate execution constraints.

Keep model-facing tool schemas separate from internal implementation details.

Do not trust model-generated arguments.

Validate tool arguments at runtime before execution.

## 6.2 Tool registration and discovery

Ensure:

- Tool names are unique.
- Registration is deterministic.
- Unknown tools are rejected.
- Duplicate registrations are detected.
- Tool schemas match their implementations.
- Tool availability is checked before execution.
- Tool descriptions are accurate.
- The active provider receives the correct tool definitions.

Do not maintain multiple conflicting tool registries.

## 6.3 Tool execution

Implement or correct:

- Sequential execution where ordering matters.
- Safe parallel execution where operations are independent.
- Concurrency limits.
- Execution timeouts.
- Cancellation propagation.
- Result normalization.
- Structured errors.
- Execution tracking.
- Accurate status reporting.

Parallel execution must not introduce race conditions or corrupt shared state.

Do not run dependent tools concurrently merely because they were returned in one response.

## 6.4 Tool result handling

The model must receive the exact result corresponding to its original tool call.

Handle:

- Success.
- Execution errors.
- Invalid arguments.
- Missing resources.
- Permission denials.
- Timeouts.
- Cancellation.
- Oversized outputs.

Preserve useful information when a tool fails.

Do not convert every failure into an empty successful result.

---

# 7. PHASE FIVE — TERMINAL AND PROCESS MANAGEMENT

This subsystem requires particular attention because terminal correctness is fundamental to a CLI coding agent.

Perform a complete review of process spawning, input/output streams, lifecycle ownership, signal handling, and cleanup.

## 7.1 Correct process lifecycle

Ensure terminal commands:

- Start correctly.
- Receive the expected working directory.
- Receive the intended environment.
- Preserve stdout and stderr.
- Stream output continuously.
- Expose exit codes.
- Detect process termination.
- Handle signals correctly.
- Release resources.
- Do not leave orphaned child processes.

Every spawned process must have a clearly defined owner and lifecycle.

## 7.2 Critical cancellation bug

Previous testing exposed a problem where killing the terminal did not reliably stop the running command.

Investigate this as a root-cause issue.

Test:

1. Start a long-running command.
2. Request cancellation.
3. Verify that the correct process terminates.
4. Verify that child processes terminate where appropriate.
5. Verify that process handles and streams are released.
6. Verify that the agent execution stops.
7. Verify that no stale output appears afterward.
8. Verify that a new command can run normally.

Do not merely hide the terminal interface while leaving its process alive.

Do not assume that terminating a parent process automatically terminates all descendants.

Use appropriate process-tree termination behavior for each supported platform.

On Windows, Linux, and macOS, account for their different process and signal semantics.

## 7.3 Ctrl+C behavior

Separate terminal text selection/copy behavior from application cancellation behavior.

When text is actively selected:

- Ctrl+C must copy the selected text.
- The application must not interpret that event as an exit request.

When no text is selected:

- Ctrl+C must follow the application's intended cancellation behavior.
- The active process or operation must be cancelled correctly.
- The application should remain usable when cancellation is intended to stop the current operation rather than exit the application.

Implement the behavior through a proper input and terminal-event handling design.

Do not globally disable Ctrl+C.

Do not break normal terminal interaction.

## 7.4 Terminal output

Show the complete command being executed.

Do not truncate the command in execution information.

Keep command display separate from output display.

Ensure:

- stdout is visible.
- stderr is visible.
- Long commands remain inspectable.
- Multiline commands remain readable.
- Output ordering is preserved.
- Large output does not cause unbounded memory growth.
- Terminal output remains responsive.

Do not confuse the abbreviated display of a command with the actual executed command.

The underlying command must execute exactly as intended.

## 7.5 Terminal safety

Review:

- Working directory validation.
- Environment variable handling.
- Shell selection.
- Command execution permissions.
- Process timeouts.
- Output limits.
- Dangerous command handling.
- Path traversal.
- Secret exposure.
- Temporary file cleanup.

Preserve the expected functionality of a coding agent while enforcing clear and predictable execution boundaries.

---

# 8. PHASE SIX — LIVE EXECUTION VISIBILITY AND TOKEN USAGE

Improve execution visibility so users can understand what Agent-Termo is doing.

Use the existing interface architecture where practical.

## 8.1 Execution status

Clearly communicate meaningful execution states:

- Thinking.
- Generating a response.
- Planning.
- Calling a tool.
- Executing a terminal command.
- Reading files.
- Writing files.
- Waiting for a provider.
- Retrying a request.
- Cancelling.
- Completed.
- Failed.

Status events must represent actual runtime events.

Never fabricate progress indicators.

## 8.2 Live token usage

Display token information when it is available from the provider.

Support:

- Input tokens.
- Output tokens.
- Total tokens.
- Cached input tokens where available.
- Usage information after a completed request.
- Live or estimated information only when genuinely available or explicitly identified as an estimate.

Important:

Provider usage metadata differs.

Do not invent exact token counts by treating character counts as authoritative token counts.

When accurate live token usage is unavailable during generation, clearly distinguish the last confirmed count from an estimate.

Ensure usage is associated with the correct request and execution.

Do not accidentally add the same usage data multiple times.

---

# 9. PHASE SEVEN — CONTEXT AND CONVERSATION MANAGEMENT

A long-running coding agent needs reliable context handling.

Audit the entire context management system.

## 9.1 Context budgeting

Correctly manage:

- Provider context limits.
- System instruction tokens.
- Conversation history.
- Tool definitions.
- Tool results.
- User input.
- Reserved output tokens.
- Safety margins.

Avoid assuming that every model has the same context window.

Use documented model/provider limits where available.

Validate configurations.

Reject impossible or inconsistent token budgets with useful errors.

Do not silently truncate critical instructions or tool results.

## 9.2 Context compression

Review the compaction and summarization mechanism.

Ensure:

- Important user requirements are preserved.
- Current task state is preserved.
- Relevant file paths are preserved.
- Important tool results are preserved.
- Pending work is preserved.
- Existing decisions are preserved.
- Unresolved errors are preserved.

Do not delete the information required to finish the current task.

## 9.3 Conversation integrity

Verify:

- Message ordering.
- Role correctness.
- Tool-call/result pairing.
- Session isolation.
- Conversation recovery.
- Correct handling of interrupted executions.
- No duplicated messages.
- No cross-session state leakage.

---

# 10. PHASE EIGHT — FILE SYSTEM AND CODE EDITING

The file system is one of the most important tool boundaries.

Review all file operations.

Ensure reliable behavior for:

- Reading files.
- Writing files.
- Creating files.
- Editing files.
- Deleting files.
- Listing directories.
- Searching files.
- Reading large files.
- Binary-file detection.
- Path validation.
- Permission errors.
- Concurrent file operations.

## 10.1 Safe file modification

Prevent:

- Accidental modification of unrelated files.
- Truncated writes.
- Partial writes.
- Incorrect patch application.
- Corrupted files after failures.
- Path traversal.
- Incorrect relative-path resolution.

Use appropriate atomic write or patch strategies.

Verify the final file contents after important modifications where appropriate.

## 10.2 Patch handling

Audit the entire patch and editing pipeline.

Test:

- Single-line modifications.
- Multiline modifications.
- Repeated matching content.
- Missing search content.
- Ambiguous search content.
- Large files.
- New files.
- Deleted files.
- Concurrent modifications.

A patch must not silently apply to the wrong location.

Return useful errors when the requested change cannot be applied safely.

---

# 11. PHASE NINE — EVENT-DRIVEN UI AND RENDERING ARCHITECTURE

Inspect the existing CLI interface and event pipeline.

Do not replace the UI framework unnecessarily.

Improve the existing implementation.

## 11.1 Event architecture

Use well-defined event contracts between:

- Agent runtime.
- Provider integration.
- Tool execution.
- Terminal processes.
- Session management.
- Rendering.

Events should carry enough information to identify the execution and the associated operation.

Ensure:

- Correct event ordering.
- No duplicated events.
- No stale events.
- Correct cleanup.
- No unhandled listeners.
- No memory leaks.
- No race conditions.

## 11.2 Rendering correctness

Ensure:

- Long outputs render correctly.
- Multiline commands render correctly.
- Streaming content does not disappear.
- Tool status remains accurate.
- Terminal output remains readable.
- Errors are visible.
- Cancellation is reflected immediately.
- Large conversations do not make the UI unusable.

Prevent rendering updates from modifying execution state incorrectly.

---

# 12. PHASE TEN — ERROR HANDLING AND RECOVERY

Establish consistent error handling throughout the application.

Errors should be classified by their actual source.

Possible categories:

- Configuration errors.
- Authentication errors.
- Provider errors.
- Network errors.
- Model response errors.
- Tool validation errors.
- Tool execution errors.
- Terminal errors.
- File system errors.
- Context errors.
- Permission errors.
- Internal application errors.

Every failure should have:

1. A meaningful error type.
2. A useful message.
3. Relevant context.
4. Appropriate severity.
5. A predictable propagation path.
6. A recovery decision where recovery is possible.

Do not expose raw internal stack traces to ordinary users by default, but preserve diagnostic information for debugging.

Do not hide the original error behind generic messages.

Retry only when the operation is safe to retry and the error is genuinely transient.

Use bounded retry policies with appropriate backoff.

---

# 13. PHASE ELEVEN — SECURITY AND RELIABILITY AUDIT

Perform a security review of the complete application.

Examine:

- API key storage.
- Environment variable handling.
- Sensitive logging.
- File system boundaries.
- Path traversal.
- Shell execution.
- Command permissions.
- Tool argument validation.
- Temporary files.
- Dependency vulnerabilities.
- Process execution.
- Network requests.
- Configuration loading.
- Data persistence.

Prevent secrets from appearing in:

- Logs.
- Error messages.
- Terminal output.
- Debug output.
- Crash reports.

Review dependency versions and known vulnerabilities.

Do not automatically upgrade every dependency.

Upgrade only when necessary, compatible, and justified.

Document remaining security risks rather than pretending they do not exist.

---

# 14. PHASE TWELVE — TESTING AND VERIFICATION

A production-quality architecture requires tests that verify behavior, not merely whether functions execute without throwing errors.

Test the actual system boundaries.

## 14.1 Unit tests

Cover:

- Provider adapters.
- Message conversion.
- Tool-call parsing.
- Stream reconstruction.
- Tool argument validation.
- Tool registration.
- Context budgeting.
- State transitions.
- Error classification.
- Configuration validation.
- File operations.
- Terminal lifecycle utilities.

## 14.2 Integration tests

Cover complete flows:

- User request to provider.
- Provider response to tool execution.
- Tool result back to provider.
- Multiple tool calls.
- Parallel tool calls.
- Streaming tool calls.
- Provider failures.
- Terminal execution.
- Terminal cancellation.
- Session isolation.
- Context overflow.
- File editing.

## 14.3 Regression tests

Reproduce and test the existing known problems:

**A. Tool calling**
- DeepSeek tool calls.
- Multiple tool calls.
- Parallel tool calls.
- Partial streamed arguments.
- Malformed tool arguments.
- Tool result pairing.

**B. Terminal lifecycle**
- Killing active commands.
- Killing nested child processes.
- Ctrl+C cancellation.
- Ctrl+C copying selected text.
- Process cleanup.
- Complete command visibility.

**C. Execution visibility**
- Accurate status changes.
- Full terminal command display.
- Token usage association.
- Correct handling of unavailable usage metadata.

**D. Provider failures**
- HTTP 400.
- HTTP 401.
- HTTP 403.
- HTTP 429.
- HTTP 500.
- HTTP 502.
- HTTP 503.
- Network interruptions.
- Timeouts.
- Malformed response bodies.

Ensure that failures are properly classified and do not cause endless loops or incorrect success states.

## 14.4 Platform testing

Where the application claims support, test relevant platform behavior on:

- Windows.
- Linux.
- macOS.

Prioritize process spawning, cancellation, keyboard handling, path resolution, and terminal behavior.

Do not claim cross-platform compatibility based only on tests run on one operating system.

## 14.5 Stress testing

Test:

- Long conversations.
- Repeated tool calls.
- Large file reads.
- Large terminal outputs.
- Many parallel tool operations.
- Repeated cancellations.
- Provider interruptions.
- Long-running commands.
- Repeated session creation and termination.

Look for:

- Memory leaks.
- CPU spikes.
- Hanging tasks.
- Unreleased processes.
- Unbounded queues.
- Duplicate events.
- Deadlocks.
- State corruption.

---

# 15. PHASE THIRTEEN — PERFORMANCE AND RESOURCE MANAGEMENT

Measure performance before optimizing.

Inspect:

- Startup time.
- Memory consumption.
- CPU consumption.
- Streaming latency.
- Tool execution latency.
- Large output handling.
- Rendering performance.
- Context construction overhead.
- File scanning performance.

Avoid unnecessary buffering of large outputs.

Use streaming wherever it provides a genuine advantage.

Ensure queues have appropriate limits and backpressure behavior.

Release:

- Processes.
- Streams.
- Event listeners.
- Timers.
- Network connections.
- Temporary resources.
- File handles.

Do not introduce optimization complexity without measurable benefits.

---

# 16. PHASE FOURTEEN — CONFIGURATION, BUILD AND DISTRIBUTION

The project must behave consistently during development and after installation.

Audit:

- Development startup.
- Production build.
- Package exports.
- CLI entry points.
- Executable permissions.
- Runtime dependencies.
- Bundling.
- Environment loading.
- Windows compatibility.
- Linux compatibility.
- macOS compatibility.
- npm packaging.
- Bun compatibility, if supported.
- Published package contents.

Test the built package rather than relying exclusively on the development environment.

Verify that the installed CLI can:

1. Start.
2. Load configuration.
3. Initialize its runtime.
4. Connect to a configured provider.
5. Execute tools.
6. Execute terminal commands.
7. Handle errors.
8. Cancel operations.
9. Exit cleanly.

Ensure that no required runtime files are accidentally excluded from the package.

---

# 17. PHASE FIFTEEN — DOCUMENTATION

Update documentation after the actual architecture changes have been implemented.

Create or update:

- README.
- Architecture documentation.
- Provider integration documentation.
- Tool development documentation.
- Configuration reference.
- Environment variable reference.
- Terminal execution documentation.
- Error troubleshooting guide.
- Testing guide.
- Development guide.

Documentation must describe actual behavior.

Include:

- Module responsibilities.
- Main execution lifecycle.
- Tool-call lifecycle.
- Provider adapter contracts.
- Event contracts.
- Cancellation behavior.
- Configuration requirements.
- Known provider limitations.

Do not document features that are not implemented.

---

# 18. REQUIRED IMPLEMENTATION WORKFLOW

Follow this workflow throughout the task.

## Step 1 — Establish the baseline

Inspect:

- Git branch.
- Working tree status.
- Existing uncommitted modifications.
- Current commit.
- Package scripts.
- Existing tests.
- Build status.

Do not overwrite or discard existing user changes.

Do not switch branches.

Do not commit or push unless explicitly requested.

Run the current test suite and build before modifying anything.

Record existing failures separately from newly introduced failures.

## Step 2 — Create the implementation plan

Create `plan.md`.

Break the work into:

- Critical architectural defects.
- High-priority defects.
- Medium-priority defects.
- Low-priority improvements.
- Refactoring required for correctness.
- Verification requirements.

Identify dependencies between fixes.

Prioritize root causes rather than individual symptoms.

## Step 3 — Establish component contracts

Before major modifications, determine which contracts must change.

Avoid changing unrelated public interfaces.

Define the correct ownership and responsibilities of the affected components.

## Step 4 — Implement in controlled stages

Use small, focused changes.

For each stage:

1. Implement the change.
2. Run targeted tests.
3. Run related integration tests.
4. Inspect the diff.
5. Fix any regression.
6. Update `plan.md`.

Do not accumulate hundreds of unverified changes before testing.

## Step 5 — Full regression verification

After implementation:

- Run all available tests.
- Run type checking.
- Run linting.
- Run production build.
- Run package validation.
- Run critical end-to-end scenarios.
- Run available platform-specific tests.
- Inspect the final Git diff.

Fix failures caused by your changes.

Do not hide failing tests by deleting them, weakening assertions, skipping tests, or suppressing errors.

If an existing test is incorrect, document why and replace it with an appropriate test.

## Step 6 — Final architecture review

Inspect the final architecture again.

Ask:

- Are responsibilities clearly separated?
- Is any component unnecessarily coupled?
- Is state ownership unambiguous?
- Can cancellation propagate through the entire execution?
- Can provider errors be distinguished from internal errors?
- Are tool calls correctly correlated?
- Are resources released?
- Are asynchronous operations handled?
- Are the critical behaviors tested?
- Does the packaged application behave correctly?

Fix any remaining problems identified during this review.

---

# 19. DEFINITION OF DONE

Do not declare the project production-ready merely because it compiles.

Use the following acceptance criteria.

| Area | Required result |
|---|---|
| Architecture | Clear module boundaries and documented responsibilities |
| Agent runtime | Correct execution lifecycle and state transitions |
| Providers | Consistent adapter contracts |
| Tool calling | Correct parsing, validation, pairing, and execution |
| Streaming | No lost or duplicated chunks |
| Terminal | Correct lifecycle and cleanup |
| Cancellation | Active operations and child processes terminate correctly |
| Keyboard input | Selection/copy and cancellation work correctly |
| File editing | Safe and predictable modifications |
| Context | Correct budgeting and preservation |
| Error handling | Accurate classification and propagation |
| Security | No accidental secret disclosure |
| UI | Accurate and responsive execution visibility |
| Token usage | Accurate provider-reported data, with estimates labeled |
| Testing | Meaningful unit, integration, and regression coverage |
| Performance | No identified unbounded queues or resource leaks |
| Packaging | Installed build works in supported environments |
| Documentation | Matches the actual implementation |

For every criterion, provide evidence.

Use the following status values:

- PASS — Verified successfully.
- PARTIAL — Implemented but not fully verified.
- FAIL — Not working or verification failed.
- BLOCKED — Requires unavailable infrastructure or external access.

A test passing on one machine does not prove all platforms work.

A mocked provider test does not prove a live provider integration works.

A successful development build does not prove the packaged CLI works.

Be precise about the difference.

---

# 20. IMPORTANT RULES FOR COMPLEX OR UNCERTAIN ISSUES

Do not ask me unnecessary questions.

Inspect the project and make reasonable engineering decisions based on the existing architecture.

When multiple solutions are possible:

1. Prefer the simplest reliable solution.
2. Prefer established project conventions.
3. Avoid unnecessary dependencies.
4. Preserve existing public behavior.
5. Consider Windows, Linux, and macOS compatibility.
6. Explain significant trade-offs in `plan.md`.

If a fix requires unavailable API credentials, services, operating systems, or external infrastructure:

- Implement what can be verified locally.
- Create appropriate automated tests.
- Clearly document what remains unverified.
- Do not fabricate successful integration results.

Never claim absolute zero bugs. Instead, eliminate all reproducible defects found, add regression protection, and disclose remaining risks.

---

# 21. FINAL DELIVERABLES

When the work is complete, provide:

## A. Architecture summary

Explain the final architecture and the responsibilities of its main modules.

## B. Root-cause report

List the important original defects, their actual causes, and how they were fixed.

## C. Implementation summary

List the major components changed and explain why.

## D. Test report

Provide actual results for:

- Unit tests.
- Integration tests.
- Regression tests.
- Type checking.
- Linting.
- Production build.
- Package validation.
- Platform-specific tests.
- Stress tests.

Include the commands executed and the results.

## E. Remaining issues

List any unresolved defects, limitations, or unverified scenarios.

Never omit a known issue merely because it is inconvenient.

## F. Final readiness assessment

Assess the project honestly against the acceptance criteria.

Explain whether it is:

- Not production-ready.
- Partially production-ready.
- Production-ready for its verified environments.

Do not award the highest status without evidence.

---

# 22. FINAL DIRECTIVE

You are responsible for engineering the existing Agent-Termo repository, not creating an imaginary replacement architecture.

**Do not merely tell me what should be fixed. Inspect it, reproduce the defects, implement the fixes, and verify the results.**

Your priorities, in order, are:

1. Correctness.
2. Reliability.
3. Security.
4. Lifecycle and cancellation correctness.
5. Architectural maintainability.
6. Provider and tool compatibility.
7. Performance.
8. User experience.

Do not sacrifice correctness for speed.

Do not sacrifice maintainability for unnecessary abstractions.

Do not sacrifice backward compatibility without a clear reason.

Do not stop after fixing the obvious bugs. Trace the dependent components and verify the complete execution path.

Do not perform a superficial refactor that moves existing problems into different files.

**The final objective is a dependable coding-agent architecture that can serve as a serious competitor to Claude Code and OpenCode in engineering quality, execution reliability, extensibility, and user experience.**

Begin with repository inspection and baseline verification. Create `plan.md`, then execute the remediation work systematically until every achievable acceptance criterion has been tested and documented.