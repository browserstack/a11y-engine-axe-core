# PRD Creator — Claude Code Skill

A structured PRD _authoring_ skill for Claude Code. Picks the product module, then lets the operator
**explicitly choose the author and review skills up front** (the product-module skill, the harness
`stack-product/<product>` dump skill, the built-in native engine, or a provided path). Brainstorms
the ask, grounds it in a source-of-truth hierarchy, **orchestrates** the draft via the chosen author,
and runs a maker-checker review loop with the chosen reviewer that brainstorms fixes until it passes
its Definition of Ready. Counterpart of `stack:prd-reviewer`.

## What it does

1. **Picks the product module, then the author & review skills** — after the product multi-select, the operator chooses (author first, review second) from up to four ranked options: the product-module skill, the `stack-product` dump skill, native (built-in engine / `stack:prd-reviewer`), or a provided path; the best _found_ option is pre-selected, and `--author-skill`/`--review-skill`/`--native` bypass the prompts. Then **maps & orients** on the cheap always-read layer, **infers depth** (lite / standard / deep, override allowed) and **detects AI features** (which require eval-based acceptance criteria)
2. **Grounds deeply, scoped to the feature**, via a source-of-truth hierarchy — (1) `github.com/browserstack/docs` (how the product is documented to work) → (2) the installed product KB `.claude/knowledge/product/<product>/` (the capability knowledge base: `KB.md` + `capabilities/`, shipped by the `stack-module-product-<product>` stack) → (3) Confluence via Atlassian Rovo MCP — plus **product code context** (a `stack-domain` KB or the repo) when actual behavior or feasibility must be verified, plus any context you hand it. If the product KB is ≥1 day stale (per `knowledge-sync.json`), it pulls newly-added Confluence docs into the session context first — read-only, never writing the KB
3. **Brainstorms the ask** (via `superpowers:brainstorming`) with questions **curated against that grounding** — problem, persona, outcome, scope — topping up grounding as new sub-areas surface
4. **Resolves conflicts with you** when sources disagree, and **writes the correction back** to the stale product-KB file (contributed upstream to the `stack-module-product-<product>` stack)
5. **Orchestrates the author step** — runs the author skill chosen in step 1: a product-module / dump / provided-path skill (delegated the draft, primed with the grounding + brainstorm and running its full flow), or the built-in 14-section, review-aligned skeleton with quantified metrics, traceability, and 1:N split coverage
6. **Runs a maker-checker loop** — reviews with the reviewer chosen in step 1 (native = `stack:prd-reviewer`), and **brainstorms fixes with you** across up to three rounds until zero blockers
7. **Writes a review-ready PRD**, offers to **export it to Confluence**, and hands off to `stack:prd-reviewer`

## Install

Ships in the `stack-module-product-skills` stack in the BrowserStack AI Harness — an opt-in
_module_ stack, pulled into a repo only when it (or a stack it depends on) lists
`stack-module-product-skills` in `referenced_stacks`. Pair it with the relevant
`stack-module-product-<product>` context stack(s). Invokable as `stack:prd-create`; Claude Code
also activates it on the trigger phrases below.

## Use

```
/prd-create "Add confidence scores to healed locators" ./self-healing-docs/ --brd ./brd.md
```

Activates on phrases like "write a PRD", "draft a spec", "scope this feature",
"create a product doc".

## Output

Writes `<context-dir>/prds/<feature-slug>.md` — the product KB's `prds/` dir,
`.claude/knowledge/product/<product>/prds/` (or your `--out` path). The final step offers to publish
it to Confluence (create, or update on re-export), defaulting the target from the product's
`confluence-sources.yml` and confirming with you first. The PRD is a **first-class source** for
`product-knowledge-sync`: its next run folds the PRD into the matching capability's _Intent &
roadmap_ facet and maps it in `knowledge-sync.json`, so authored PRDs feed back into product context
without a Confluence round-trip. Run `update-context` to contribute it to the central harness.

## Skill layout

```
stack:prd-create/
├── SKILL.md
├── README.md
└── references/
    ├── product-selection.md     # Phase 0a product-module catalog, multi-select, install-if-missing
    ├── skill-selection.md       # Phase 0b author/review choice: 4 ranked options, CLI flags, path validation
    ├── orchestration.md         # Phase 3 author execution: channel probing, sparse checkout, delegation
    ├── maker-checker.md         # Phase 4 review loop: run the chosen checker, brainstorm-fix rounds
    ├── confluence-export.md     # Phase 6 export: target resolution, create/update, write-back
    ├── source-of-truth.md       # 3-tier hierarchy, conflict protocol, write-back
    ├── section-library.md       # 14 review-aligned sections
    ├── quality-bar.md           # 8 dimensions + gates + self-check
    ├── depth-rubric.md          # lite/standard/deep + AI detection
    ├── grounding-protocol.md    # extraction, gap-tagging, never invent
    ├── split-scenarios.md       # 1:N coverage at authoring time
    └── brd-coverage.md          # optional BRD intake
```

Reference files load on demand; SKILL.md stays under context budget.

## License

MIT — fork it, edit it, ship it. The section set and quality bar are mirrored from
`stack:prd-reviewer`; if your team tunes the reviewer's rubric, update the reference files
here to match so the two stay aligned.
