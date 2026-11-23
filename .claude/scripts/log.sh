#!/usr/bin/env bash
# Record an agent's work: writes docs/changes/<time>-<agent>-<title>.md and
# appends a row to docs/TIMELINE.md.
# Usage: bash .claude/scripts/log.sh <agent> "<title>" <<'EOF' ... EOF
set -euo pipefail

agent="${1:?usage: log.sh <agent> \"<title>\" < details}"
title="${2:?usage: log.sh <agent> \"<title>\" < details}"

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
mkdir -p docs/changes

when="$(date '+%Y-%m-%d %H:%M %Z')"
slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-50)"
name="$(date '+%Y%m%d-%H%M%S')-${agent}-${slug}.md"
branch="$(git branch --show-current 2>/dev/null || true)"

if [ -t 0 ]; then body="(no details given)"; else body="$(cat)"; fi

{
  echo "# $title"
  echo
  echo "- **Agent:** $agent"
  echo "- **When:** $when"
  echo "- **Branch:** ${branch:-n/a}"
  echo
  echo "$body"
} > "docs/changes/$name"

if [ ! -f docs/TIMELINE.md ]; then
  printf '# Timeline\n\n| When | Agent | Change | Details |\n|---|---|---|---|\n' > docs/TIMELINE.md
fi
printf '| %s | %s | %s | [%s](changes/%s) |\n' "$when" "$agent" "${title//|//}" "$name" "$name" >> docs/TIMELINE.md

echo "logged: docs/changes/$name"
