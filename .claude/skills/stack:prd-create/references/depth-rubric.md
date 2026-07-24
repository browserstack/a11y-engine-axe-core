# Depth Rubric — infer how deep to go

Depth is inferred from the request, **stated to the user, and overridable**. It scales the
elaboration inside the 14-section skeleton — never whether a section exists.

## Inference signals

| Signal | Leans lite | Leans standard | Leans deep |
|---|---|---|---|
| Surface count | 1 small change | 1 surface | multiple surfaces / new surface |
| Newness | tweak to existing | new option on existing | net-new feature or agent |
| Personas | 1 | 1–2 | multiple, cross-role |
| Cross-team seams | none | light | several |
| Data / metrics impact | negligible | measurable | new metrics / instrumentation |

Pick the level that most signals point to. When torn between two, pick the **deeper** one.

## State it, allow override

After inferring, print one line and continue, e.g.:

> Reading this as a **standard** PRD (single surface, one persona). Reply `lite` or `deep` to change.

If the user replies with a level, adopt it. Never silently pick a depth.

## Depth → behavior

- **lite** — fill `[core]` sections (see `section-library.md`); `[scale]`/`[deep]` become
  `N/A — <reason>` unless trivially relevant. Skip optional questions; flag gaps.
- **standard** — fill `[core]` + `[scale]`; one split matrix; brief `[deep]`. Ask the few
  feature-specific unknowns.
- **deep** — fully elaborate all 14 sections, the full split matrix, BRD mapping, and eval
  specs. Insist on missing grounding rather than flagging it.

## AI-feature detection

If the feature produces or depends on **model output** (generation, healing, scoring,
classification, ranking, extraction, agentic actions), treat it as an **AI feature**. Then:

- Its functional requirements satisfy the **Testability** dimension via **evals**:
  a named dataset, an eval metric (accuracy / FP rate / latency / consistency), and a
  threshold. This is not a separate gate — it is *how AI requirements pass Testability*.
- Note eval cadence and any per-surface baseline in the Non-functional or Success-metrics
  section.
