---
name: stack:open-pr
description: "Open a Draft pull request for the current repo. Use when backend or general (non-frontend) work is ready for a PR; frontend work uses Plumb's stack:ship-pr instead. Fills the repo's PR template when one exists and links the Jira issue when provided."
allowed-tools: Read, Glob, Bash(git*), Bash(gh*)
---

<!-- Version: 2026-06-22 | Source: @browserstack/ai-harness | Do not remove this header -->

# Open a Draft PR

Opening a PR with `gh` (push the branch, resolve the base, write a clear title and body) is standard. Only the points below are specific to this harness:

- **Use the repo's PR template if it already exists.** When `.github/PULL_REQUEST_TEMPLATE.md` (or any `.github/PULL_REQUEST_TEMPLATE/*.md`) is present, fill that template rather than writing your own body. Write your own summary only when the repo has no template.
- **Link the Jira issue when one is provided.** If a Jira key or URL came in via `$ARGUMENTS`, the branch name, or the PRD, include the issue link in the PR body.

Open the PR as a **Draft** (the `stack:dev` final gate marks it ready later), and print `PR_URL=<url>` as the final line of your output so the orchestrator can capture it.
