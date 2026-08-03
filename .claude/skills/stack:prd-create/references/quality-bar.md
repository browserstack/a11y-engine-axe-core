# Quality Bar — mirror of `stack:prd-reviewer`

This is the bar the PRD must clear. It is **identical** to what `stack:prd-reviewer`
applies, so a PRD authored here is review-ready by construction. The canonical rubric
text lives in `../stack:prd-review/references/dimensions.md` and
`../stack:prd-review/references/severity-grading.md`; this file is the authoring-side view.

## The 8 dimensions (author toward each)

1. **Completeness** — all 14 sections present or justified `N/A — <reason>`.
2. **Clarity** — every requirement reads exactly one way; terms defined; modifiers quantified.
3. **Logic & Consistency** — no contradictions; states reachable; ordering sound.
4. **Testability** — every requirement has a measurable acceptance criterion. For AI
   features, that criterion is an eval (dataset + metric + threshold).
5. **Scope Discipline** — crisp in/out-of-scope; MVP vs later phases explicit; no hidden scope.
6. **Edge Cases & Exceptions** — empty / error / denied / concurrent / stale / rate-limited /
   partial-failure covered per major flow.
7. **Dependencies & Risks** — upstream/downstream/third-party named; risks have mitigations.
8. **Traceability** — every requirement cites evidence / OKR / BRD item / regulatory /
   technical constraint. No orphan requirements; no unsourced "users want this".

## Severity (used during the self-check)

- **P0** — blocking: contradiction in core requirements; core flow with no acceptance
  criteria; missing requirement others depend on; security/privacy/compliance gap; unmapped
  BRD item; missing 1:N branch in a core flow; any dimension < 5/10.
- **P1** — important: ambiguity in non-core requirements; missing edge cases in secondary
  flows; NFR without threshold; dependency without owner/timing; unquantified metric; missing
  1:N branch in a non-core flow; risk without mitigation.
- **P2** — suggestion: polish, restructuring, optional sections, cross-linking.

## Readiness gates (must hold before declaring the PRD done)

- **Zero P0 findings.**
- **Every dimension ≥ 6/10.**
- **Average ≥ 7.0/10.**
- If a BRD was supplied: **100% of BRD items mapped** (see `brd-coverage.md`).
- All 1:N split branches in core flows specified (see `split-scenarios.md`).

## Authoring-time self-check (skill Phase 4)

Before finishing, score the draft against the 8 dimensions and grade findings P0/P1/P2 —
**the same way `stack:prd-reviewer` would.** Then:

1. **Fix every P0 inline** — do not hand off a PRD with an open P0.
2. Report residual P1/P2 to the user as named polish items (do not silently fix-or-hide).
3. Never claim the PRD is "ready" while any P0 remains.

The formal review is then a confirmation, not a surprise: hand off with
`Review the PRD at <path>` to `stack:prd-reviewer`.
