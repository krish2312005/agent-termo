# record warm terminal palette revert in memory

- **Agent:** project-manager
- **When:** 2026-11-23 23:26 PST
- **Branch:** revert/carbon-forge-palette

Why: Record the user-directed revert of the Carbon Forge palette in project memory after implementation, tests, typecheck, and build all passed.
Changed:
- docs/MEMORY.md — Current Phase/Status and core-component token references now describe Warm Terminal; added the "Warm Terminal palette restore (2026-11-23 revert)" section with the restored palette, permission-border contract (#FF5555 restored), retained footer/help/title behavior, docs/tests, exact verification counts, skipped stages, commits, and honest limitations. Historical Carbon Forge section retained unchanged.
Verify: grep -n "Warm Terminal palette restore" docs/MEMORY.md; bun run test (514 passed / 2 skipped); bun run typecheck exit 0; bun run build exit 0.
Revert: git restore docs/MEMORY.md before this docs commit, or revert the docs commit.
