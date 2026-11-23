# Update MEMORY.md to match live stack and this flow

- **Agent:** project-manager
- **When:** 2026-11-23 00:43 PST
- **Branch:** local-branch

Why: docs/MEMORY.md was stale vs package.json and live code (openai 7.x, zod 4.x, simple-git 4.x, vitest 5.x, bun runtime, @opentui/solid TUI, no pkg/esbuild/tsx). Architect flagged it; project-manager owns MEMORY.md.
Changed:
- docs/MEMORY.md — corrected tech-stack/build tables, entry points, TUI/runtime, added the 3 bug fixes + verification, linked docs/architecture/* and plan.md.
Verify: facts match package.json (openai ^7.57.0, zod ^4.6.7, simple-git ^4.0.2, vitest ^5.1.0, packageManager bun@1.3.14, @opentui/solid 0.9.7).
Revert: git revert the MEMORY.md change on local-branch.
