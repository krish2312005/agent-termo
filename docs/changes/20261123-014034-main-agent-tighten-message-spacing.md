# tighten message spacing

- **Agent:** main-agent
- **When:** 2026-11-23 01:40 PST
- **Branch:** local-branch

Why: The blank row added above every chat entry left too much vertical space between lines.
Changed:
- src/ui/tui.tsx — remove the per-entry marginTop; entries now stack compactly under their role label.
Verify: bun run typecheck (exit 0); bun run test (228 passed / 2 skipped); bun run build (dist/cli.js).
Revert: git revert <this-commit>
