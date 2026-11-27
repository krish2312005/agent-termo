# TERMO GitGraph

TERMO GitGraph is a read-only Git and GitHub explorer built into the Agent-Termo terminal.

## Commands

- `/git` or `/git graph [limit]` — show the commit graph. The default is 80 commits; the maximum is 300.
- `/git info` — show repository, current branch, working-tree state, origin, commit count, and branch counts.
- `/git branches` — list local and remote branches.
- `/git commit [hash]` — choose a recent commit or inspect a commit by its hexadecimal hash.
- `/git github` — show GitHub repository details, open pull requests, issues, and recent Actions runs.
- `/git help` — show command usage.

## Commit graph

The graph is rendered as native OpenTUI rows, not Git's raw ASCII `--graph` output. Each commit has a visible node, short hash, subject, branch/tag labels, author, and relative date. Merge commits use a distinct diamond node. Ancestry lanes use separate, stable colors and connector shapes so parallel branches remain visually distinguishable while scrolling.

The graph is newest-first: the current tip is near the top and ancestry extends toward the bottom. The rows live in Agent-Termo's normal scrollable transcript.

## GitHub connection

Local GitGraph works with Git alone. The GitHub view uses the official GitHub CLI (`gh`) and its existing authentication:

1. Install GitHub CLI: https://cli.github.com/
2. Authenticate once with `gh auth login`.
3. Ensure the current repository has a GitHub origin remote.
4. Run `/git github`.

Agent-Termo invokes `gh` with argument arrays, never through a shell, and does not read, store, or print GitHub tokens. If `gh` is unavailable or unauthenticated, local graph and repository views remain usable.

## Safety and scope

GitGraph is read-only. It does not checkout, commit, push, fetch, reset, rebase, merge, or modify repository files. Commit inspection uses Git's no-external-diff mode and displays metadata and file statistics.
