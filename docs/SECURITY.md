# Security Review

**Owner:** `security-expert` (see `.claude/workflow.md`).

## Audit record

- **Date:** 2026-11-23
- **Branch audited:** `feat/subagent-workspace`
- **Commit audited:** `d8e4893db2941e4fb0df49f34f09b250fc413554`
- **Comparison base:** `master` at `6a02c4422ccaa09837cba550cab868e4254913e1`
- **Commits in scope:** `694f983`, `21cf5b8`, `5191664`, `ec9ecb7`, `129c453`, `d8e4893`
- **Working tree at audit time:** `M docs/TIMELINE.md` plus one untracked change-log fragment under `docs/changes/`; no product-code changes.
- **Re-check note:** There was no earlier `docs/SECURITY.md`. This document is the **baseline**; nothing here re-opens or closes a prior finding.

## Scope

The multi-agent workspace feature added on `feat/subagent-workspace`:

- `src/runtime/agent-workspace.ts`, `agent-tree.ts`, `agent-transcript.ts`, `agent-selection.ts`, `subagents.ts`
- `src/main.ts`: persistent `DelegatedAgentSession`, follow-up turns, queueing, approvals/suspend/resume, stop-all, `/clear`, scoped cancellation, namespaced tool ids
- `src/ui/workspace-view.ts`, `src/ui/tui.tsx`, `src/ui/index.ts`, `src/ui/screen.ts`
- `docs/architecture.md` §21 and `docs/DESIGN_SYSTEM.md` §10 as the intended behavior

`git diff master...HEAD --stat`: 36 files, +6372 / -202. No `package.json`, lockfile, or `.env.example` changes.

## Threat model

- **Deployment:** local terminal CLI. There is no web server, no remote authentication, no session cookie, no CORS, and no multi-tenant boundary, so OWASP web-specific controls (A01 session/auth, A02 crypto, CSRF, security headers, TLS) do not apply.
- **Trusted:** the local user, the project directory the user chose to run in, and the user's own typed input.
- **Untrusted / attacker-influenced:** model output, tool output (file contents, command stdout/stderr, git output), and project-supplied agent definitions under `.claude/agents/*.md` and `.agent-termo/agents/*.md`. A cloned or prompt-injected repository can steer all three.
- **Assets:** the user's terminal session, the project files, persisted approvals in `.agent-termo/permissions.json`, provider API keys in the environment/`~/.agent-termo/config.json`, and the integrity of the approval prompts that gate shell commands and file writes.
- **Assumed attacker capabilities:** indirect prompt injection through repository content; a delegated agent that emits hostile tool arguments or output; no local code execution outside the agent's own tools.

## Findings

Severity: **critical / high / medium / low / informational**. "New" means introduced by this branch; "pre-existing" means the same code is on `master` and is reported because it is part of the baseline.

| ID | Severity | New? | Location | Finding |
|----|----------|------|----------|---------|
| SEC-01 | High | New | `src/main.ts:651-652`, `src/main.ts:674`, `src/ui/index.ts:296-297` | Sub-agent file-change approvals are content-free: the diff viewer and tool result are suppressed by `quiet`, and the transcript never records the proposed diff, so the user is asked "Accept this change?" with no path or content while navigation is frozen. |
| SEC-02 | High | Pre-existing | `src/runtime/permissions.ts:27-29`, `src/main.ts:617`, `src/tools/index.ts:705-722` | `bash:start` (and `bash:stop`, `browser:verify`) are not in `isCommandApprovalRequired`, so in the default `ask` mode an agent can launch arbitrary background shell commands without approval; only a 5-pattern denylist and a project-root cwd check apply. |
| SEC-03 | Medium | New | `src/ui/workspace-view.ts:99-100,171-172,298,508-552`; `src/ui/tui.tsx:618-620,1085` | New workspace surfaces render model/tool/agent-name text without the `cleanAnsi` sanitization that the main log applies. Terminal escape/control sequences (CSI/OSC, BEL, lone ESC, CR, DCS) reach the terminal through the sub-agent transcript, navigator rows, content status row, composer prefix/placeholder, and approval banner. |
| SEC-04 | Medium | New | `src/ui/index.ts:294`; `src/agents/index.ts:31-46`; `src/runtime/agent-folder.ts:136-144`; `src/ui/workspace-view.ts:171`; `src/ui/tui.tsx:620` | Approval/label spoofing via unvalidated agent display names. A project agent named `main` produces `[main]` approval prompts and a navigator row indistinguishable from the real main agent; control characters in file-derived names are also displayed. |
| SEC-05 | Medium | New | `src/ui/workspace-view.ts:531-537`; `src/ui/tui.tsx:690-695`; `src/runtime/agent-transcript.ts:229` | Unbounded UI expansion from transcript tool results: every line becomes a separate `UiEntry` (verified 4,003 entries from one 8,000-char result) and the whole transcript is reconverted on every streaming delta of the selected agent, allowing a line-heavy command/file output to freeze the TUI. |
| SEC-06 | Medium | New | `src/main.ts:688-720,1093-1112`; `src/runtime/checkpoints.ts:123-139` | Every delegated session is retained until `/clear`/exit with an uncapped `messages` array, NimClient, tool definitions, and a per-agent checkpoint file. Repeated delegations/follow-ups grow memory and `.agent-termo` checkpoint storage without a bound. |
| SEC-07 | Low | New | `src/runtime/agent-workspace.ts:162-183` | The main-agent 10-message queue cap is bypassed when main is `idle` but no REPL question is pending: the disposition is `dispatch`, `submitExternal` returns false, and `mainQueue.push` runs with no cap check. User-driven only. |
| SEC-08 | Low | New | `src/ui/tui.tsx:114-116`; `src/runtime/subagents.ts:116-120`; `src/runtime/agent-workspace.ts:288-298` | Per-agent UI drafts and scroll positions are never cleared on `/clear`. Agent ids can be reused after the registry is cleared, so a draft typed to an old agent can reappear in a different agent's composer. |
| SEC-09 | Low | New (latent) | `src/runtime/subagents.ts:116-120` | `spawnSubAgent` protects the reserved `main` id only by comparing the derived id with `parentId`. With a non-main parent, `requestId = "main"` returns id `"main"` (verified). Not reachable today (all call sites pass `MAIN_AGENT_ID`), but it violates the one-namespace invariant if nesting is ever enabled. |
| SEC-10 | Low | New | `src/main.ts:901`; `src/runtime/agent-transcript.ts:178-192` | Tool-call ids are namespaced per turn but not disambiguated within a turn. If the model emits two calls with the same id, both transcript entries share a `callId`; `tool.end` updates only the first, misattributing one result. Display-only. |
| SEC-11 | Informational | New | `src/main.ts:758-766,768-788,792-797,999-1006` | Stop-all race: a message delivered after `cancelDelegatedSession` cleared the queue but before the turn's `finally` sets `running = false` is queued and then starts a new turn, so "stop all" does not prevent a later follow-up. User-initiated only (the composer is the only source). |
| SEC-12 | Informational | New | `src/runtime/agent-workspace.ts:174-186` | `lastDispatch` is recorded before `handle.send` returns, so a message rejected as `queue_full`/`duplicate`/`unavailable` blocks an immediate retry for 2 seconds as a false duplicate. No security impact. |
| SEC-13 | Informational | New | `src/main.ts:994,1000-1006,1115-1124` | `/clear` guards transcript writes with `disposed`, but an in-flight turn can still append to `docs/TIMELINE.md` (and complete an already-running tool call) after the clear. This matches the documented stop-all limitation; no transcript resurrection occurs. |
| SEC-14 | Informational | New | `src/runtime/subagents.ts:108-113`; `src/runtime/agent-workspace.ts:159-166` | `getSubAgent` falls back to name lookup, and `send()` uses it for the display name/queued count. Routing itself is strictly by id/handle (no misrouting found), but the name fallback keeps a non-id code path in a security-sensitive module. |

### SEC-01 detail (High, blocking)

`executeToolWithReview` is called for sub-agents with `quiet: true` (`src/main.ts:915-929`). The `quiet` flag correctly suppresses only output, never the review itself: the approval queue, `promptAcceptReject`, and the post-approval `shouldAbort` checks all still run. However, the line that renders the proposed change before the prompt is also skipped:

```ts
if (!quiet) printToolResult(toolName, { ... }, { needsApproval: true, proposedChange });
const decision = await withPrompt(() => promptAcceptReject('Accept this change?', requester));
```

The sub-agent transcript does not compensate: `transcriptToUiEntries` (`src/ui/workspace-view.ts:508-552`) renders `tool.start` with the argument summary only and `tool.end` with `applied path +n -m`; the diff content is recorded nowhere. `promptAcceptReject` receives no path. Because the navigator is frozen while `approvalPromptState()` is set (`src/ui/tui.tsx:793`), the user cannot even switch to the requesting agent during the modal. Net effect: a background sub-agent can obtain approval for an unseen file modification, and no diff is available before or after the action anywhere in the UI. This is a regression from `master`, where delegated tool calls used the non-quiet path and printed the diff.

**Impact:** informed consent for sub-agent file writes is defeated; a prompt-injected sub-agent can land arbitrary changes with a single `Y`.

**Fix (backend-expert, with frontend-expert):** write a `diff`/proposal entry into the sub-agent transcript before prompting (or expose `proposedChange` through the transcript entry type), include the target path in the prompt text (`Accept this change to <path>?`), and either keep the diff viewer in the main log or show the diff in the approval panel. The runtime already has the `ProposedFileChange` at `src/main.ts:651`; this can be recorded without changing execution semantics.

### SEC-02 detail (High, pre-existing baseline)

`isCommandApprovalRequired` approves only `mcp_*`, `bash:execute`, `git:commit`, and `git:push`. `bash:start` executes any non-denylisted command as a persistent process (`src/tools/index.ts:705-722`). The denylist is five patterns (`src/tools/index.ts:567-573`); any interpreter (`python3 -c …`, `node -e …`, `bash -c …`) bypasses it. The cwd is forced inside the project root, but code can still read the user's home directory, use the network, and persist. This exists on `master` unchanged; the workspace branch amplifies exposure because background follow-up turns can call it while the user is not watching and `quiet` removes the tool-call line from the main log.

**Impact:** in the default `ask` mode an agent can execute arbitrary code without the approval prompt that gates `bash:execute`.

**Fix (backend-expert):** add `bash:start` (and decide explicitly for `bash:stop`, `browser:verify`) to `isCommandApprovalRequired`, or gate every `bash:*` tool except `bash:read`; keep the denylist as defense in depth.

### SEC-03 detail (Medium)

The main transcript path sanitizes at append time: `addEntry` calls `cleanAnsi`, which strips CSI, OSC, and CR (`src/ui/tui.tsx:338-352,1318`). The new workspace path does not:

- `transcriptToUiEntries` returns `UiEntry` objects straight into `<text>`/`<markdown>` (`src/ui/workspace-view.ts:508-552`; `src/ui/tui.tsx:694`).
- `formatAgentRow` flattens whitespace with `\s+`, which does not remove ESC/BEL/DCS, and `clipText` slices code points without sanitizing (`src/ui/workspace-view.ts:93-100,171-172`).
- `formatContentStatus` prepends `@` + agent name without flattening (`src/ui/workspace-view.ts:298`).
- `bannerText` renders the approval label and notices through `clipText` only (`src/ui/tui.tsx:618-620,1085`).

Verified with a read-only probe: `formatAgentRow` preserved `\x1b[2J` / `\x1b]0;…\x07` in the label/segments, and `transcriptToUiEntries` preserved ESC in tool output. Model output and tool output are untrusted, and repo content commonly reaches both.

**Impact:** terminal escape injection can clear the screen, set the window title, write the clipboard (OSC 52), create forged hyperlinks, or draw content that impersonates the navigator/approval chrome. The main log has the same class of exposure mitigated; the new surfaces bypassed the mitigation.

**Fix (frontend-expert, with backend-expert for single-line runtime fields):** add one shared display sanitizer that strips all C0/C1 controls (including lone ESC, BEL, DCS, CR), strips CSI/OSC, and flattens single-line fields; apply it at the render boundary for every workspace string (transcript content, navigator label/meta, content status, composer prefix/placeholder, banner). Add negative tests with ESC/OSC/CR payloads. Hardening `cleanAnsi` itself to cover lone ESC and non-CSI sequences is recommended.

### SEC-04 detail (Medium)

Agent names are file basenames (`src/agents/index.ts:35-40`; `src/runtime/agent-folder.ts:136-144`) with no validation. The approval prefix is `[` + name + `] ` (`src/ui/index.ts:294`). A project agent file named `main.md` therefore produces:

```
? [main] Allow terminal command? rm -rf build
```

and a navigator child row also labelled `main` (duplicate-name disambiguation only compares siblings, so main vs sub-agent is never flagged). The same label flows into the approval banner and the composer prefix. Newlines and escape characters in the name are displayed (SEC-03).

**Impact:** social engineering of the approval decision; a sub-agent action can be attributed to `main` or to another trusted-sounding agent.

**Fix (backend-expert, with frontend-expert):** reject or rewrite the reserved display name `main` for sub-agents (for example render `main (sub-agent #<id6>)`), include a sub-agent marker or id in the approval label, strip control characters from names at load and at display, and validate agent filenames (no control characters) during `loadProjectAgents`.

### SEC-05 detail (Medium)

`transcriptToUiEntries` splits each tool result into lines and pushes one entry per line (`src/ui/workspace-view.ts:531-537`). One 8,000-char result made of short lines yields thousands of entries; the 256 KiB per-agent cap permits roughly 32 such results. The sub-agent memo recomputes the full mapping on every `transcriptRevision` bump, which fires for every streamed assistant delta of the selected agent (`src/ui/tui.tsx:561-566,690-695`). Separately, `clampTranscript` copies the entry array and recomputes total bytes on every event (`src/runtime/agent-transcript.ts:90-113,299-302`), so a large transcript also costs an O(transcript-bytes) copy per delta.

**Impact:** a line-heavy `bash:execute`/file-read result can stall the TUI while the agent is selected (availability; model-triggered). Unselected agents do not render, which limits the blast radius.

**Fix (frontend-expert, with backend-expert):** cap rendered lines per tool result (for example first 200 lines plus "… N more lines") and collapse the result into one or two entries; memoize conversion per entry id; consider recording a pre-truncated result summary at append time.

### SEC-06 detail (Medium)

`delegatedSessions` retains every session for follow-ups (`src/main.ts:720`). A session holds a `NimClient`, the full `messages` conversation (tool results are not capped there), the tool definitions, and a lazily created checkpoint (`ensureDelegatedCheckpoint`). Nothing bounds the number of agents, the conversation length per agent, or the checkpoint count, until `/clear` or process exit. Each `bash:start`/read result also stays in `session.messages` indefinitely.

**Impact:** memory and disk exhaustion from many delegations or long follow-up conversations; a prompt-injected model can fan out delegations within the existing 20-minute main budget. Local availability only.

**Fix (backend-expert):** cap retained sessions (for example keep the N most recent terminal agents and mark older ones unavailable), cap stored conversation size (drop or summarize old tool results), and cap/reuse checkpoints per agent.

## Areas checked and found clean

- **Message routing integrity:** routing is strictly by stable id (`handles` map, `MAIN_AGENT_ID`, `AgentHandle.send`); unknown ids are rejected and never fall back to main/parent; parent redirect does not exist; duplicate display names do not affect dispatch; `registerHandle` silently refuses `main`/empty ids. Covered by `tests/unit/agent-workspace.test.ts` (two agents with the same name, unknown ids, id-only routing).
- **Reserved main id (current call sites):** the only product call site passes `parentId = MAIN_AGENT_ID`, and `spawnSubAgent` renames a `main` request id to `main-2`. The latent non-main-parent case is SEC-09.
- **Approval enforcement:** `quiet` only suppresses prints; the approval queue, `promptCommandApproval`, `promptAcceptReject`, and `input.suspend/resume` are unchanged for sub-agents. `shouldAbort` is checked after approval and before command execution (`src/main.ts:628`) and before applying accepted/auto file changes (`src/main.ts:639,656`). Follow-up turns reuse the same stored `permissionMode`, `allowedCommands`, project root, agent definition, and tool definitions; there is no alternate execution path. `plan:update` is special-cased only in the main loop and is not in delegated tool definitions.
- **Queued messages and approvals:** queued text only enters a session's FIFO and never resolves an approval; the approval key handlers are the only consumers of Y/A/N.
- **Approval prompt vs secret/picker:** the key handler dispatches secret mode first, then the picker, then the workspace, then `dispatchKey` (which invokes approval listeners); an approval arriving during a secret prompt or picker cannot receive those keystrokes. The approval banner is displayed during a secret prompt, but keys remain owned by the secret prompt. No secret draft or key material is routed to the approval handler. (Focus can remain on the navigator/composer per the pre-existing prompt flow; no security impact found.)
- **Cancellation scoping:** follow-up Escape/Ctrl+C cancellation is allowed only when that agent is selected; main cancellation is unchanged and global; `Ctrl+X Ctrl+K` cancels everything. `mainStopRequested` is reset at every main turn start, and both `runToolLoop` call sites are reached only after that reset.
- **Transcript isolation and caps:** assistant deltas and tool ends require matching `agentId` + `messageId`/`callId`; entries are per-agent; 500-entry, 256 KiB, and 8,000-char caps are enforced with a single `truncated` marker (tests pass).
- **Persistence and secrets:** the new transcript/workspace/tree modules perform no file I/O; transcripts are memory-only and cleared on `/clear`. No new environment variables, no `.env.example` change, no new dependencies.
- **Secret scan:** no key/token patterns in the branch diff (details below).
- **Lifecycle/cleanup:** TUI subscriptions (`agentTranscripts`, `agentWorkspace`, selection), the resize listener, and the live/leader/notice/status timers are removed on cleanup; listener exceptions are isolated; tree cycle/orphan handling terminates.
- **`/clear` state integrity:** sessions are marked `disposed` before the workspace reset, transcript appends are guarded, queues are cleared, handles/registry/transcripts are cleared, and selection reconciles to main. Stale UI drafts are SEC-08; post-clear timeline writes are SEC-13.
- **Stop-all:** cancels main and every registered handle, clears main and per-session queues, counts live requests, and cannot apply a just-approved file change because of the post-approval `shouldAbort` checks. The unwind race is SEC-11.

## Critical/high deployment gate

**Critical/high findings are open.** Deployment is blocked under the workflow rule.

- **SEC-01 (High, introduced by this branch):** fix before deployment. **backend-expert** records the proposed diff in the sub-agent transcript and passes the path/proposal into the approval prompt; **frontend-expert** renders the diff entry and keeps the approval UI readable.
- **SEC-02 (High, pre-existing on `master`):** not introduced by this branch, but it is an open baseline issue. **backend-expert** should add `bash:start` to `isCommandApprovalRequired` (or gate all `bash:*` except `bash:read`). Project-manager should decide whether this blocks this deployment or is scheduled separately; the security gate itself does not exempt it because it exists on `master`.

All branch-specific findings other than SEC-01 are medium, low, or informational.

## Verification performed

Commands were run against the working tree at `HEAD d8e4893` unless noted. Nothing was modified except this document and the mandatory log entry.

| Check | Exact result |
|-------|--------------|
| `git log --oneline master..HEAD` | 6 commits: `694f983`, `21cf5b8`, `5191664`, `ec9ecb7`, `129c453`, `d8e4893` |
| `git diff master...HEAD --stat` | 36 files, +6372 / -202; `src/main.ts`, 4 new runtime modules, 2 new UI modules, `tui.tsx`, tests, docs |
| `git diff master...HEAD --name-only` filtered for `package|lock|env` | no matches (no dependency or environment changes) |
| `bun run typecheck` | exit 0 (`tsc --noEmit`, no output) |
| `bun run test` | 43 files passed, 1 skipped; **394 passed, 2 skipped**; exit 0 |
| Targeted workspace suites (`agent-workspace`, `agent-transcript`, `workspace-view`, `subagents`, `agent-tree`, `agent-selection`) | 6 files, **124 passed**; exit 0 |
| `bun audit` (read-only; no `bun audit fix`) | `2 vulnerabilities (2 moderate)`: `glob` GHSA-3g3m-2fjr-6pw4 and `minimatch` GHSA-g3hv-75wg-m249. **No high or critical advisories.** Pre-existing: no dependency changes on this branch. |
| Secret scan over `git diff master...HEAD` | `grep -cEi` for `sk-…`, `ghp_…`, `github_pat_`, `AKIA…`, `xox[baprs]-`, `BEGIN … PRIVATE KEY`, `nvapi-…` returned **0 matches**; keyword scan showed only documentation prose ("secret prompt", "API key"). Working tree contains only `docs/TIMELINE.md` plus an untracked `docs/changes/` log fragment. |
| Probe: `formatAgentRow` with an ESC/OSC agent name and activity | `row-has-ESC: true` (escape sequences survive into `label`/`segments`) |
| Probe: `transcriptToUiEntries` with a tool result containing ESC and 4,000 lines | `ui-entries: 4003`, `first-line-has-ESC: true` |
| Probe: `spawnSubAgent("main", "x", "task", 0, "other-parent")` | returned `"main"`, `equals MAIN: true` (latent, non-main parent) |

**Not verifiable locally (manual/real-TTY required):**

- Actual terminal interpretation of the injected CSI/OSC sequences and the real visual impact of forged chrome.
- The interactive approval flow for sub-agent file changes (no diff shown) in a real TTY.
- Real provider/model behavior and prompt-injected tool output; no API key was used.
- Exact focus behavior after an approval that arrives while a secret/picker prompt is open (code path reviewed; not exercised interactively).
- `bun audit` advisories depend on the registry's current advisory database; the two moderate results may change over time.

## False-positive caveats

- **SEC-02** is a pre-existing design gap on `master`, not a regression from this branch. It is reported because the audit is the baseline security record and because background sub-agents make it substantially easier to exploit unnoticed. If the intended policy is that persistent processes are exempt from approval, that decision should be documented explicitly; the current five-pattern denylist is not an adequate substitute.
- **SEC-03**: the main log already renders model/tool text, so terminal escape exposure is not entirely new. The finding is scoped to the new surfaces bypassing the existing `cleanAnsi` mitigation and to the ability to forge the navigator/approval chrome.
- **SEC-05** requires the affected agent's transcript to be selected for the repeated reconversion cost; unselected agents only pay the O(bytes) append-time cost.
- **SEC-06** depends on expected delegation volume; a single run is modest, but there is no upper bound in code.
- The `glob` advisory result lists `glob@14.0.6` even though the quoted range ends at `14.0.1`; the output is reported verbatim from `bun audit` rather than reinterpreted.

---

## Re-audit — 2026-11-23 (HEAD `6278313`)

- **Branch:** `feat/subagent-workspace`
- **HEAD audited:** `62783135ca09efe670b4a39306a52c225688f370`
- **Baseline audit:** commit `cc1f347` / tree `d8e4893` (the audit above).
- **Fix commits in scope:** `6cb962c579d9ed9664ea6498dbe4b51f8850b935` (backend approval detail, command gating, identity), `e19b209df585d631ac8e5eb8bee28b019a1482fe` (UI sanitizer, approval panel, draft cleanup), `62783135ca09efe670b4a39306a52c225688f370` (52 regression tests).
- **Working tree:** `M docs/TIMELINE.md` plus one untracked change-log fragment under `docs/changes/`; no product-code changes.
- **Method:** every baseline finding re-checked against HEAD; targeted probes for claims that have no test; typecheck, full test suite, build, `bun audit`, and a secret scan.

### Revised findings

| ID | Baseline severity | Status at HEAD `6278313` | Evidence |
|----|-------------------|--------------------------|----------|
| SEC-01 | High | **Fixed** (high closed) | Detail builders and prompt wiring `src/main.ts:559-579,627-638,642-654,665-704,961-965`; panel `src/ui/workspace-view.ts:453-480`, `src/ui/tui.tsx:615-628,1130-1141`; tests `tests/unit/workspace-view.test.ts:840-921` |
| SEC-02 | High | **Fixed** for the required tool set (high closed) | `src/runtime/permissions.ts:27-53`; `src/main.ts:641-654`; tests `tests/unit/permissions.test.ts:1-137` |
| SEC-03 | Medium | **Partially fixed** | `src/ui/display-text.ts`; workspace surfaces in `src/ui/workspace-view.ts`; shared `cleanAnsi` at `src/ui/tui.tsx:342-346`; tests `tests/unit/display-text.test.ts`, `tests/unit/workspace-view.test.ts:923-1115`. Residual raw paths are new finding SEC-15 |
| SEC-04 | Medium | **Partially fixed** | `src/runtime/subagents.ts:18-32,138-141`; `src/ui/workspace-view.ts:109-135,199-215,326-329`; tests `tests/unit/subagents.test.ts:242-298`, `tests/unit/workspace-view.test.ts:963-1008`. Residuals below |
| SEC-05 | Medium | **Fixed (bounded)** | `src/ui/workspace-view.ts:567-615`; caps `src/runtime/agent-transcript.ts:56-58,90-113`; tests `tests/unit/workspace-view.test.ts:1016-1115`; probe below |
| SEC-06 | Medium | **Open (expected)** | `src/main.ts:752,783-788,1137`; no retention/conversation/checkpoint caps added |
| SEC-07 | Low | **Fixed** | `src/runtime/agent-workspace.ts:179-190`; test `tests/unit/agent-workspace.test.ts:320-341` |
| SEC-08 | Low | **Partially fixed** | Draft cleanup `src/ui/tui.tsx:553-568`; scroll maps `src/ui/tui.tsx:118-120,267-280` are still never cleared |
| SEC-09 | Low | **Fixed** | `src/runtime/subagents.ts:138-141`; tests `tests/unit/subagents.test.ts:105-130`; probe returned `main-2` for a non-main parent |
| SEC-10 | Low | **Open (unchanged)** | `src/main.ts:934-935`; `src/runtime/agent-transcript.ts:178-192` (`findIndex` updates only the first matching `callId`) |
| SEC-11 | Informational | **Open (unchanged)** | Stop-all race, `src/main.ts:790-800` region |
| SEC-12 | Informational | **Open (unchanged)** | `lastDispatch` is still set before the queue decision (`src/runtime/agent-workspace.ts:174`), including the new `queue_full` branch |
| SEC-13 | Informational | **Open (unchanged)** | `/clear` guards transcript writes only (`src/main.ts:755-758`) |
| SEC-14 | Informational | **Open (unchanged)** | Name fallback remains in `getSubAgent` (`src/runtime/subagents.ts:128-132`) |

### SEC-01 re-check (High → closed)

The delegated path now passes `onProposedChange` and a sanitized requester label (`src/main.ts:961-965`). Before the prompt, `onProposedChange` appends a transcript status entry `approval needed: <path> (+N −M)` and sets the agent activity (`src/main.ts:961-965`); the status entry survives the decision and renders as `— Waiting · approval needed: <path> (+N −M)` (probe; `src/ui/workspace-view.ts:617-619`). The prompt itself names the path (`Accept change to <path>?`, `src/main.ts:683`) and the approval panel shows the kind, path, diff stats and up to four diff preview lines (`src/main.ts:569-579`), clipped to six detail lines and terminal width (`src/ui/workspace-view.ts:453-480`). The panel is global, so it is visible regardless of the selected workspace (`src/ui/tui.tsx:615-628,1130-1141`).

`quiet` still only suppresses prints: review, the approval queue, `promptCommandApproval`/`promptAcceptReject`, `input.suspend/resume`, and the post-approval `aborted()` checks before command execution and before applying (`src/main.ts:639-704`, checks at 656, 667, 688) are unchanged. There is no delegated execution path that skips them.

Residual (not blocking): the transcript records path and diff stats, not the diff body; only four preview lines are shown at decision time; and a file diff or command line can contain secrets from the reviewed content (the command was already printed by the pre-existing prompt). See SEC-17 for a way the preview can be truncated.

### SEC-02 re-check (High → closed)

`isCommandApprovalRequired` now covers `mcp_*`, `bash:execute`, `bash:start`, `bash:stop`, `browser:verify`, `git:commit`, `git:push` (`src/runtime/permissions.ts:27-35`). `supportsPersistentApproval` persists only exact-command tools and excludes MCP, `bash:stop` and `browser:verify` (`src/runtime/permissions.ts:37-40`); `commandApprovalKey` keys `bash:stop` by `session_id` and `browser:verify` by `base_url` (`src/runtime/permissions.ts:42-53`). Tests cover the gate set, persistence rules and keys (`tests/unit/permissions.test.ts`).

Gating cannot be dodged with wire names: tool calls are canonicalized by `fromWireToolName` before the loop sees them (`src/llm/client.ts:91-94,151,261,407,735,956`) and `executeTool` uses the same mapper (`src/tools/index.ts:184`). MCP names are always generated as lowercase `mcp_…` (`src/runtime/mcp.ts:154-156`). `bash:execute` with `background: true` or an auto-backgrounded dev-server command still passes through the `bash:execute` prompt (`src/tools/index.ts:600-602`). File tools only produce a `ProposedFileChange`; writes happen in `applyFileChange` after approval/files/auto (`src/tools/index.ts:263-308`, `src/main.ts:665-704`).

`auto` mode intentionally skips all prompts (`src/main.ts:642,666`); the `/permission auto` output says "AUTO-ACCEPT (files and terminal commands run without prompts)" (`src/main.ts:2438`), and it is selectable via `AGENT_TERMO_PERMISSION_MODE=auto` / `AGENT_TERMO_AUTO_APPROVE=1` (`src/main.ts:1828-1831`). This is intentional and user-selected, but it is not yet written in `docs/architecture.md`; documenting it is recommended.

Remaining execution paths outside the gate are **SEC-16** (automatic project-check scripts) and **SEC-18** (`memory:remember`). `bash:stop` gating does not block the user's own stop: the TUI Ctrl+K stop calls the terminal stop handler directly (`src/ui/tui.tsx:931-940`).

### SEC-03 / SEC-04 / SEC-05 / SEC-08 re-check

- **SEC-03:** `src/ui/display-text.ts` strips 7/8-bit CSI, OSC, DCS/SOS/PM/APC, remaining C0/C1 controls, DEL and CR; it is linear and preserves newlines on request. It is applied at the render boundary for navigator rows, content status, composer prefix/placeholder, transcript entries and labels, approval panel and rejection notice (`src/ui/workspace-view.ts:100-101,118,199-215,326-329,432-446,462-480,578-629`; `src/ui/tui.tsx:342-346,656-661`). Sanitization happens before width clipping (tests at `tests/unit/workspace-view.test.ts:912-921`). New surfaces are covered; the main log and terminal/picker paths are not fully covered — **SEC-15**.
- **SEC-04:** any-case `main` gets `#id6` in the navigator, content status, composer and approval label (`src/runtime/subagents.ts:28-32`; `src/ui/workspace-view.ts:119-135,199-215`), and control characters are stripped at display. Residual: zero-width/bidi format characters are not stripped, so `ma\u200Bin` displays as `main` and is not id-suffixed (probe); Unicode homoglyphs (`мain`, `ｍａｉｎ`) are likewise not normalized; duplicate sibling names are disambiguated only among direct siblings, and approval labels never carry an id for non-`main` names, so two same-named sub-agents are indistinguishable in prompts; agent filenames are still not validated at load. Recommended follow-up: strip Unicode `Cf` (at least U+200B–200F, U+202A–202E, U+2066–2069), NFKC-normalize before the `main` comparison, and append `#id6` to every sub-agent approval label.
- **SEC-05:** each tool result renders at most one status line, 40 continuation lines and one `… N more line(s)` marker (`src/ui/workspace-view.ts:567-615`). Probe: a 4,000-line result produced 44 UI entries, and a 4,000-line stored result produced 43. Transcript caps (500 entries / 256 KiB / 8,000 chars per entry) are unchanged and still enforced (`src/runtime/agent-transcript.ts:56-58,90-113`); extra approval status entries are deduplicated when consecutive and then counted by the same caps (`src/runtime/agent-transcript.ts:193-208`). Residual: conversion is still recomputed on every streamed delta of the selected agent; worst case is bounded by the caps (~500 entries, ~256 KiB, ≤~21k UI entries) and is accepted; memoizing per entry id remains an optimization, not a security requirement.
- **SEC-08:** drafts for ids that no longer exist are deleted after selection reconciliation, except `main` (`src/ui/tui.tsx:553-568`). Scroll position and at-bottom maps are not cleaned, so a reused id can inherit an old scroll position; not a data exposure.

### New findings (re-audit)

| ID | Severity | New? | Location | Finding |
|----|----------|------|----------|---------|
| SEC-15 | Medium | Pre-existing (discovered now) | `src/ui/tui.tsx:369-377,1114-1127,1100,1370-1373`; `src/main.ts:1836-1838,2049-2052` | Raw render paths outside the new sanitizer: (a) streamed assistant deltas are appended verbatim to the main-log markdown entry and, without a renderer, written verbatim to stdout (`appendAssistantDelta`); probe `STREAM-BEGIN>a\x1b[2Jb<STREAM-END` shows the ESC reaching output; (b) picker and completion labels render project/agent-derived strings raw (agent names from filenames, agent descriptions and project file paths); (c) the terminal panel header renders the bash command raw (`$ {terminal()!.command}`). Impact: model- or repo-controlled terminal escape injection in the main flow (same class as SEC-03); (c) is lower impact because the command is already approved when shown. Fix: sanitize deltas with a streaming-safe filter (or sanitize the accumulated entry at render), sanitize picker/completion labels at creation/render, and sanitize the terminal command in `startTerminalPanel` or at render. |
| SEC-16 | Medium | Pre-existing (discovered now) | `src/runtime/checks.ts:69-83`; `src/runtime/verify.ts:132-152`; `src/main.ts:1019-1020,1486-1487` | The completion gate auto-runs the project's `package.json` typecheck/lint/test/build scripts through `executeTool('bash:execute', …)` without an approval prompt in every permission mode. A cloned/malicious repository controls the script body and the runner; the child inherits the CLI environment (provider keys). Reachable when code files changed, the task looks verifiable, and no passing check command was recorded. The terminal panel shows the command after it starts, but nothing is printed or approved first. Rated medium under the baseline threat model, which treats the chosen project directory as trusted; **if cloned repositories are considered untrusted for this deployment, re-rate High — it would then block.** Fix: prompt once per project-check command in `ask` (and optionally `files`) mode, or explicitly document and disable the automatic run when the user has not opted in. |
| SEC-17 | Low | New (residual of the fix) | `src/ui/display-text.ts:29-36,53-101`; `src/ui/workspace-view.ts:462-480`; `src/main.ts:564-579` | Unterminated OSC/DCS/APC strings are dropped to end-of-string. Because `formatApprovalPanel` sanitizes the whole multi-line detail before splitting, an unterminated `ESC ]` / `ESC P` in the path or in one diff line silently suppresses that line and every later preview line. Probe: detail `…\n+before\x1b]8;;http://evil.example\n+line3\n+line4` rendered only `MODIFY …`, `+line1`, `+before`; the terminated variant rendered all lines. Impact: a crafted proposal can make the new approval preview content-poor (SEC-01 residual). Fix: split the raw detail on newlines first and sanitize each line independently (and sanitize the path separately), or replace control sequences with a visible marker instead of dropping the remainder. |
| SEC-18 | Low | Pre-existing (discovered now) | `src/tools/index.ts:83-89`; `src/memory/index.ts:76-85`; `src/llm/tools.ts:52-62` | `memory:remember` appends attacker-influenced text to `docs/MEMORY.md` without approval in every permission mode. The path is fixed and entries are capped at 4,000 characters, but `docs/MEMORY.md` is loaded into future system prompts, so this is a prompt-injection persistence vector outside the file-change review. Fix: route it through the `ProposedFileChange` review, or gate it like a state-changing tool. |

Additional informational note: `approvalRequesterLabel` appends `String(id).slice(0, 6)` without sanitizing the id (`src/runtime/subagents.ts:29-32`). Every current consumer sanitizes the final label (`promptAcceptReject`/`promptCommandApproval` print through `addEntry`; the panel sanitizes), so there is no current exposure, but sanitizing the suffix in the same helper is cheap defense in depth.

### Critical/high deployment gate (re-audit)

**No critical or high finding is open.** The two baseline high findings, SEC-01 and SEC-02, are closed. Deployment is **unblocked** under the workflow rule.

Remaining issues, documented/accepted for this deployment, none blocking:

- Medium: SEC-03 residual raw paths (SEC-15), SEC-04 residuals (invisible-character/homoglyph labels, sibling-name ambiguity), SEC-06 (unbounded delegated sessions/checkpoints, expected open), SEC-16 (automatic project-check execution).
- Low: SEC-08 scroll positions, SEC-10 duplicate tool-call ids, SEC-17 approval-preview truncation, SEC-18 memory write.
- Informational: SEC-11, SEC-12, SEC-13, SEC-14 unchanged.

Follow-ups recommended before or shortly after deployment: strip Unicode `Cf` and normalize before the `main` comparison (SEC-04); sanitize streamed deltas and picker/terminal-panel strings (SEC-15); decide the project-check approval policy and document it (SEC-16); decide the memory-write approval policy (SEC-18); split approval detail per line (SEC-17); cap retained delegated sessions (SEC-06).

### Verification performed (re-audit)

| Check | Exact result |
|-------|--------------|
| `git log --oneline d8e4893..HEAD` | `6278313` test, `e19b209` UI fix, `6cb962c` backend fix, `cc1f347` audit docs |
| `git diff --stat d8e4893..HEAD -- src tests` | 12 files, +1040 / -73 |
| `git diff --name-only d8e4893..HEAD` filtered for `package|lock|env` | no matches |
| Secret scan over the non-doc diff | 0 matches (patterns `sk-…`, `ghp_…`, `github_pat_`, `AKIA…`, `xox[baprs]-`, private-key header, `nvapi-…`) |
| `bun run typecheck` | exit 0 |
| `bun run test` | 45 passed / 1 skipped files; **446 passed, 2 skipped**; exit 0 |
| Targeted security suites (`display-text`, `permissions`, `subagents`, `workspace-view`, `agent-workspace`, `agent-transcript`) | 6 files, **151 passed**; exit 0 |
| `bun run build` | exit 0, `dist/cli.js` 271,741 bytes |
| `bun audit` (read-only) | `2 vulnerabilities (2 moderate)`: `glob` GHSA-3g3m-2fjr-6pw4, `minimatch` GHSA-g3hv-75wg-m249; no high or critical |
| Probe: case/whitespace `main` variants in row, content status, composer and approval labels | `main`, `MAIN`, `Main`, `" main "`, `main\t`, `main\n` all rendered with `#req-ab` |
| Probe: zero-width `ma\u200Bin` / `main\u200B` | rendered unchanged, **no id suffix** (SEC-04 residual) |
| Probe: approval panel with ESC/OSC/CR/DCS and 10k-char line | escapes stripped, max 7 lines (1 owner + 6 detail), clipped to width |
| Probe: unterminated OSC inside diff preview | later preview lines dropped (SEC-17) |
| Probe: 4,000-line tool result | 44 UI entries (1 tool + 1 status + 40 continuation + 1 overflow + 1 assistant) |
| Probe: sanitizer on 1 MB payloads (plain, 100k CSI, unterminated OSC, 500k lone ESC) | 1–16 ms, linear |
| Probe: `spawnSubAgent('main', …, 'other-parent')` | `main-2` (SEC-09 fixed) |
| Probe: `appendAssistantDelta` without a renderer | raw `\x1b[2J` written to stdout (SEC-15) |

**Not verifiable locally (manual/real-TTY required):**

- Real terminal interpretation of escape payloads on the streamed-delta, picker/completion and terminal-panel paths (raw-string probes only).
- The interactive sub-agent file approval in a real TTY (panel content verified by unit tests plus code review; `executeToolWithReview`/`onProposedChange` have no direct automated test).
- Approval arriving while a secret/picker prompt is open (code-reviewed only, unchanged).
- Live provider streaming behavior; no API key was used.
- `bun audit` advisories depend on the registry's advisory database and may change.
