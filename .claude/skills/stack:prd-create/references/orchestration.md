# Orchestration — probe channels & execute the chosen author skill

**The author/review skill is chosen up front in Phase 0b** (`skill-selection.md`), not here. This
file covers (a) the **channel probing** that populates the Phase 0b prompt — where product skills
live and how to reach them — and (b) the **delegation contract** Phase 3 follows to _execute_ the
author the operator chose. Phase 4's checker uses the same probe results (one checkout serves both).

## Two runtime environments

- **Consumer repo (normal case).** Installing a `stack-module-product-<product>` stack ships
  `knowledge/product/<product>/` (`KB.md`, `capabilities/`, `prds/`, `confluence-sources.yml`,
  `knowledge-sync.json`, cross-cutting files) — **knowledge only, no authoring skill.** The harness
  `stack-product/` dump does **not** reach here.
- **Harness repo (`browserstack/browserstack-ai-harness`).** The `stack-product/<Product>/` dump is
  present locally; `.claude/knowledge/product/` is not.

Product authoring/review skills currently live **only** in the harness `stack-product/<Product>/`
dump and are not registered as invocable skills. So from a consumer repo the only way to reach them
is remotely — via a sparse checkout of the harness (below).

## Channel probing (feeds the Phase 0b prompt)

Probe these channels for the primary product to populate the Phase 0b options. Channels 1–2 back the
prompt's **product-module** and **`stack-product` dump** options; the operator can always instead
pick **native** or **provide-a-path**.

```
1. Registered/active product skill   → Phase 0b option "product-module skill"  (future-proof; usually empty today)
2. Installed stack-module-product-<product>/ on-disk skill → same option        (product-module channel)
3. Local stack-product/<Product>/    → Phase 0b option "stack-product dump"     (only in the harness repo)
4. Sparse checkout of harness
   stack-product/<Product>/ → /tmp   → same option                             (the consumer-repo channel)
```

Check registered/installed skills (1–2) before the dump (3–4). If a product's skills are ever
promoted into an installed stack, they surface as the product-module option automatically — no change
to this skill needed. If no channel yields a skill, Phase 0b shows only native + provide-a-path.

## Sparse checkout (dump channel, consumer repo)

Cache in `/tmp`, mirroring the Phase 1 `browserstack/docs` clone in `source-of-truth.md`:

```bash
HARNESS="${TMPDIR:-/tmp}/browserstack-ai-harness"     # reusable cache
if [ -d "$HARNESS/.git" ]; then
  git -C "$HARNESS" fetch --depth 1 origin && git -C "$HARNESS" reset --hard origin/HEAD
else
  git clone --filter=blob:none --sparse --depth 1 \
    git@github.com:browserstack/browserstack-ai-harness.git "$HARNESS"
fi
git -C "$HARNESS" sparse-checkout set "stack-product/<Product>"
```

- `--filter=blob:none` (partial) + `--depth 1` (shallow) + `--sparse` → only the one product's
  subtree materializes; the other stacks never download.
- Read-only cache; refreshed via `fetch`/`reset` on reuse.
- Pins to the harness **default branch** — may be newer than the installed knowledge; accepted,
  since these skills aren't versioned or installed anywhere else.
- If `git`/network is unavailable or the checkout fails → the dump option simply doesn't appear in
  the Phase 0b prompt (report it); the operator can still choose native or provide-a-path.

## Resolve the product slug to the dump directory

Match the product slug **case-insensitively** against the `stack-product/` listing (`applive` →
`AppLive`, `live` → `Live`, `percy` → `percy`). List candidates with:

```bash
git -C "$HARNESS" ls-tree --name-only HEAD stack-product/
```

If no directory matches, the dump channel yields nothing (the dump option is omitted from Phase 0b).

## Find and classify skills inside the subtree

Within `stack-product/<Product>/`, find **every** `SKILL.md` at any depth — layouts vary:

| Product (dump dir) | Author skill path                                                                  | Review skill path                               |
| ------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| `AppLive`          | `plan/product/SKILL.md` (`build-task-brief`)                                       | `review/product/SKILL.md` (`review-task-brief`) |
| `Live`             | `plan/product/SKILL.md`                                                            | `review/product/SKILL.md`                       |
| `percy`            | `.claude/skills/gen-task-brief/SKILL.md`, `.claude/skills/user-story-doc/SKILL.md` | —                                               |
| `website-scanner`  | top-level `SKILL.md`                                                               | —                                               |

Do not hard-code the table — enumerate `SKILL.md` files and classify each from its frontmatter
`name` + `description`:

- **author** — authors a PRD / task-brief / user-story-doc (verbs: build, generate, author, draft, write).
- **review** — reviews/audits/critiques a PRD (verbs: review, audit, critique, validate).

Classified author skills become the **product-module / dump** author option in Phase 0b; review
skills become the same option for the reviewer. **One checkout serves both phases** — do not fetch
twice.

## How the probe results map to the Phase 0b prompt

The operator chooses in Phase 0b (`skill-selection.md`); this probe only _supplies_ the choices:

- **0 product skills found** (channels 1–4 empty, or `git`/network down) → Phase 0b offers only
  **native** + **provide-a-path**.
- **1 author skill found** → it's the pre-selected product-module/dump option; native and
  provide-a-path remain selectable.
- **2+ author skills found** → each is listed as its own option (`name · path`).
- **`--author-skill` / `--review-skill` / `--native` flags** → skip the corresponding prompt entirely
  (probing for that role can be skipped when the flag names `native` or a path).

Phase 3 then _executes_ whatever the operator selected — it does not re-resolve.

## Delegation contract (chained brainstorm)

When delegating:

1. Phase 1 grounding + Phase 2 **aligned requirements** already exist.
2. Pass both to the product skill as **priming context**.
3. The product skill runs its **full** flow — its own research + brainstorm + draft, **no gates
   skipped** — using the priming context as a starting point so its brainstorm _builds on_ the
   aligned requirements rather than re-deriving them. (The user brainstorms twice by design: once
   generically in Phase 2, once product-specifically inside the product skill; the second pass is
   additive, not a cold restart.)
4. **Execution.** A **registered** product-module skill → invoke via the Skill tool. A **dump** skill
   (not registered) or a **provide-a-path** skill → read its `SKILL.md` (+ `FLOW.md` / `PROMPTS.md` /
   reference siblings) from the checkout or the given path and follow its instructions inline, honoring
   its non-negotiable rules and output format.
5. **Output.** Write the draft to prd-create's normal location — `<context-dir>/prds/<slug>.md`
   (or `--out`), regardless of author path — so Phase 4, Phase 5, and `product-knowledge-sync` see
   a consistent artifact.

## Native (built-in) path

When the operator chose **native** in Phase 0b (or via `--native` / `--author-skill native`): fill
the 14-section skeleton (depth-scaled), quantified metrics,
per-requirement traceability, 1:N split coverage, edge/error states, explicit out-of-scope, and BRD
mapping if `--brd`. See `section-library.md`, `split-scenarios.md`, `brd-coverage.md`,
`quality-bar.md`.
