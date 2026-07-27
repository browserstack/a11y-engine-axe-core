---
name: stack:prd-reviewer
description: Audits an existing Product Requirements Document (PRD) for quality, completeness, logic gaps, ambiguity, testability, and readiness for development. Use this skill whenever the user asks to review, audit, critique, sanity-check, or validate a PRD, spec, or requirements document — including phrases like "review this PRD", "is this PRD ready", "find gaps in this spec", "audit our requirements", "DoR check", "is this dev-ready", or when the user pastes a PRD and asks what's wrong with it. Produces a structured Review Report with P0/P1/P2 findings, an 8-dimension scorecard, optional BRD coverage check, and a Readiness Certificate. Use ONLY for reviewing existing PRDs — if the user wants to write a new PRD from scratch, defer to a PRD-authoring skill instead.
---

# PRD Reviewer

A structured review process for Product Requirements Documents. Turns a vague "looks fine to me" into an evidence-backed audit with severity-graded findings and a clear ship/don't-ship verdict.

## When to use this skill

**Use when** the user provides an existing PRD, spec, or requirements document and wants it reviewed, audited, or checked for readiness — even if they don't use the word "review" (e.g., "what's missing from this?", "can engineering build from this?", "is this good enough for sprint planning?").

**Do not use when** the user wants to _write_ a new PRD from scratch. This skill audits; it does not author.

## The review workflow

Follow these phases in order. Do not skip phases — the order is what makes the audit defensible.

### Phase 1 — Intake

Before reading the PRD for content, capture:

1. **The PRD itself** (file path, pasted text, or URL).
2. **Optional inputs**: a linked BRD (Business Requirements Doc), prior PRD version, or design specs. If a BRD is provided, plan to run the BRD coverage check in Phase 4.
   - **Visual content counts as part of the PRD.** Embedded images (screenshots, diagrams, mockups) and linked Figma frames often carry load-bearing spec — flows, states, error cases, even acceptance criteria. Plan to retrieve and read them in Phase 2, not skip them.
3. **Review depth** — ask the user which they want:
   - **Quick scan** (5-10 findings, top issues only)
   - **Standard audit** (full 8-dimension review, all findings, no BRD check)
   - **Full audit** (8-dimension review + BRD coverage + Readiness Certificate)

Default to Standard if the user doesn't specify and the PRD looks substantial.

### Phase 2 — First read

Read the PRD end to end without grading anything yet. The goal is to understand:

- What is being built and for whom
- What the success criteria are
- What is explicitly out of scope
- Which sections exist and which are missing entirely

Note structural omissions but don't score yet — many "missing" things turn out to be present under a different heading.

From this read, draft a short, neutral **PRD Summary** — what's being built, for whom, the problem, key in-scope items, what's out of scope, and the success criteria. This is restatement, not evaluation; it orients the reader and goes at the top of the report (see Phase 5). If a field is absent from the PRD, record "not stated" — that absence often becomes a finding later.

#### Sub-step: Resolve visual content

Before scoring, retrieve and read the PRD's load-bearing **images and Figma links** — do not treat them as opaque gaps. **Load `references/visual-content.md`** for the procedure: inventory visual references, read embedded images multimodally (resolve `blob:`/media references to actual pixels), and resolve Figma via the Figma MCP (discover it with ToolSearch `figma`; fall back to a browser, then to flagging). Content found in a visual is scored like prose. Raise a finding only when a visual is unretrievable, exists _only_ as a picture with no prose equivalent, or contradicts the text.

### Phase 3 — 8-dimension audit

Score the PRD against the eight dimensions. **Load `references/dimensions.md` now** for the full rubric per dimension. The dimensions are:

1. **Completeness** — are all required sections present?
2. **Clarity** — is the language unambiguous and well-defined?
3. **Logic & consistency** — do the requirements contradict each other or themselves?
4. **Testability** — does every requirement have a measurable acceptance criterion?
5. **Scope discipline** — are in-scope and out-of-scope cleanly drawn?
6. **Edge cases & exceptions** — are error states, empty states, and failure paths specified?
7. **Dependencies & risks** — are upstream/downstream systems, third parties, and risks identified?
8. **Traceability** — does each requirement trace to a user need, business goal, or BRD item?

For each dimension, produce a score (0-10) and a 1-3 sentence justification.

### Phase 4 — Finding generation

For each issue identified during the audit, create a finding with:

- **ID** — sequential (F-001, F-002, ...)
- **Dimension** — which of the eight dimensions it sits under
- **Severity** — P0, P1, or P2 (load `references/severity-grading.md` if you need to disambiguate)
- **Location** — section or quoted phrase in the PRD
- **Issue** — what's wrong, in one sentence
- **Why it matters** — concrete consequence if shipped as-is
- **Recommended fix** — what the author should do

Be specific. "Section 4 is unclear" is not a finding. "Section 4 says 'the system should respond quickly' without defining the latency budget — engineering cannot test this" is a finding.

#### Sub-check: 1:N split scenarios

If the PRD describes a feature that branches by user role, subscription tier, device type, account state, or any other variable, verify each branch is independently specified. **Load `references/split-scenarios.md`** for the validation procedure. Missing branches are P1 by default; missing branches in a core flow are P0.

#### Sub-check: BRD coverage (Full audit only)

If a BRD was provided in Phase 1, map every BRD requirement to its corresponding PRD section. **Load `references/brd-coverage.md`** for the procedure. Unmapped BRD items are P0 findings.

### Phase 5 — Report assembly

Assemble the findings into a structured Review Report. **Load `references/review-report-template.md`** for the exact format. The report has these sections:

1. PRD Summary (neutral restatement of what the PRD describes, from Phase 2)
2. Executive summary (3-5 sentences, verdict-first)
3. Dimension scorecard (table)
4. Findings list (grouped by severity: P0 → P1 → P2)
5. BRD coverage map (Full audit only)
6. Verdict and next steps

Save the report as a Markdown file named `prd-review_<prd-name>_<YYYY-MM-DD>.md` next to the PRD or in the user's preferred location.

### Phase 6 — Readiness Certificate (Full audit only)

After the report is complete, run the Definition of Ready (DoR) check. **Load `references/readiness-certificate-template.md`** for the checklist and certificate format.

The PRD earns a Readiness Certificate **only if**:

- Zero P0 findings remain
- All eight dimensions score ≥ 6/10
- All BRD items (if applicable) are mapped to PRD sections

If the PRD does not qualify, produce a "Not Ready" certificate listing the blockers. Save the certificate as `prd-readiness_<prd-name>_<YYYY-MM-DD>.md`.

## Output principles

- **Verdict first.** The executive summary opens with "Ready / Conditionally Ready / Not Ready", not with throat-clearing.
- **Quote, don't paraphrase.** When citing a problem, quote the offending PRD text in backticks so the author can find it.
- **Every finding has a fix.** A finding without a recommended fix is a complaint, not a review.
- **Severity is conservative.** When in doubt between P0 and P1, choose P1. When in doubt between P1 and P2, choose P2. Reserve P0 for true blockers — things that would actively cause incorrect implementation or wasted sprint cycles.
- **Praise the good.** If a section is exemplary, say so briefly. This calibrates the author's understanding of the bar and prevents the report from reading as purely adversarial.

## Anti-patterns to avoid

- **Don't rewrite the PRD.** The job is to surface issues, not to author replacements.
- **Don't invent missing context.** If something is unclear, that _is_ the finding — don't fill the gap with assumptions and review the assumption.
- **Read the visuals before calling them a gap.** A spec inside an image or Figma frame is content to retrieve and review (see Phase 2 sub-step), not an automatic omission. "Couldn't be bothered to open the Figma" is not a finding; "the Figma is access-restricted" or "the flow lives only in a screenshot, never in prose" is.
- **Don't grade harshly to look thorough.** A 50-finding report that flags every minor formatting choice as P2 buries the actual issues. Aim for signal density, not finding count.
- **Don't skip Phase 2.** Skipping the orientation read leads to flagging things as "missing" that exist three sections later.

## Reference files

- `references/dimensions.md` — Full 8-dimension rubric with per-dimension checklists
- `references/severity-grading.md` — P0/P1/P2 definitions with examples
- `references/review-report-template.md` — Output format for the Review Report
- `references/readiness-certificate-template.md` — DoR checklist and certificate format
- `references/split-scenarios.md` — 1:N branch validation procedure
- `references/brd-coverage.md` — BRD-to-PRD traceability check
- `references/visual-content.md` — reading embedded images & resolving Figma via MCP
