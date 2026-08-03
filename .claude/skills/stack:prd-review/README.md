# PRD Reviewer — Claude Code Skill

A structured PRD audit skill for Claude Code. Reviews Product Requirements Documents against an 8-dimension rubric, grades issues P0/P1/P2, validates 1:N split scenarios and BRD coverage, and issues a Readiness Certificate when the PRD passes the Definition of Ready check.

## What it does

When you ask Claude Code to review a PRD, the skill:

1. **Reads the PRD end to end** (orientation pass — no grading yet), including **embedded images and linked Figma frames** — these are retrieved and read (images multimodally, Figma via MCP) so spec that lives in a diagram or mockup is reviewed, not skipped
2. **Scores 8 dimensions** — Completeness, Clarity, Logic & Consistency, Testability, Scope Discipline, Edge Cases, Dependencies & Risks, Traceability
3. **Generates severity-graded findings** — P0 blocking / P1 important / P2 suggestion — with quoted PRD text, concrete impact, and a recommended fix
4. **Validates 1:N splits** — verifies every branch in role/tier/platform/state-dependent flows is specified
5. **Checks BRD coverage** (optional) — maps every BRD item to a PRD section, flags unmapped items as P0
6. **Produces a Review Report** — Markdown file with a neutral PRD summary, executive summary, scorecard, findings, BRD coverage map, and verdict
7. **Issues a Readiness Certificate** — only if the PRD clears all DoR criteria; otherwise issues a Not Ready certificate with explicit blockers

## Install

This skill ships as part of the `stack-org` org-wide stack in the BrowserStack AI Harness. It is installed automatically wherever `stack-org` is applied — no per-developer setup is required.

Once installed, it is invokable as `stack:prd-reviewer` and Claude Code also activates it automatically on the trigger phrases below.

## Use

Just ask Claude Code to review a PRD:

```
Review the PRD at docs/prd-checkout-v2.md
```

```
Audit this spec for readiness — paste:
[your PRD text]
```

```
Run a full audit on the attached PRD and check coverage against the BRD I shared yesterday.
```

The skill activates on phrases like "review this PRD", "audit our spec", "is this PRD ready", "find gaps in the requirements doc", "DoR check", and similar.

### Review depths

The skill will ask which depth you want, or you can request one up front:

- **Quick scan** — top 5-10 issues only
- **Standard audit** — full 8-dimension review (no BRD check)
- **Full audit** — 8-dimension review + BRD coverage + Readiness Certificate

## Output

The skill writes two Markdown files to your project (or wherever you specify):

- `prd-review_<prd-name>_<YYYY-MM-DD>.md` — the Review Report
- `prd-readiness_<prd-name>_<YYYY-MM-DD>.md` — the Readiness Certificate (Full audit only)

## Skill layout

```
stack:prd-reviewer/
├── SKILL.md                                        # entry point (~140 lines)
├── README.md                                       # this file
└── references/
    ├── dimensions.md                               # 8-dimension rubric
    ├── severity-grading.md                         # P0/P1/P2 definitions
    ├── review-report-template.md                   # output format
    ├── readiness-certificate-template.md           # certificate format
    ├── split-scenarios.md                          # 1:N validation
    ├── brd-coverage.md                             # BRD traceability
    └── visual-content.md                           # images & Figma (MCP)
```

Reference files load on demand — the core SKILL.md stays under context budget while the detailed rubrics are available when the audit reaches the relevant phase.

## License

MIT — fork it, edit it, ship it. If your team uses a different rubric (more dimensions, different severity thresholds, custom DoR criteria), edit the reference files. The phase structure is the load-bearing part; the specific anchors are tunable.
