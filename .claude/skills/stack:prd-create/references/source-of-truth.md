# Source-of-Truth Hierarchy — how a BrowserStack product *actually* works

When the PRD targets a BrowserStack product, ground in these three sources **in strict
priority order**. Higher tier wins on any factual disagreement (subject to the conflict
protocol below). This hierarchy is consulted *in addition to* anything the user passed —
user-supplied context is never discarded, but it is reconciled against these tiers.

**Grounding is two-level — don't conflate them:**

- **Orientation (light, Phase 0).** Just enough to map the product and infer depth: the
  *always-read* index (`.claude/knowledge/product/<product>/KB.md`) + the product's `overview.md`.
  Load this and stop — it's orientation, not a deep pull.
- **Feature-scoped deep grounding (Phase 1, *before* the brainstorm).** The feature ask already
  names what's being built, so ground deeply up front — that's what makes the brainstorm's
  questions product-specific instead of generic. The query is the feature ask (refined by any
  brainstorm top-ups). From each tier, lazy-load only the slices that bear on this feature (the
  relevant doc pages, the matching `knowledge/capabilities/<slug>.md` facets, the Confluence pages
  touching this area). **Top up during the brainstorm** when the conversation opens a new sub-area.
  Never crawl an entire tier; that's wasteful and buries the signal.

The product KB is built for exactly this split: `KB.md` is the always-read orientation;
`capabilities/<slug>.md` are the lazy-loaded deep slices (faceted — dev reads Current
behavior/Architecture, prd reads Intent & roadmap/Metrics).

| Rank | Source | What it is | Access |
|------|--------|-----------|--------|
| **1** | `github.com/browserstack/docs` | **Absolute** source of truth for how the product is *documented* to work today | shallow clone (read-only) |
| **2** | `.claude/knowledge/product/<product>/` (installed KB) | Curated product **knowledge base** — `KB.md` index + faceted `capabilities/<slug>.md` + cross-cutting overview/personas/competitive/glossary | local files |
| **3** | Confluence (Atlassian Rovo MCP) | Live product space — task-briefs, PRDs, roadmap, feedback | MCP, on demand |
| **C** | **Code context** — the product's source repo(s) | How the product *actually* works (real behavior, limits, feasibility) | `stacks/stack-domain-<repo>/` KB if present (code already condensed), else the repo (clone/grep, read-only) |

> Tiers 1–3 are the **default** grounding. Tier 1 = *documented* current state; tiers 2–3 = *intent,
> rationale, what's planned*. **Code (C) is consulted when necessary** — it answers a different
> question: *what does the implementation actually do?*

**When to reach for code (C):**
- A behavior/limit/edge-case matters to the PRD and docs are **silent, ambiguous, or suspected stale**.
- **Feasibility** — does the current architecture support the proposed change, and where would it land.
- To **verify** a current-state claim before building a requirement on it.

**Precedence with code:** for *documented intent*, docs (tier 1) lead. For ***actual* runtime
behavior**, code is the arbiter — if code contradicts docs on what the system really does, **code
wins** on that fact, and docs become a write-back/flag target (§5). Don't read code by default
(it's the most expensive source): prefer the condensed `stacks/stack-domain-<repo>/` KB when one
exists, and drop to the repo only for the specific files the question touches. **When you cite code, use a SHA-pinned GitHub permalink** (rendered
`[file → symbol](…/blob/<sha>/…#L..)`), never a bare line number — resolve the SHA from the
`stack-domain-<repo>` stack's `stack-harness.yml` (`source.commit`), the clone's HEAD, or
`gh api repos/<owner>/<repo>/commits/<branch>`, and build/verify it with `gh`
(see `grounding-protocol.md` §5).

## 1. Resolve the product

Infer the product slug from the ask + any context. Map it to each tier:
- **Tier 1:** the matching area under the docs clone (search by product name / known doc path).
- **Tier 2:** the installed product KB at `.claude/knowledge/product/<product>/` — `KB.md` +
  `capabilities/<slug>.md` + cross-cutting files (built by `product-knowledge-sync`, shipped by the
  `stack-module-product-<product>` stack). In the harness repo itself it lives at
  `stack-product/<product>/knowledge/`.
- **Tier 3:** the product's Confluence anchors. **Reuse**
  `.claude/knowledge/product/<product>/confluence-sources.yml` if it exists (its
  `anchors`/`cloud_id` are exactly what tier 3 needs); otherwise discover via the
  `4.c <Product> Task Briefs` convention.
- **Code (C):** the product's source repo(s). Prefer a `stacks/stack-domain-<repo>/` knowledge
  base if one exists (code already condensed); otherwise the repo itself, read-only, only for the
  files the question touches. Map only when a code question actually arises — don't resolve it
  eagerly.

If the product can't be confidently mapped to a tier, say so and ask — don't guess a path.

## 2. Clone / refresh the docs repo (tier 1)

Shallow, read-only, cached:

```bash
DOCS="${TMPDIR:-/tmp}/browserstack-docs"
if [ -d "$DOCS/.git" ]; then
  git -C "$DOCS" fetch --depth 1 origin && git -C "$DOCS" reset --hard origin/HEAD
else
  git clone --depth 1 https://github.com/browserstack/docs "$DOCS"
fi
```

Treat the clone as **read-only**. Never push to `browserstack/docs` from this skill (see
write-back rules below). If the clone fails (network/auth), record it as a gap and fall back
to tiers 2–3 — don't block.

## 3. Ground in priority order

For each fact a PRD needs (current behavior, surfaces, limits, naming): take it from the
**highest tier that has it**. Only descend a tier when the higher one is silent. Tag the
tier on grounded current-state claims when it aids traceability (e.g. *"(per docs)"*).

Tiers 2–3 remain the primary source for **intent** (problem framing, roadmap, customer
evidence, competitor posture) — tier 1 rarely covers those.

## 4. Conflict protocol — STOP and ask, never silently pick

When two consulted sources **materially disagree** on the same fact (behavior, limit, naming,
status, a number), do not auto-resolve by rank. Surface it and ask the user which is the
source of truth — for **any** combination of sources:

> **Conflict on `<fact>`:**
> - **docs** says: `<X>`
> - **product KB** says: `<Y>`
> - *(Confluence says: `<Z>`)*
> - *(code says: `<W>`)*
>
> Which is the source of truth here?

For a contradiction specifically about **actual runtime behavior**, code (C) is the default
answer (see precedence above) — but still confirm with the user before writing the correction
back, since the fix may land in docs or Confluence.

Carry the user's ruling forward for the rest of the session. (Rank is the *default* when
sources are merely silent or additive — the conflict prompt is for genuine contradictions.)

## 5. Write back to the resolved source-of-truth's stale siblings

Once the user declares which source is authoritative, **converge the others** so the same
conflict doesn't resurface next time:

- **The product KB is stale** → update the relevant file (`.claude/knowledge/product/<product>/…`,
  e.g. a `capabilities/<slug>.md` facet) to match the SoT, then contribute it upstream (via
  `update-context`) so the `stack-module-product-<product>` stack stays the source of truth. Safe, local — do it.
- **The docs clone is stale** → it is read-only and lives in another repo. Do **not** push.
  Record a flagged note for the docs owners (in the PRD's open-items / a `[TBD — owner: docs]`
  tag) so the correction is tracked, not silently dropped.
- **Confluence is stale** → editing Confluence is an **outward-facing** action. Only update it
  via MCP (`updateConfluencePage`) with **explicit user confirmation**; otherwise tag it.

State each write-back you make (or propose) before doing it. Never edit a source the user
didn't authorize.

## 6. Then proceed to draft

With current-state grounded (tier 1), intent grounded (tiers 2–3), conflicts resolved, and
stale siblings reconciled, continue to drafting. Everything still unknown is tagged
(`[ASSUMPTION …]` / `[TBD …]`), never invented — see `grounding-protocol.md`.
