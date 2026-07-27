<!-- Version: 2026-07-07 | Source: @browserstack/ai-harness | Do not remove this header -->

# Tech Spec review report template

The reviewer writes this exact structure to `docs/prd/<slug>-tech-spec-review.md`. Fill every placeholder; never emit the literal angle-bracket text.

```markdown
# Tech Spec Review: <feature name, from the Tech Spec title>

**Tech Spec:** <TECH_SPEC_PATH> | **PRD:** <PRD_PATH> | **Date:** <YYYY-MM-DD>
**Verdict:** <Ready | Conditionally Ready | Not Ready>

## Summary

<3-5 sentences, verdict first: what the spec designs, and the headline reason for the verdict.>

## Reviewers

<one line per module: `<module.path>` reviewed by `<team reviewer name | generic>`; plus `cross-cutting: generic` for the seam pass.>

## Findings

### P0 (blockers)

<one entry per P0 finding, or "None.">

- **[<dimension>] <location: spec section / module>** - <issue in one sentence>. Why it matters: <concrete consequence if built as-is>. Fix: <what the author should do>.

### P1 (fix before build)

<same entry shape, or "None.">

### P2 (minor)

<same entry shape, or "None.">

## Scorecard

| Dimension                        | Verdict           |
| -------------------------------- | ----------------- |
| Altitude                         | <pass / findings> |
| Grounding and precedent validity | <pass / findings> |
| Contract integrity               | <pass / findings> |
| Failure and Edge Cases           | <pass / findings> |
| Key decisions                    | <pass / findings> |
| Requirement fidelity             | <pass / findings> |
| Open items                       | <pass / findings> |
```

## Output principles

- **Verdict first.** The Summary opens with the verdict, not throat-clearing.
- **Quote, do not paraphrase.** When citing a problem, quote the offending spec text in backticks so the author can find it.
- **Every finding has a fix.** A finding without a recommended fix is a complaint, not a review.
- **Severity is conservative.** When in doubt, grade down (see `dimensions.md` Severity). Reserve P0 for true blockers.
- **Do not rewrite the spec.** Surface issues; do not author replacement design. Rewriting is `stack:tech-spec`'s job.
- **Single-source specs are reviewed format-agnostically.** When the spec is single-source / foreign-format (`SKILL.md` Step 1), state that in the Summary, and mark Contract integrity, Failure and Edge Cases, and Key decisions as `n/a (single-source)` in the scorecard, not `findings`. The `## Reviewers` line reads `whole spec: generic (format-agnostic, single-source)`.
