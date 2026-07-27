# PRD Review Report — Output Template

Use this template verbatim for the Review Report. Save as `prd-review_<prd-name>_<YYYY-MM-DD>.md`.

---

```markdown
# PRD Review Report: <PRD Title>

**Reviewed:** <YYYY-MM-DD>
**Reviewer:** Claude (stack:prd-reviewer skill)
**PRD version:** <version or commit hash if available>
**Review depth:** <Quick scan | Standard audit | Full audit>

---

## PRD Summary

> A neutral, faithful summary of what this PRD describes — written _before_ grading, so the reader understands the document under review. This is orientation, not evaluation: do not pass judgment here, just restate what the PRD says. Keep it to 4-8 lines.

- **What's being built:** <one or two sentences>
- **Target users / audience:** <who this is for>
- **Problem / motivation:** <why this is being built>
- **Key in-scope items:** <the main requirements or capabilities, 2-5 bullets>
- **Explicitly out of scope:** <what the PRD rules out, or "not stated">
- **Success criteria:** <how success is measured, or "not stated">

---

## Executive Summary

**Verdict:** <Ready | Conditionally Ready | Not Ready>

<3-5 sentences. Lead with the verdict. State the single biggest issue. Note what's strong. Be direct — no hedging.>

**At a glance:**

- **P0 findings:** <count>
- **P1 findings:** <count>
- **P2 findings:** <count>
- **Overall dimension score:** <X.X> / 10
- **BRD coverage:** <X of Y items mapped | N/A>

---

## Dimension Scorecard

| #   | Dimension               | Score      | Notes                    |
| --- | ----------------------- | ---------- | ------------------------ |
| 1   | Completeness            | X/10       | <one-line justification> |
| 2   | Clarity                 | X/10       | <one-line justification> |
| 3   | Logic & Consistency     | X/10       | <one-line justification> |
| 4   | Testability             | X/10       | <one-line justification> |
| 5   | Scope Discipline        | X/10       | <one-line justification> |
| 6   | Edge Cases & Exceptions | X/10       | <one-line justification> |
| 7   | Dependencies & Risks    | X/10       | <one-line justification> |
| 8   | Traceability            | X/10       | <one-line justification> |
|     | **Average**             | **X.X/10** |                          |

---

## P0 Findings — Blocking

> Fix before development begins.

### F-001 — <one-line summary>

- **Dimension:** <which of the 8>
- **Location:** Section <X> / quote: `"<the problematic text>"`
- **Issue:** <what's wrong, one sentence>
- **Why it matters:** <concrete consequence if shipped as-is>
- **Recommended fix:** <what the author should do>

### F-002 — ...

<Repeat for each P0 finding>

---

## P1 Findings — Important

> Fix before PRD approval.

### F-00N — <one-line summary>

- **Dimension:** ...
- **Location:** ...
- **Issue:** ...
- **Why it matters:** ...
- **Recommended fix:** ...

<Repeat for each P1 finding>

---

## P2 Findings — Suggestions

> Nice to address; not required.

### F-00N — <one-line summary>

- **Dimension:** ...
- **Location:** ...
- **Issue:** ...
- **Recommended fix:** ...

<Repeat for each P2 finding. Why-it-matters can be omitted for P2.>

---

## BRD Coverage Map

> Full audit only. Skip this section otherwise.

| BRD Item             | PRD Section | Status      | Notes              |
| -------------------- | ----------- | ----------- | ------------------ |
| BRD-1: <requirement> | §<X.X>      | ✅ Mapped   | <optional note>    |
| BRD-2: <requirement> | —           | ❌ Unmapped | <P0 finding F-XXX> |
| BRD-3: <requirement> | §<X.X>      | ⚠️ Partial  | <P1 finding F-XXX> |

**Coverage:** <X> of <Y> BRD items mapped (<percent>%)

---

## What's Strong

> A short, honest list of what the PRD does well. Three to five bullets max. This is not optional — it calibrates the author and gives the report credibility.

- <strength 1>
- <strength 2>
- <strength 3>

---

## Verdict & Next Steps

**Verdict:** <Ready | Conditionally Ready | Not Ready>

**To reach Ready, the author must:**

1. <required action 1 — typically resolving a specific P0>
2. <required action 2>
3. <required action 3>

**Suggested order:** <which findings to tackle first if the author is time-pressed>

**Re-review:** <not required | recommended after P0s resolved | required before approval>

---

_End of report_
```

---

## Notes on filling out the template

- **PRD Summary is neutral.** It restates what the PRD says in your own words to prove you read it and to orient the reader — it does not grade, hedge, or foreshadow findings. Save all judgment for the Executive Summary onward. If a field (out of scope, success criteria) is absent from the PRD, write "not stated" rather than inventing it — that absence usually becomes a finding.
- **Quote, don't paraphrase.** When a finding cites a problem, quote the offending PRD text in backticks. The author should not have to hunt for what you're referring to.
- **Be specific in fixes.** "Add acceptance criteria" is weak. "Add: 'p95 latency < 300ms measured at 1000 RPS sustained over 5 minutes'" is strong.
- **"What's Strong" is mandatory.** Even Not Ready PRDs usually do something well. Naming it prevents the review from feeling adversarial and shows the author you read carefully.
- **Verdict logic:**
  - **Ready** — 0 P0s, average score ≥ 7, all BRD items mapped (if applicable)
  - **Conditionally Ready** — 0 P0s, average score 6.0-6.9, minor BRD gaps acceptable
  - **Not Ready** — any P0, OR average score < 6.0, OR unmapped BRD items
