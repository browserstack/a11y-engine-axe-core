# BRD Coverage Check

The BRD (Business Requirements Document) describes _what the business needs_. The PRD describes _how the product will deliver it_. The coverage check verifies that every business requirement is addressed.

This check runs only when the user provides a BRD alongside the PRD. Skip it otherwise.

---

## The procedure

### Step 1 — Extract BRD items

Read the BRD and produce a numbered list of distinct business requirements. A BRD item is anything the business is asking the product to deliver — a capability, a constraint, a measurable outcome.

Number them sequentially: BRD-1, BRD-2, etc. Quote the requirement verbatim (or near-verbatim) so the mapping is unambiguous.

If the BRD is poorly structured and items are hard to extract, that's itself a finding to flag back to the user — but proceed with your best-effort extraction.

### Step 2 — Build the coverage map

For each BRD item, scan the PRD and identify the section(s) that address it. Record the mapping:

| BRD Item | PRD Section | Status      |
| -------- | ----------- | ----------- |
| BRD-1    | §2.3, §4.1  | ✅ Mapped   |
| BRD-2    | §3.1        | ⚠️ Partial  |
| BRD-3    | —           | ❌ Unmapped |
| BRD-4    | §5.2        | ✅ Mapped   |

### Step 3 — Classify each mapping

**✅ Mapped** — the PRD section(s) substantively address the BRD item, including measurable acceptance criteria where applicable.

**⚠️ Partial** — the PRD mentions the topic but doesn't fully address it. Example: BRD says "system must support 10,000 concurrent users" and the PRD discusses scaling but never commits to that specific number.

**❌ Unmapped** — the BRD item is not addressed anywhere in the PRD.

### Step 4 — Generate findings

- Each **❌ Unmapped** item is a **P0** finding. Title: "BRD-N not covered by PRD".
- Each **⚠️ Partial** item is a **P1** finding by default. Upgrade to P0 if the partial coverage involves a compliance, security, or contractual requirement.

The finding's "Recommended fix" should point to the PRD section that _should_ address the gap, or recommend adding a new section.

### Step 5 — Reverse check (optional but recommended)

After mapping BRD → PRD, do the reverse: scan the PRD for major requirements that _don't_ trace to any BRD item. These are "PRD-only" requirements.

PRD-only requirements aren't automatically wrong — the PM may have legitimately added scope based on user research or technical necessity. But they should have a clear rationale.

- PRD-only requirement with clear stated rationale → not a finding
- PRD-only requirement with no stated rationale → **P1** finding under Traceability dimension
- PRD-only requirement that _contradicts_ a BRD item → **P0** under Logic & Consistency

---

## Reporting

Include the full coverage table in the Review Report's BRD Coverage Map section. Show all rows including the ✅ ones — completeness is part of the value.

Coverage percentage formula:

```
Coverage % = (Mapped items / Total BRD items) × 100
```

Partial counts as half:

```
Effective coverage = (Mapped + 0.5 × Partial) / Total × 100
```

A PRD with less than **100% mapping** of BRD items cannot earn a Readiness Certificate, regardless of other scores. The BRD is the source of business truth; unmapped items are unfinished work.

---

## Edge cases

- **BRD item is wrong or outdated.** The PRD author may have updated scope intentionally. If you suspect this, flag as a P1 finding asking the author to either update the BRD or document the deviation in the PRD's "Changes from BRD" section.
- **One BRD item maps to many PRD sections.** Fine — list all sections in the mapping cell.
- **Multiple BRD items map to one PRD section.** Fine — but verify the single section actually addresses each item, not just touches the topic.
- **BRD is missing or empty.** Skip the coverage check and note in the report: "BRD coverage check not performed — no BRD provided."
