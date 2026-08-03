---
name: stack:prd-create
description: Authors a new Product Requirements Document (PRD) from a feature idea, ticket, or rough brief, then orchestrates the draft. Up front, after picking the product module, the operator chooses the author skill and the review skill — the product-module skill, the harness stack-product dump skill, the native engine, or a provided path (or sets them via --author-skill/--review-skill/--native). Grounds in a source-of-truth hierarchy (github.com/browserstack/docs → the installed product KB → Confluence, plus product code). Then runs a maker-checker review loop with the chosen reviewer (native = stack:prd-reviewer) that brainstorms fixes until zero blockers, and offers to export the PRD to Confluence. Use to write, draft, scope, or spec a new PRD — phrases like "write a PRD", "draft a spec", "scope this feature", "create a product doc". Use ONLY for authoring new PRDs — to review an existing PRD, defer to stack:prd-reviewer.
---

# PRD Creator

Authors review-ready PRDs. The skill owns the process and the quality bar; you supply the product facts. Output is built to pass `stack:prd-reviewer` with zero P0 findings.

## When to use this skill

**Use when** the user wants to author a new PRD — "write a PRD", "draft a spec",
"scope this feature", "create a product doc", or pastes a ticket/brief and asks for a PRD.

**Do not use when** the user wants to _review_ an existing PRD — defer to `stack:prd-reviewer`.

## Invocation

```
/prd-create "<feature ask>" [paths | links | notes ...] [--brd <path|url>] [--out <path>]
            [--native] [--author-skill <path|native>] [--review-skill <path|native>]
```

Context is free-form: a KB folder, loose files, URLs, and/or pasted notes — any mix.
`--brd` triggers BRD-coverage mapping; `--out` overrides the output location.

**Skill-selection flags** bypass the Phase 0 prompts for direct/scripted invocation:

- `--author-skill <path|native>` — pick the authoring skill directly: a filesystem path to a
  `SKILL.md` (selects the provide-a-path option) or the literal `native` (built-in engine).
- `--review-skill <path|native>` — same, for the checker (`native` → `stack:prd-reviewer`).
- `--native` — shorthand that forces `native` for **both** author and review, bypassing any
  product-provided skills. Equivalent to `--author-skill native --review-skill native`.

Any flag present skips only its own prompt; unset choices are still asked in Phase 0.

## Workflow

Follow the phases in order. Announce the depth and any confirmations — never proceed silently.

### Phase 0 — Select product(s), choose author & review skills, orient, infer depth & AI

**0a. Select the product(s) this PRD targets.** Enumerate the available product knowledge
modules from the harness catalog — `npx @browserstack/ai-harness add --list --json`, the same catalog
`ai-harness add` installs from — keeping the `stack-module-product-*` entries. Present them to the
user as a **multi-select** (pre-select the best match inferred from the feature ask): _"Which
product(s) is this PRD for? Select the most relevant product knowledge module(s)."_ Install any
selected-but-missing module (`npx @browserstack/ai-harness add <product> --scope session`) so its KB
is on disk. The first / most-relevant selection is the **primary** product (drives orientation and
the output path); ground across all selected. If the catalog is unavailable, fall back to scanning
`.claude/knowledge/product/*/` (or `stacks/stack-module-product-*/`); if a selected product still has
no KB, suggest `/stack:product-knowledge-sync <product>` and proceed with whatever grounding is
available (soft gate — never block). **Load `references/product-selection.md`.**

**0b. Choose the author skill, then the review skill — explicit, up front.** With the product set,
probe the authoring/review skills available for the primary product and ask the user to pick — **author
first, review second**. Each single-select's **menu rows are the _found_ skills plus native**, ranked:
**(1) the product-module skill** (an authoring/review skill shipped inside the installed
`stack-module-product-<product>` stack), **(2) the `stack-product` dump skill** (the product's skill
in the harness `stack-product/<Product>/` dump — local in the harness repo, or a sparse checkout from
a consumer repo), **(3) native** (built-in 14-section engine for author / `stack:prd-reviewer` for
review). Pre-select the highest-ranked _found_ row (1 → 2 → native); omit any channel row that found
nothing. A **custom `SKILL.md` path** is typed in the prompt's built-in free-text field, so word the
question "…or type the path to a custom `SKILL.md`" and validate any path given. **`AskUserQuestion`
needs ≥2 explicit rows and the free-text field doesn't count**, so add a **"Provide a path"** row
_only_ when native would otherwise be the sole row (neither channel found a skill); when a skill is
found, don't add it (it would duplicate the free-text field). The `--author-skill` / `--review-skill` / `--native` flags
bypass the matching prompt. Carry both resolved choices forward — **Phase 3 executes the author
choice, Phase 4 the review choice; neither re-discovers.** **Load `references/skill-selection.md`.**

**0c. Orient & infer depth.** Load only the cheap _always-read_ orientation for the primary product
(`.claude/knowledge/product/<product>/KB.md` + the product's `overview.md` / top-level docs overview)
— enough to know what the product is and what exists today. Classify the request **lite / standard /
deep**, print it with a one-line reason, accept an override, and detect whether this is an AI feature
(depth scales how far the next phases ground and brainstorm). **Load `references/depth-rubric.md`.**

### Phase 1 — Feature-scoped grounding (before the brainstorm)

The feature ask already names what's being built — so ground deeply **now**, so the brainstorm's
questions are curated against real product knowledge rather than generic. Consult the
**source-of-truth hierarchy** in priority order: **(1) `github.com/browserstack/docs`** (shallow
clone — how the product works today) → **(2) the installed product KB `.claude/knowledge/product/<product>/`**
(the capability KB pulled in by the `stack-module-product-<product>` stack) → **(3) Confluence** via Atlassian Rovo MCP. Also read
anything the user passed (KB folders, files, links, `--brd`).

**Freshness top-up (read-only — the KB may be stale).** The installed product KB is only as current
as the last `product-knowledge-sync` run. Before leaning on Tier 2, read
`.claude/knowledge/product/<product>/knowledge-sync.json`'s `synced_at`. If it is **≥ 1 day old**,
query Confluence (Atlassian MCP) under the product's `confluence-sources.yml` `anchors` for pages
whose `id` is **not in the manifest `pages[]`** — the docs added since the last sync — and fold those
into _this session's_ grounding context. If `synced_at` is **< 1 day old**, skip the top-up. **Never
write the KB** — create/edit no files; persisting new docs is `product-knowledge-sync`'s job
(`/product-knowledge-sync`). This keeps the PRD grounded on the newest briefs without triggering a KB
rebuild.

**Scope every lookup to _this_ PRD** —
lazy-load only the slices that bear on the feature (the relevant doc pages, the matching
`capabilities/<slug>.md` facets, the Confluence pages touching this area), never a
product-wide crawl. Extract
personas, metrics, competitors, surfaces, constraints — each from the highest tier that has it.
**Consult code context (C) when necessary** — to verify _actual_ behavior, check feasibility, or
resolve a stale/ambiguous doc — preferring a `stacks/stack-domain-<repo>/` KB over reading the repo
directly; on actual-behavior contradictions, code is the arbiter. Note any source conflicts to
resolve in Phase 2. **Load `references/source-of-truth.md` and `references/grounding-protocol.md`.**

### Phase 2 — Brainstorm (curated by the grounding), reconcile, write back

Run the **`superpowers:brainstorming`** skill, **primed with the Phase 1 grounding** — questions
must be specific to the product's current state, known constraints, related prior briefs, and
competitor posture, not generic. Draw out problem, persona, desired outcome, success signals,
scope. This is the requirements conversation — don't skip it for a real PRD (a one-line `--out`
regen may skip it). **Top up grounding on demand**: when the conversation opens a new sub-area,
lazy-load the slices it touches. **On any material source conflict** (surfaced in Phase 1 or
during the conversation), **ask the user which is the source of truth** — fold it naturally into
the brainstorm — then **write the correction back** to the stale product-KB file
(`.claude/knowledge/product/<product>/…`, contributed upstream to the `stack-module-product-<product>` stack); for stale docs or Confluence, tag or confirm per
`references/source-of-truth.md`. Run competitor analysis or other research when the PRD needs it.
Carry every decision forward; tag remaining gaps, never invent.

### Phase 3 — Author: run the chosen author skill

The author was **already chosen in Phase 0** — no discovery here, just execute it.

- **Native** → fill the built-in 14-section skeleton: quantified metrics, per-requirement
  traceability, 1:N split coverage, edge/error states, explicit out-of-scope, BRD mapping if `--brd`.
- **A product-module / `stack-product` / provide-a-path skill** → **delegate as a chained brainstorm:**
  pass the Phase 1 grounding + Phase 2 aligned requirements as priming context, then run that skill's
  **full** flow (its own research + brainstorm + draft, no gates skipped) — a registered skill via the
  Skill tool, a dump/path skill by reading its `SKILL.md` and following it inline. If the chosen skill
  fails to load or execute, report it and offer native as the fallback (never silently substitute).

Either path writes the draft to `<context-dir>/prds/<feature-slug>.md` (or `--out`). **Load
`references/orchestration.md`; for the native path also `references/section-library.md`,
`references/split-scenarios.md`, and `references/brd-coverage.md` (if a BRD was provided).**

### Phase 4 — Maker-checker review loop

Review the draft and brainstorm fixes until it clears. **The checker is the review skill chosen in
Phase 0** (native → `stack:prd-reviewer`; a product-module / `stack-product` / provide-a-path skill
run per its own contract) — no re-discovery here. **Loop, ≤3 rounds (the user may stop early):** run the checker → present findings
by severity → **brainstorm fixes with the user** (`superpowers:brainstorming`, scoped to the findings)
→ apply the agreed fixes via the author path that produced the draft → re-review. Exit when blockers
(P0/S0) = 0, the user stops, or round 3 completes. **Never claim the PRD is ready while any blocker
remains.** **Load `references/maker-checker.md` and `references/quality-bar.md`.**

### Phase 5 — Output & handoff

The PRD already sits at `<context-dir>/prds/<feature-slug>.md` (the product knowledge dir you grounded
in — `.claude/knowledge/product/<product>/` in a consumer repo; create `prds/` if absent) or at
`--out <path>`. Print a closing report: absolute path; inferred depth + whether AI/eval mode was on;
which author path ran (product skill name or built-in); review rounds run with blockers = 0; residual
P1/P2 (or S1–S3); BRD coverage % (if applicable); count of open `[ASSUMPTION]`/`[TBD]` tags. **Re-entry
into product context (non-blocking):** a PRD written here is a first-class source for
`product-knowledge-sync` — suggest running `/stack:product-knowledge-sync <product>` (and
`update-context` to push to the central harness) so its next run folds the PRD into the matching
capability's _Intent & roadmap_ facet (tagged `[src: prd:<feature-slug>]`). End with the handoff line:
`Review the PRD at <path>` (add `with BRD at <brd-path>` for a full audit) to `stack:prd-reviewer`. For
design or planning next, point to the relevant org skills. **Also print, as a machine-readable final
line, `PRD_PATH=<absolute-path>`** — the contract orchestrators such as `stack:dev` capture to hand the
PRD to the review stage.

### Phase 6 — Confluence export

Ask **"Export this PRD to Confluence?"** On yes: default the target space + parent from the product's
`confluence-sources.yml` (`anchors` / `cloud_id`), confirm the target with the user, then publish via
the Atlassian Rovo MCP `createConfluencePage` — or `updateConfluencePage` if the PRD front-matter
already records a `confluence_page_id` (re-export). Write the page id + URL back to the PRD
front-matter on success. Publishing is outward-facing — always confirm first; on failure, report it
and leave the local PRD unchanged. **Load `references/confluence-export.md`.**

## Reference files

- `references/product-selection.md` — Phase 0a product-module catalog enumeration, multi-select, install-if-missing
- `references/skill-selection.md` — Phase 0b explicit author/review skill choice: 4 ranked options, probing/ranking, CLI-flag bypass, path validation
- `references/orchestration.md` — Phase 3 author execution: channel probing (feeds the Phase 0b prompt), sparse checkout, slug/skill classification, delegation contract
- `references/maker-checker.md` — Phase 4 review loop: run the Phase-0-chosen checker, ≤3-round brainstorm-fix loop, termination
- `references/confluence-export.md` — Phase 6 export: target resolution, create/update, front-matter page-id write-back
- `references/source-of-truth.md` — the 3-tier hierarchy (docs → stack-product → Confluence), conflict protocol, write-back
- `references/section-library.md` — the 14 review-aligned sections, depth tags, N/A rule
- `references/quality-bar.md` — 8 dimensions, P0/P1/P2, readiness gates, self-check
- `references/depth-rubric.md` — lite/standard/deep inference + AI-feature detection
- `references/grounding-protocol.md` — context resolution, gap-tagging, never invent
- `references/split-scenarios.md` — 1:N branch coverage at authoring time
- `references/brd-coverage.md` — optional BRD intake and mapping
