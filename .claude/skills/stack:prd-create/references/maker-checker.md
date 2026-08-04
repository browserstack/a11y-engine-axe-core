# Maker-checker — review loop with brainstormed fixes

Phase 4 replaces the old light internal self-check with a real reviewer-driven loop: the draft is
reviewed, findings are brainstormed into fixes with the user, fixes are applied, and the draft is
re-reviewed — until it clears.

## Checker = the Phase-0 choice

The reviewer was **chosen in Phase 0b** (`skill-selection.md`) — do not re-discover it here. It is
one of:

- **native** → the generic **`stack:prd-reviewer`** (also what `--native` / `--review-skill native`
  select);
- a **product-module / `stack-product` dump / provide-a-path** review skill.

Execution mirrors Phase 3: a **registered** review skill → invoke via the Skill tool; a **dump** or
**provide-a-path** review skill → read its `SKILL.md` from the checkout/path and follow inline. The
product author and reviewer came from one probe/checkout (Phase 0b) — do not re-fetch. If the chosen
review skill fails to load, report it and offer `stack:prd-reviewer` as the fallback.

## The loop

Maximum **3 rounds**. The user can stop early at any round.

```
1. Run the checker on the current draft → findings.
2. Present findings grouped by severity.
3. Brainstorm fixes WITH the user (superpowers:brainstorming, scoped to the findings) —
   agree on what to change for each finding before touching the draft.
4. Apply the agreed fixes via the author path that produced the draft
   (the product skill, or the built-in engine).
5. Re-review. Repeat from step 1 until zero blockers, or the user stops, or round 3 completes.
```

## Brainstorm-fix protocol (step 3)

For each blocker/major finding, surface it and agree the fix before editing — never silently
rewrite. Group fixes by section for efficient editing. Carry the user's decisions into the apply
step verbatim. Minor/nit findings may be batched.

## Severity mapping

- Generic `stack:prd-reviewer`: `P0` (blocker) / `P1` (major) / `P2` (minor). Loop exits when
  `P0 = 0`.
- Product review skills may use their own scale (e.g. AppLive `review-task-brief`: `S0`/`S1`/`S2`/`S3`).
  Treat the top blocking tier (`S0`) as equivalent to `P0`: loop exits when blockers = 0.

## Termination and reporting

Exit when blockers = 0, the user stops, or round 3 completes. Report:

- rounds run,
- residual non-blocking findings (P1/P2 or S1–S3),
- explicit confirmation that blockers (P0/S0) = 0.

**Never claim the PRD is ready while any blocker (P0/S0) remains** — if round 3 ends with a blocker
still open, say so plainly and list it.
