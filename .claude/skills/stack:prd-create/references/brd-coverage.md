# BRD Coverage — map every business requirement (optional)

Used only when the user supplies a BRD (`--brd <path|url>`). A BRD states *what the business
needs*; the PRD is *how the product delivers it*. Mirrors `stack:prd-reviewer`'s coverage
check so the created PRD maps cleanly.

## Procedure (during drafting)

1. Extract a numbered list of distinct business requirements: **BRD-1, BRD-2, …**
2. As you write each PRD section, record which BRD item(s) it addresses.
3. Classify each BRD item:
   - ✅ **Mapped** — substantively addressed with acceptance criteria
   - ⚠️ **Partial** — mentioned, details missing
   - ❌ **Unmapped** — not addressed
4. Drive coverage to **100% Mapped** before finishing. At self-check:
   - ❌ Unmapped → **P0** (must fix before handoff)
   - ⚠️ Partial → **P1** (or **P0** if compliance/security)
5. Reverse check: any PRD requirement with no BRD item must state its own rationale
   (traceability), or it is an orphan finding.

## Output

Include a coverage table in the PRD appendix (BRD item → PRD section → status) and report the
coverage % in the closing summary. **Coverage % = (Mapped + 0.5 × Partial) / Total BRD items.**
