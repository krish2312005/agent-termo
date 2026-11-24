# Agent-Termo Security Audit Report

**Project:** Agent-Termo  
**Date:** 2026-11-24  
**Auditor:** security-expert (delegated sub-agent)  
**Branch Audited:** `feat/subagent-workspace`  
**Commit Audited:** `6278313` (HEAD after re-audit)  
**Baseline Audit Commit:** `d8e4893`  

---

## Executive Summary

Agent-Termo is a terminal-based AI coding agent that runs locally with no web server, remote authentication, or multi-tenant boundaries. The threat model treats the local user and their project directory as trusted; untrusted inputs include model output, tool output, and project-supplied agent definitions.

**Overall Risk Rating:** **MEDIUM** (no open critical/high findings; several medium/low issues remain)

**Deployment Gate:** **UNBLOCKED** — The two high-severity findings (SEC-01, SEC-02) from the baseline audit have been fixed. No critical or high findings remain open.

---

## Security Posture

| Aspect | Status |
|--------|--------|
| **Authentication/Authorization** | N/A (local CLI, no remote auth) |
| **Input Validation** | Partial — new sanitizer (`display-text.ts`) covers workspace surfaces; raw paths remain in main log, picker, terminal panel |
| **Injection Protection** | Partial — ANSI/escape sanitization applied to new surfaces; streamed deltas, picker labels, terminal panel header remain unsanitized |
| **Secrets Management** | Environment variables + `~/.agent-termo/config.json`; no secrets in code or git history |
| **Dependency Vulnerabilities** | 2 moderate advisories (`glob`, `minimatch`); no high/critical |
| **Approval/Review Gates** | Fixed for sub-agent file changes (SEC-01) and `bash:start`/`bash:stop`/`browser:verify` (SEC-02) |
| **Resource Exhaustion** | Unbounded delegated sessions/checkpoints (SEC-06); bounded transcript rendering (SEC-05 fixed) |

---

## Findings Summary (SEC-01 through SEC-18)

| ID | Severity | Status | Category |
|----|----------|--------|----------|
| SEC-01 | High | **FIXED** | Sub-agent approval content visibility |
| SEC-02 | High | **FIXED** | Missing approval gate for `bash:start`/`bash:stop`/`browser:verify` |
| SEC-03 | Medium | **PARTIALLY FIXED** | Terminal escape injection in new workspace surfaces |
| SEC-04 | Medium | **PARTIALLY FIXED** | Agent name spoofing / approval label confusion |
| SEC-05 | Medium | **FIXED (BOUNDED)** | Unbounded UI expansion from transcript tool results |
| SEC-06 | Medium | **OPEN** | Unbounded delegated session retention |
| SEC-07 | Low | **FIXED** | Main-agent queue cap bypass |
| SEC-08 | Low | **PARTIALLY FIXED** | UI drafts/scroll positions not cleared on `/clear` |
| SEC-09 | Low | **FIXED** | Reserved `main` id protection gap with non-main parent |
| SEC-10 | Low | **OPEN** | Duplicate tool-call ids within a turn |
| SEC-11 | Informational | **OPEN** | Stop-all race condition |
| SEC-12 | Informational | **OPEN** | False duplicate detection on queue rejection |
| SEC-13 | Informational | **OPEN** | `/clear` doesn't stop in-flight timeline writes |
| SEC-14 | Informational | **OPEN** | Name fallback in security-sensitive routing module |
| SEC-15 | Medium | **OPEN (NEW)** | Raw render paths: streamed deltas, picker, terminal panel |
| SEC-16 | Medium | **OPEN (NEW)** | Automatic project-check script execution without approval |
| SEC-17 | Low | **OPEN (NEW)** | Unterminated OSC/DCS truncates approval preview |
| SEC-18 | Low | **OPEN (NEW)** | `memory:remember` writes without approval |

---

## Detailed Findings

### SEC-01 — Sub-Agent Approval Content Visibility (HIGH → FIXED)

**Location:** `src/main.ts:559-579, 627-638, 642-654, 665-704, 961-965`; `src/ui/workspace-view.ts:453-480`; `src/ui/tui.tsx:615-628, 1130-1141`

**Original Issue:** Sub-agent file-change approvals were content-free — the diff viewer and tool result were suppressed by `quiet: true`, and the transcript never recorded the proposed diff. Users were asked "Accept this change?" with no path or content while navigation was frozen.

**Fix Applied:**
- `onProposedChange` callback now appends a transcript status entry: `approval needed: <path> (+N −M)`
- Approval prompt includes the target path: `Accept change to <path>?`
- Approval panel shows kind, path, diff stats, and up to 4 diff preview lines
- Panel is global (visible regardless of selected workspace)

**Residual Risk (Low):** Transcript records path and diff stats only, not full diff body. Only 4 preview lines shown at decision time. File diffs/command lines may contain secrets.

---

### SEC-02 — Missing Approval Gate for Persistent Commands (HIGH → FIXED)

**Location:** `src/runtime/permissions.ts:27-53`; `src/main.ts:641-654`

**Original Issue:** `bash:start`, `bash:stop`, and `browser:verify` were not in `isCommandApprovalRequired`. In default `ask` mode, an agent could launch arbitrary background shell commands without approval; only a 5-pattern denylist and project-root cwd check applied.

**Fix Applied:**
- `isCommandApprovalRequired` now covers: `mcp_*`, `bash:execute`, `bash:start`, `bash:stop`, `browser:verify`, `git:commit`, `git:push`
- `supportsPersistentApproval` persists only exact-command tools (excludes MCP, `bash:stop`, `browser:verify`)
- `commandApprovalKey` keys `bash:stop` by `session_id` and `browser:verify` by `base_url`
- Tool calls canonicalized by `fromWireToolName` before approval check

**Residual Risk:** `auto` mode intentionally skips all prompts (user-selected via env vars). Document this behavior in architecture docs.

---

### SEC-03 — Terminal Escape Injection in Workspace Surfaces (MEDIUM → PARTIALLY FIXED)

**Location:** `src/ui/display-text.ts`; `src/ui/workspace-view.ts`; `src/ui/tui.tsx:342-346`

**Original Issue:** New workspace surfaces (navigator rows, content status, composer prefix/placeholder, transcript entries, approval panel) rendered model/tool/agent-name text without `cleanAnsi` sanitization. Terminal escape/control sequences (CSI/OSC, BEL, lone ESC, CR, DCS) reached the terminal.

**Fix Applied:**
- New shared sanitizer `display-text.ts` strips 7/8-bit CSI, OSC, DCS/SOS/PM/APC, remaining C0/C1 controls, DEL and CR
- Applied at render boundary for: navigator rows, content status, composer prefix/placeholder, transcript entries/labels, approval panel, rejection notice
- Sanitization happens before width clipping

**Residual Risk (SEC-15):** Main log streamed deltas, picker/completion labels, and terminal panel header remain unsanitized.

---

### SEC-04 — Agent Name Spoofing / Approval Label Confusion (MEDIUM → PARTIALLY FIXED)

**Location:** `src/runtime/subagents.ts:18-32, 138-141`; `src/ui/workspace-view.ts:109-135, 199-215, 326-329`

**Original Issue:** Agent names from file basenames with no validation. A project agent named `main.md` produced `[main]` approval prompts and navigator rows indistinguishable from the real main agent. Control characters in names were displayed.

**Fix Applied:**
- Any-case `main` gets `#id6` suffix in navigator, content status, composer, and approval label
- Control characters stripped at display

**Residual Risk (Medium):**
- Zero-width/bidi format characters (U+200B–200F, U+202A–202E, U+2066–2069) not stripped → `ma\u200Bin` displays as `main` without id suffix
- Unicode homoglyphs (`мain`, `ｍａｉｎ`) not normalized
- Duplicate sibling names disambiguated only among direct siblings
- Approval labels never carry id for non-`main` names → two same-named sub-agents indistinguishable in prompts
- Agent filenames not validated at load

---

### SEC-05 — Unbounded UI Expansion from Transcript Results (MEDIUM → FIXED/BOUNDED)

**Location:** `src/ui/workspace-view.ts:567-615`; `src/runtime/agent-transcript.ts:56-58, 90-113`

**Original Issue:** `transcriptToUiEntries` split each tool result into lines, pushing one entry per line. One 8,000-char result yielded ~4,000 entries. Full mapping recomputed on every streamed delta of selected agent.

**Fix Applied:**
- Each tool result renders at most: 1 status line + 40 continuation lines + 1 overflow marker (`… N more line(s)`)
- Probe: 4,000-line result → 44 UI entries (was 4,003)
- Transcript caps unchanged: 500 entries / 256 KiB / 8,000 chars per entry
- Extra approval status entries deduplicated when consecutive

**Residual Risk (Low):** Conversion still recomputed on every streamed delta; worst case bounded by caps (~500 entries, ~256 KiB, ≤~21k UI entries). Memoization remains an optimization.

---

### SEC-06 — Unbounded Delegated Session Retention (MEDIUM → OPEN)

**Location:** `src/main.ts:752, 783-788, 1137`

**Issue:** `delegatedSessions` retains every session for follow-ups indefinitely. Each session holds a `NimClient`, full `messages` conversation (tool results not capped), tool definitions, and a lazily created checkpoint. No bounds on number of agents, conversation length per agent, or checkpoint count until `/clear` or process exit.

**Impact:** Memory and disk exhaustion from many delegations or long follow-up conversations. A prompt-injected model can fan out delegations within the 20-minute main budget.

**Recommended Fix:** Cap retained sessions (keep N most recent), cap stored conversation size (drop/summarize old tool results), cap/reuse checkpoints per agent.

---

### SEC-07 — Main-Agent Queue Cap Bypass (LOW → FIXED)

**Location:** `src/runtime/agent-workspace.ts:179-190`

**Issue:** Main-agent 10-message queue cap was bypassed when main was `idle` but no REPL question was pending.

**Fix Applied:** Cap check now applies regardless of idle state. Test added.

---

### SEC-08 — UI Drafts/Scroll Positions Not Cleared on `/clear` (LOW → PARTIALLY FIXED)

**Location:** `src/ui/tui.tsx:114-116, 553-568, 267-280`

**Issue:** Per-agent UI drafts and scroll positions never cleared on `/clear`. Agent ids can be reused after registry clear, so a draft typed to an old agent can reappear in a different agent's composer.

**Fix Applied:** Drafts for ids that no longer exist are deleted after selection reconciliation (except `main`).

**Residual Risk:** Scroll position and at-bottom maps not cleaned → reused id can inherit old scroll position. Not a data exposure.

---

### SEC-09 — Reserved `main` Id Protection Gap (LOW → FIXED)

**Location:** `src/runtime/subagents.ts:138-141`

**Issue:** `spawnSubAgent` protected reserved `main` id only by comparing derived id with `parentId`. With non-main parent, `requestId = "main"` returned id `"main"`.

**Fix Applied:** Now returns `main-2` for non-main parent. Tests added.

---

### SEC-10 — Duplicate Tool-Call IDs Within a Turn (LOW → OPEN)

**Location:** `src/main.ts:934-935`; `src/runtime/agent-transcript.ts:178-192`

**Issue:** Tool-call ids are namespaced per turn but not disambiguated within a turn. If model emits two calls with same id, both transcript entries share a `callId`; `tool.end` updates only the first (via `findIndex`), misattributing one result. Display-only.

**Impact:** Misattribution of tool results in transcript display.

---

### SEC-11 — Stop-All Race Condition (INFORMATIONAL → OPEN)

**Location:** `src/main.ts:790-800`

**Issue:** A message delivered after `cancelDelegatedSession` cleared the queue but before the turn's `finally` sets `running = false` is queued and then starts a new turn. "Stop all" does not prevent a later follow-up. User-initiated only (composer is only source).

---

### SEC-12 — False Duplicate Detection on Queue Rejection (INFORMATIONAL → OPEN)

**Location:** `src/runtime/agent-workspace.ts:174`

**Issue:** `lastDispatch` recorded before `handle.send` returns, so a message rejected as `queue_full`/`duplicate`/`unavailable` blocks an immediate retry for 2 seconds as a false duplicate.

---

### SEC-13 — `/clear` Doesn't Stop In-Flight Timeline Writes (INFORMATIONAL → OPEN)

**Location:** `src/main.ts:755-758`

**Issue:** `/clear` guards transcript writes with `disposed`, but an in-flight turn can still append to `docs/TIMELINE.md` (and complete an already-running tool call) after the clear.

---

### SEC-14 — Name Fallback in Security-Sensitive Module (INFORMATIONAL → OPEN)

**Location:** `src/runtime/subagents.ts:128-132`

**Issue:** `getSubAgent` falls back to name lookup, and `send()` uses it for display name/queued count. Routing is strictly by id/handle (no misrouting found), but the name fallback keeps a non-id code path in a security-sensitive module.

---

### SEC-15 — Raw Render Paths Outside Sanitizer (MEDIUM → OPEN, NEW)

**Location:** `src/ui/tui.tsx:369-377, 1114-1127, 1100, 1370-1373`; `src/main.ts:1836-1838, 2049-2052`

**Issue:** Three raw render paths bypass the new `display-text.ts` sanitizer:
1. **Streamed assistant deltas** appended verbatim to main-log markdown entry and written verbatim to stdout (`appendAssistantDelta`)
2. **Picker/completion labels** render project/agent-derived strings raw (agent names from filenames, descriptions, project file paths)
3. **Terminal panel header** renders bash command raw (`$ {terminal()!.command}`)

**Probe:** `STREAM-BEGIN>a\x1b[2Jb<STREAM-END` shows ESC reaching output.

**Impact:** Model- or repo-controlled terminal escape injection in main flow (same class as SEC-03). Terminal panel is lower impact (command already approved when shown).

**Recommended Fix:** Sanitize deltas with streaming-safe filter (or sanitize accumulated entry at render), sanitize picker/completion labels at creation/render, sanitize terminal command in `startTerminalPanel` or at render.

---

### SEC-16 — Automatic Project-Check Script Execution Without Approval (MEDIUM → OPEN, NEW)

**Location:** `src/runtime/checks.ts:69-83`; `src/runtime/verify.ts:132-152`; `src/main.ts:1019-1020, 1486-1487`

**Issue:** Completion gate auto-runs project's `package.json` typecheck/lint/test/build scripts through `executeTool('bash:execute', …)` without an approval prompt in **every** permission mode. A cloned/malicious repository controls the script body and runner; child inherits CLI environment (provider keys).

**Trigger:** Code files changed, task looks verifiable, no passing check command recorded.

**Risk Rating:** Medium under baseline threat model (chosen project directory = trusted). **If cloned repositories are considered untrusted, re-rate HIGH — would block deployment.**

**Recommended Fix:** Prompt once per project-check command in `ask` (and optionally `files`) mode, or explicitly document and disable automatic run when user has not opted in.

---

### SEC-17 — Unterminated OSC/DCS Truncates Approval Preview (LOW → OPEN, NEW)

**Location:** `src/ui/display-text.ts:29-36, 53-101`; `src/ui/workspace-view.ts:462-480`; `src/main.ts:564-579`

**Issue:** Unterminated OSC/DCS/APC strings are dropped to end-of-string. Because `formatApprovalPanel` sanitizes the whole multi-line detail before splitting, an unterminated `ESC ]` / `ESC P` in the path or one diff line silently suppresses that line and every later preview line.

**Probe:** Detail `…\n+before\x1b]8;;http://evil.example\n+line3\n+line4` rendered only `MODIFY …`, `+line1`, `+before`; terminated variant rendered all lines.

**Impact:** Crafted proposal can make approval preview content-poor (SEC-01 residual).

**Recommended Fix:** Split raw detail on newlines first and sanitize each line independently (and sanitize path separately), or replace control sequences with visible marker instead of dropping remainder.

---

### SEC-18 — `memory:remember` Writes Without Approval (LOW → OPEN, NEW)

**Location:** `src/tools/index.ts:83-89`; `src/memory/index.ts:76-85`; `src/llm/tools.ts:52-62`

**Issue:** `memory:remember` appends attacker-influenced text to `docs/MEMORY.md` without approval in every permission mode. Path is fixed and entries capped at 4,000 chars, but `docs/MEMORY.md` is loaded into future system prompts → prompt-injection persistence vector outside file-change review.

**Recommended Fix:** Route through `ProposedFileChange` review, or gate like a state-changing tool.

---

## Dependency Vulnerabilities

| Package | Advisory | Severity | Status |
|---------|----------|----------|--------|
| `glob` | GHSA-3g3m-2fjr-6pw4 | Moderate | Pre-existing, no fix available |
| `minimatch` | GHSA-g3hv-75wg-m249 | Moderate | Pre-existing, no fix available |

**Note:** No high or critical advisories. No dependency changes on this branch.

---

## Verification Results

| Check | Result |
|-------|--------|
| `bun run typecheck` | ✅ Exit 0 |
| `bun run test` | ✅ 45 files passed / 1 skipped, 446 passed / 2 skipped |
| `bun run build` | ✅ Exit 0, `dist/cli.js` 271,741 bytes |
| `bun audit` | ✅ 2 moderate, 0 high/critical |
| Secret scan (diff) | ✅ 0 matches for key/token patterns |
| Security regression suites | ✅ 6 files, 151 passed |

---

## Risk Assessment

### Critical Risk: **NONE**

### High Risk: **NONE** (both baseline high findings fixed)

### Medium Risk (Open):
1. **SEC-03/SEC-15** — Terminal escape injection in main log streamed deltas, picker, terminal panel
2. **SEC-04** — Invisible-character/homoglyph label spoofing, sibling-name ambiguity in approvals
3. **SEC-06** — Unbounded delegated sessions/checkpoints (availability, local only)
4. **SEC-16** — Automatic project-check execution (re-rate HIGH if cloned repos untrusted)

### Low Risk (Open):
5. **SEC-08** — Scroll positions not cleared on agent reuse
6. **SEC-10** — Duplicate tool-call id misattribution (display only)
7. **SEC-17** — Approval preview truncation via unterminated escape sequences
8. **SEC-18** — `memory:remember` prompt-injection persistence vector

### Informational (Open):
9. **SEC-11** — Stop-all race
10. **SEC-12** — False duplicate detection
11. **SEC-13** — `/clear` in-flight timeline writes
12. **SEC-14** — Name fallback in routing module

---

## Recommended Follow-Ups (Priority Order)

| Priority | Finding | Action |
|----------|---------|--------|
| **P0** | SEC-16 | Decide project-check approval policy; document or add prompt in `ask`/`files` mode |
| **P1** | SEC-15 | Sanitize streamed deltas, picker/completion labels, terminal panel command |
| **P1** | SEC-04 | Strip Unicode `Cf` chars, NFKC-normalize before `main` comparison, append `#id6` to all sub-agent approval labels |
| **P1** | SEC-18 | Gate `memory:remember` through file-change review or approval |
| **P2** | SEC-06 | Cap retained delegated sessions, conversation size, checkpoints |
| **P2** | SEC-17 | Split approval detail per line before sanitizing |
| **P3** | SEC-08 | Clear scroll position maps on agent removal |
| **P3** | SEC-10 | Disambiguate tool-call ids within a turn |
| **P4** | SEC-11,12,13,14 | Address informational items in future refactor |

---

## Deployment Decision

**Gate Status:** ✅ **UNBLOCKED**

No critical or high findings remain open. The two baseline high findings (SEC-01, SEC-02) have been fixed and verified with regression tests. All verification commands pass.

**Conditions for Deployment:**
1. Document `auto` mode behavior in architecture docs (intentional prompt bypass)
2. Track medium-risk items (SEC-03/15, SEC-04, SEC-06, SEC-16) for post-deployment fixes
3. Consider re-rating SEC-16 to HIGH if cloned repositories are treated as untrusted

---

## Appendix: Audit Methodology

- **Baseline Audit:** Commit `d8e4893` (branch `feat/subagent-workspace` vs `master`)
- **Re-Audit:** Commit `6278313` (fix commits `6cb962c`, `e19b209`, `6278313`)
- **Scope:** Multi-agent workspace feature (36 files, +6372/-202 lines)
- **Threat Model:** Local CLI, trusted user/project, untrusted model/tool/repo content
- **Verification:** Typecheck, full test suite, build, `bun audit`, secret scan, targeted probes
- **Limitations:** No real TTY available; live terminal interpretation, interactive approval flow, live provider streaming, and focus behavior during secret/picker prompts not exercised

---

*Report generated by security-expert sub-agent on 2026-11-24*