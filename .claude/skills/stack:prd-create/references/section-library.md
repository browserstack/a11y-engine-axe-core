# Section Library — the review-aligned PRD skeleton

Every PRD authored by this skill uses the **same 14-section skeleton** that
`stack:prd-reviewer` checks for Completeness. The skeleton is always present;
**depth scales the elaboration inside each section, not whether the section exists.**

Depth tags per section: **[core]** (always filled), **[scale]** (filled at standard/deep,
may be `N/A — <reason>` at lite), **[deep]** (fully elaborated at deep; brief or
`N/A — <reason>` otherwise).

A section that genuinely does not apply is written as `N/A — <reason>` — never deleted.
The review skill penalizes *silent* omission, not justified N/A.

## The 14 sections

1. **Problem statement / user need** — [core] One paragraph, user's POV. Name the persona
   and the moment. Cite evidence (ticket, data, research). No "users want this".
2. **Goals and non-goals** — [core] Bullet goals + an explicit non-goals list.
3. **Target users / personas** — [core] Named persona(s) with the job-to-be-done.
4. **Success metrics (with thresholds)** — [core] Primary + secondary + counter metric,
   each quantified with a baseline and target. Numbers, not adjectives.
5. **User stories or use cases** — [scale] "As a <persona>, I … so that …" with binary
   acceptance criteria.
6. **Functional requirements** — [core] Each requirement testable and traceable.
7. **Non-functional requirements (performance, security, accessibility, i18n)** — [scale]
   Each with metric + threshold + load condition (e.g. "p95 < 200ms at 1000 RPS").
8. **Data model / state changes** — [scale] New/changed entities, states, transitions.
9. **API surface or integration points** — [scale] Endpoints/contracts touched.
10. **Error states and edge cases** — [core] Empty, error, permission-denied, concurrent,
    stale, rate-limited, partial-failure paths for each major flow.
11. **Out-of-scope / explicit exclusions** — [core] What is deliberately not built, and why.
12. **Dependencies (teams, services, third-parties)** — [scale] Named, with owner + risk.
13. **Rollout plan / feature flagging** — [scale] Flag, ramp, kill switch, comms, rollback.
14. **Open questions** — [core] Each with a recommendation and an owner; "None" if truly none.

## Depth → section behavior

- **lite** (small tweak): fill [core] sections; [scale]/[deep] become
  `N/A — <reason>` unless trivially relevant. Skip optional questions; flag gaps.
- **standard**: fill [core] + [scale]; single split matrix; [deep] kept brief.
- **deep** (new agent / multi-surface): fully elaborate all 14, full split matrix, BRD mapping,
  eval specs.

## Authoring rules applied to every section

- Quantify every modifier. "fast" → a latency number; "easy" → a measurable UX metric.
- Every requirement carries a **traceability** tag (see `quality-bar.md`).
- **Code references are SHA-pinned GitHub permalinks** rendered `[file → symbol](…/blob/<sha>/…#L..)`,
  never bare line numbers (see `grounding-protocol.md`).
- If a section mentions roles / tiers / platforms / states, expand each branch
  (see `split-scenarios.md`).
- For AI features, acceptance criteria are eval-based (dataset + metric + threshold).
