# Severity Grading: P0 / P1 / P2

Findings have three severity levels. Be conservative — over-grading dilutes the report.

---

## P0 — Blocking

**Definition:** The PRD cannot move into development without this being fixed. Shipping with this unresolved would cause incorrect implementation, missed compliance, or sprint-level rework.

**Qualifies as P0:**
- A direct contradiction in core requirements
- A core flow with no acceptance criteria (engineering cannot tell when it's done)
- A missing requirement that the rest of the PRD depends on (e.g., user roles referenced but never defined)
- A security, privacy, or compliance gap (PII handling unspecified, auth flow undefined, accessibility ignored where required)
- An unmapped BRD item (a stated business requirement with no PRD coverage)
- A 1:N split scenario in a core flow where one or more branches are unspecified
- Any dimension scoring below 5/10 in the audit

**Examples:**
- *"Section 3 requires user authentication but Section 5 says 'no login wall' — these contradict."*
- *"The 'export to PDF' feature lists no acceptance criteria; QA cannot test completion."*
- *"PRD references 'admin role' in 4 sections but the role and its permissions are never defined."*
- *"Subscription tiers are mentioned (free / pro / enterprise) but the pro-tier behavior for limit enforcement is not specified."*

**Reviewer rule:** If you find yourself writing "the engineer would have to guess" in the Why-it-matters field, it's P0.

---

## P1 — Important

**Definition:** Should be fixed before the PRD is approved. Will cause friction, rework, or quality issues if shipped as-is, but does not categorically block dev from starting.

**Qualifies as P1:**
- Ambiguous language in non-core requirements
- Missing edge cases in secondary flows
- A non-functional requirement (performance, accessibility, i18n) stated without a threshold
- Dependencies mentioned but ownership/timing unclear
- Success metrics that are directionally right but not quantified
- A 1:N split scenario in a non-core flow with one branch unspecified
- Risks listed without mitigations

**Examples:**
- *"Section 4 says 'response should be fast' — define the latency budget (suggest p95 < 300ms)."*
- *"Empty state for the dashboard is not specified — what does a brand-new user see?"*
- *"Integration with the billing service is named but the contract (sync vs async, retry policy) is not defined."*
- *"Success metric 'increase engagement' is not measurable — pick a specific metric (e.g., DAU/MAU, sessions per user per week) and a target."*

**Reviewer rule:** P1 is "the team would discover this in sprint planning and have to go back to PM" — not a release-stopper, but a planning-stopper.

---

## P2 — Suggestion

**Definition:** Nice to address. Improves the PRD but its absence won't cause meaningful issues.

**Qualifies as P2:**
- Polish on language that's already clear enough
- Suggested restructuring (e.g., "consider moving section X earlier")
- Optional sections that would add value (e.g., a competitive analysis appendix)
- Formatting consistency
- Adding diagrams where prose currently works but a visual would help
- Cross-linking between sections

**Examples:**
- *"Consider adding a state diagram for the order lifecycle — the current prose covers all states, but a diagram would speed review."*
- *"Terminology: 'user', 'customer', and 'account' are used interchangeably. Consider defining these in a glossary and using consistently."*
- *"The risks section is thorough; consider adding mitigation owners."*

**Reviewer rule:** If the PRD would still be approvable with this issue present, it's P2.

---

## Calibration: when in doubt, downgrade

The single biggest review-quality killer is severity inflation. A 30-finding report where 20 are P0 trains the author to ignore the severity column.

**Rules of thumb:**
- A healthy review has roughly a 1:2:3 ratio of P0:P1:P2. Wildly different ratios warrant a sanity check.
- For a competent PRD with normal gaps, expect 0-3 P0s, 5-10 P1s, and 5-15 P2s.
- If you have more than 5 P0s, re-read your P0s and ask "is each one truly a blocker?"
- If you have zero P0s and zero P1s but lots of P2s, the PRD is probably Ready — say so.

---

## Severity is independent of effort

The severity reflects *impact if unfixed*, not how hard the fix is. A 5-second typo correction can be P0 if the typo changes the meaning of a contract. A days-long rewrite can be P2 if it's pure polish.
