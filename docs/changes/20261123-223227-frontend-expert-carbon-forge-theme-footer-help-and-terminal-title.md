# carbon forge theme footer help and terminal title

- **Agent:** frontend-expert
- **When:** 2026-11-23 22:32 PST
- **Branch:** feat/carbon-forge-theme

Why: Apply the Carbon Forge theme to the live TUI, replace the hint/status rows with the single-line footer, make /help registry-driven, and set/restore the terminal title (DESIGN_SYSTEM §11, user brief).
Changed:
- src/ui/tui.tsx — every live hex now comes from ROLES; removed permissionBarColor and the bright-red permission border (focus-only lime/border); added pure formatFooter (canonical line, drop order, permission never dropped, final … clip) and getCommands(); removed the navigator hint row and old bottom status line, added one footer row; sub-agent names/labels teal, selected lime, tools copper, info teal, errors red; markdown SyntaxStyle roles; header/terminal/picker/approval surface fills.
- src/ui/index.ts — Chalk fallback rethemed with COLORS via Chalk.hex (MarkdownPrinter/inline); COMMANDS descriptions corrected, aliases added, /mcp folded in once; project flag; helpMarkdown/printHelp built from the live command registry with Commands and Shortcuts sections and the audited real bindings.
- src/ui/subagent-view.ts — legacy Chalk colors replaced with Carbon Forge hexes; output content unchanged.
- src/ui/terminal-title.ts — new pure OSC 2 + xterm title-stack (CSI 22;2t / 23;2t) sequences, process.title set/restore, injectable IO, idempotent install, one process exit fallback, no-op without a TTY.
- src/main.ts — terminal title install at runRepl start and restore in cleanup after teardown; removed the ad-hoc /mcp completion append and marked project commands (registry plumbing only; no runtime/session/model changes).
- src/cli.ts — terminal title installed before the API-key prompt.
- tests/unit/permission-colors.test.ts — obsolete permission-color assertions replaced with the composer border role contract; terminalPanelHeight tests kept.
Verify: bun run typecheck exit 0; bun run test 45 files passed/1 skipped, 446 passed/2 skipped; bun run build clean (dist/cli.js); legacy-hex grep gate clean in src/ui; formatFooter canonical line and 40/80/120 drop order checked by script; terminal-title save/set/restore sequences and idempotency checked by script with fake IO. No live TTY: VS Code title and 40/80/120-column TUI rendering remain manual.
Revert: git revert this commit (git-manager), or restore the files above; no dependency or data changes.
