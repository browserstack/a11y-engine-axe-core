# Skill selection (Phase 0b)

After the product(s) are chosen (Phase 0a), and **before** grounding/brainstorm, the operator
explicitly picks **which skill authors the PRD** and **which skill reviews it**. This replaces the
old silent auto-discovery that used to happen inside Phase 3/Phase 4 — the choice is now made once,
up front, and carried forward: Phase 3 executes the author choice, Phase 4 the review choice, and
neither re-discovers.

Ask **author first, review second**. Each is a single-select (`AskUserQuestion`) of up to four
ranked options.

## The four options (same for author and review)

Ranked best-first; pre-select the highest-ranked **found** option:

The **menu rows** are the _found_ skills plus native (ranked below). A **custom path** is normally
typed in the prompt's built-in free-text field, not a menu row — but a "Provide a path" row is added
in the one case where native would otherwise be the sole row (see "The 2-option floor" below):

| #   | Menu row                       | Where it comes from                                                                                                                                          | Executes as                                                           |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1   | **Product-module skill**       | An authoring/review `SKILL.md` shipped inside the installed `stack-module-product-<product>` stack (registered/invocable, or located within that stack dir). | Registered → Skill tool; on-disk → read + follow inline.              |
| 2   | **`stack-product` dump skill** | The product's skill in the harness `stack-product/<Product>/` dump — local in the harness repo, or a sparse checkout (`/tmp`) from a consumer repo.          | Read its `SKILL.md` from the checkout + follow inline.                |
| 3   | **Native**                     | The built-in engine — 14-section author / `stack:prd-reviewer` reviewer.                                                                                     | prd-create's own engine (see `section-library.md`, `quality-bar.md`). |

**Probe channels 1 and 2 for the primary product** using the discovery mechanics in
`orchestration.md` (registered-skill check → local `stack-product/<Product>/` → sparse checkout →
classify each found `SKILL.md` as author vs review). This is the **same** probe/checkout that
Phase 3 and Phase 4 later reuse — **do not fetch again downstream.**

## Ranking and pre-selection

- **Omit any channel row that yields nothing.** A channel-1 (product-module) or channel-2 (dump) row
  appears **only** when that channel actually found a skill — never show an empty/`[not found]` row.
- **Channel 1 is usually empty today** — installed `stack-module-product-<product>` stacks currently
  ship knowledge only (see `orchestration.md` "Two runtime environments"); it fires only once a
  product's skills are promoted into an installed stack. Don't treat its absence as an error.
- **Native is always a row**; pre-select the highest-ranked **found** skill instead when there is one:
  product-module (1) over dump (2) over native (3).
- If a channel yields **2+** candidate skills (e.g. two product authoring skills), list each as its
  own row (`name · path`) so the operator picks the exact one.

## The 2-option floor (why "Provide a path" sometimes shows)

`AskUserQuestion` requires **2–4 explicit options per question**, and its auto-appended free-text
field ("Other" / "Type something") **does not count** toward that floor — a single-option prompt
fails with _Invalid tool parameters_. So:

- **≥2 rows already** (any found skill + native, or 2+ found skills) → do **not** add a "Provide a
  path" row; it would duplicate the free-text field. A custom path is typed in the free-text field.
- **Only 1 row** (native alone — neither channel found a skill) → add **"Provide a path"** as the
  second row so the prompt is valid. This is the _one_ case where that row appears.

Either way, **word the question so the free-text field reads as path entry** (its label isn't
customizable), e.g.:

> **Which skill should AUTHOR this PRD?** Pick a row, or type the path to a custom `SKILL.md`.

So the no-skill-found author prompt is **1. Native (Recommended) · 2. Provide a path** + the free-text
field; the skill-found prompt is the found skill(s) + **Native**, no path row. Treat a non-empty
free-text answer (or selecting "Provide a path" then giving one) as a provided path and validate it
(below). The same applies to the review question.

## CLI-flag bypass

A flag present on invocation **skips its own prompt** (the other is still asked):

| Flag                    | Effect                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `--author-skill native` | Author = native.                                                                      |
| `--author-skill <path>` | Author = the `SKILL.md` at `<path>` (same as typing the path in the free-text field). |
| `--review-skill native` | Reviewer = `stack:prd-reviewer`.                                                      |
| `--review-skill <path>` | Reviewer = the `SKILL.md` at `<path>`.                                                |
| `--native`              | Both author and reviewer = native (shorthand for the two `native` flags).             |

## Path validation (free-text path and the `<path>` flags)

Before accepting a provided path — whether typed in the free-text field or given via a flag — confirm
it resolves to a **readable `SKILL.md`** (a file named `SKILL.md`, or a directory containing one). On
a bad path: report the specific problem and re-prompt (interactive) or abort with the reason
(flag-driven) — never silently fall back to native for a path
the operator explicitly named.

## Hand-off

Carry the two resolved choices (author skill + review skill, each as: `native` | a registered skill
name | an on-disk `SKILL.md` path) forward. Phase 3 runs the author; Phase 4 runs the reviewer. See
`orchestration.md` for the delegation contract and `maker-checker.md` for the review loop.
