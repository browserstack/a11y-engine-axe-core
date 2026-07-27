# Confluence export (Phase 6)

The explicit final step. Publishing is **outward-facing** — always behind explicit user
confirmation.

## The ask

Ask: **"Export this PRD to Confluence?"** If the user declines, stop — the PRD already lives at its
`prds/<slug>.md` path from Phase 5.

## Resolve the target

Default the target from the product's `confluence-sources.yml` (the file used for grounding in
Phase 1 — `.claude/knowledge/product/<product>/confluence-sources.yml` in a consumer repo, or the
`stack-module-product-<product>` copy in the harness):

- `cloud_id` → the Confluence site.
- `anchors` → candidate parent pages/folders (typically the product's Task Briefs folder). If
  several anchors exist, propose the Task-Briefs-style one and let the user pick.

If `confluence-sources.yml` is absent, ask the user for the space + parent page directly.

**Always confirm** the resolved target (site, space, parent page) with the user before writing.

## Discover the MCP tools

Discover the Atlassian tools with `ToolSearch` using the query `atlassian confluence`, then use:

- `createConfluencePage` — for a first-time export.
- `updateConfluencePage` — for a re-export (see below).

## Create vs update

- If the PRD front-matter has **no** `confluence_page_id` → `createConfluencePage` under the
  confirmed parent.
- If the PRD front-matter **already records** `confluence_page_id` → this is a re-export; offer to
  `updateConfluencePage` that existing page instead of creating a duplicate. Only create a new page
  if the user explicitly wants one.

## Write-back to PRD front-matter

On a successful create/update, write the page id and URL into the PRD's front-matter so the next
export updates in place:

```yaml
---
title: <feature title>
confluence_page_id: <id> # present only after a successful export
confluence_url: <url> # present only after a successful export
---
```

If the PRD has no front-matter block yet, add one at the top of the file with these keys.

## Failure handling

If the MCP call fails (auth, permission, network), report the failure and leave the local PRD and
its front-matter unchanged — do not fabricate a page id. The user can retry or publish manually.
