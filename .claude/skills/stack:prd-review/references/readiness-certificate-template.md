# Readiness Certificate — Template

The Readiness Certificate is the formal output of the Definition of Ready (DoR) check. It is issued only after the full audit completes. Save as `prd-readiness_<prd-name>_<YYYY-MM-DD>.md`.

---

## Issuance criteria

A PRD earns a **Readiness Certificate** if and only if **all** of these are true:

- ✅ Zero P0 findings remain (or all P0s have been resolved in a revision)
- ✅ Every dimension scores at least **6/10**
- ✅ Overall average dimension score is at least **7.0/10**
- ✅ If a BRD was provided, every BRD item is mapped to a PRD section (no ❌ entries in the coverage map)
- ✅ All 1:N split scenarios in core flows have every branch specified

If any criterion fails, issue a **Not Ready** certificate instead, listing exactly which criteria failed.

---

## Certificate template (PASS)

```markdown
# PRD Readiness Certificate ✅

**Status:** READY FOR DEVELOPMENT

**PRD:** <PRD Title>
**Version:** <version or commit hash>
**Certified:** <YYYY-MM-DD>
**Issued by:** Claude (stack:prd-reviewer skill)

---

## Definition of Ready — All Criteria Met

| Criterion                           | Status                                                 |
| ----------------------------------- | ------------------------------------------------------ |
| Zero P0 findings                    | ✅                                                     |
| All 8 dimensions score ≥ 6/10       | ✅ (lowest: <dim> at <X>/10)                           |
| Average dimension score ≥ 7.0/10    | ✅ (actual: <X.X>/10)                                  |
| BRD coverage complete               | ✅ (<X>/<X> items mapped) — or — N/A (no BRD provided) |
| 1:N split scenarios fully specified | ✅                                                     |

---

## Summary

<2-3 sentences summarizing the PRD's strengths and confirming readiness>

## Outstanding (non-blocking)

> P1 findings the team should address in the first sprint, and P2 findings to consider over time. These do not block development start.

- **P1 (recommended before sprint 2):** <count> findings — see Review Report
- **P2 (optional improvements):** <count> findings — see Review Report

## Conditions of this certificate

This certificate is valid for the PRD version cited above. Material changes to scope, user roles, success metrics, or core flows require a new review.

---

_Certificate references: Review Report `prd-review_<prd-name>_<YYYY-MM-DD>.md`_
```

---

## Certificate template (FAIL — Not Ready)

```markdown
# PRD Readiness Certificate ❌

**Status:** NOT READY FOR DEVELOPMENT

**PRD:** <PRD Title>
**Version:** <version or commit hash>
**Reviewed:** <YYYY-MM-DD>
**Issued by:** Claude (stack:prd-reviewer skill)

---

## Definition of Ready — Criteria Not Met

| Criterion                           | Status     | Detail                                |
| ----------------------------------- | ---------- | ------------------------------------- |
| Zero P0 findings                    | <✅ or ❌> | <count> P0 findings open              |
| All 8 dimensions score ≥ 6/10       | <✅ or ❌> | <list dimensions below 6 if any>      |
| Average dimension score ≥ 7.0/10    | <✅ or ❌> | actual: <X.X>/10                      |
| BRD coverage complete               | <✅ or ❌> | <count> unmapped BRD items — or — N/A |
| 1:N split scenarios fully specified | <✅ or ❌> | <list missing branches if any>        |

---

## Blockers (must resolve to issue certificate)

> Listed in suggested resolution order. See Review Report for full finding detail.

1. **<Blocker title>** — <one-line description> — _Finding F-XXX_
2. **<Blocker title>** — <one-line description> — _Finding F-XXX_
3. **<Blocker title>** — <one-line description> — _Finding F-XXX_

---

## Path to Ready

To reach a Ready state, the author should:

1. Resolve the blockers above (priority 1)
2. Address P1 findings that bring sub-6 dimension scores up to threshold
3. Re-submit for review

**Estimated effort to Ready:** <Small / Medium / Large> — <one-sentence justification>

**Suggested re-review:** Required. A new certificate will be issued after revisions.

---

_Certificate references: Review Report `prd-review_<prd-name>_<YYYY-MM-DD>.md`_
```

---

## Reviewer notes

- **Don't issue Ready certificates to be nice.** The certificate is only valuable if it actually means something. If the PRD doesn't qualify, issue Not Ready and explain exactly why.
- **Don't issue Not Ready to look thorough.** If a PRD genuinely passes, say so. False negatives are as bad as false positives.
- **A Conditionally Ready verdict from the Review Report does not earn a certificate.** Conditionally Ready means the PRD is close but not over the line; the certificate has a binary outcome.
- **Re-issued certificates:** When the author resubmits after revisions, run the full audit again — don't just re-check the prior P0s. New findings may have emerged from the changes.
