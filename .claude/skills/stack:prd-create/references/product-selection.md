# Product selection (Phase 0)

Before mapping and grounding, let the user choose which **product knowledge module(s)** this PRD
targets — from the harness's opt-in module catalog, the same catalog `ai-harness add` installs from.
Product knowledge ships in `stack-module-product-<product>` stacks (installed as
`.claude/knowledge/product/<product>/`). This step picks the relevant one(s) and installs any that
are missing, so grounding has real product knowledge to work from.

## 1. Enumerate the available product modules

List the module catalog, machine-readable:

```bash
npx @browserstack/ai-harness add --list --json
```

Output shape: `{"modules":[{"name","description","installed"}, ...]}`. Keep the **product** modules —
those whose `name` starts with `stack-module-product-` (the `<product>` is the trailing segment,
e.g. `stack-module-product-applive` → `applive`). `installed` is `false` (not installed) or one of
`via-config` / `via-referenced-stacks` / `session`. Non-product modules (e.g. `stack-module-design`)
are out of scope for this question — they can still be added separately with `ai-harness add`.

**Fallback if the CLI is unavailable** (not an installed harness repo, offline): scan local product
KBs instead — `.claude/knowledge/product/*/` (consumer repo) or `stacks/stack-module-product-*/`
(harness repo). If neither yields any product, tell the user and continue with only the context they
passed (soft — never block).

## 2. Ask the user — multi-select

Present the product modules as a **multi-select** prompt (`AskUserQuestion`, `multiSelect: true`):

> **Which product(s) is this PRD for?** Select the most relevant product knowledge module(s).

- One option per product module: label = `<product>`, description = the catalog `description`, with
  an `[installed]` / `[not installed]` hint.
- **Pre-select the best match** inferred from the feature ask (product name or capability keywords in
  the ask), so the common single-product case is one confirmation. The user may add or remove.
- Multi-select because a feature can span products (e.g. Live **and** App Live) — the user picks all
  that apply.

## 3. Install any selected-but-missing module

For each selected module whose `installed` is `false`, install it so its KB is on disk for grounding:

```bash
npx @browserstack/ai-harness add <product> [<product> ...] --scope session
```

`--scope session` keeps it to this working session and does **not** edit team config; use `local` or
`team` only if the user explicitly wants to persist it. Short names resolve (`applive` →
`stack-module-product-applive`). If an install fails, report it and continue with whatever KBs are
present.

## 4. Set the primary product and hand off

- The **first / most-relevant** selected product is the **primary**: it drives orientation and the
  output path (`.claude/knowledge/product/<primary>/prds/<slug>.md`).
- **Ground (Phase 1) across all selected products' KBs**, extracting per the source-of-truth
  hierarchy from each.
- If a selected product still has no KB (module absent and not installable), suggest
  `/stack:product-knowledge-sync <product>` and proceed with available grounding (soft — never block).

Carry the selected product list forward for every later phase — the author/review skill choice
(Phase 0b, which probes the primary product's skills; see `skill-selection.md`), grounding (Phase 1),
author execution (Phase 3), the checker (Phase 4), and the Confluence target (Phase 6).
