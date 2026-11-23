# fix log.sh trailing newline before append

- **Agent:** main-agent
- **When:** 2026-11-23 00:58 PST
- **Branch:** local-branch

Why: log.sh appended the TIMELINE row without ensuring the file ended in a newline, gluing the new row onto the previous line when the prior entry lacked a trailing newline.
Changed:
- .claude/scripts/log.sh — insert a newline before appending when the last byte is not one (guarded with `if` so `set -e` is not tripped).
Verify: run log.sh and confirm the emitted row starts on its own line (tail -3 docs/TIMELINE.md).
Revert: git checkout ed88804 -- .claude/scripts/log.sh
