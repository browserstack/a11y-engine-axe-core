# 8-Dimension PRD Audit Rubric

Each dimension scores 0-10. Use the anchors below to calibrate.

---

## 1. Completeness

**The question:** Are all the sections an engineer, designer, or QA tester would need actually present?

**Required sections** (most PRDs need most of these):
- Problem statement / user need
- Goals and non-goals
- Target users / personas
- Success metrics (with thresholds)
- User stories or use cases
- Functional requirements
- Non-functional requirements (performance, security, accessibility, i18n)
- Data model / state changes
- API surface or integration points
- Error states and edge cases
- Out-of-scope / explicit exclusions
- Dependencies (teams, services, third-parties)
- Rollout plan / feature flagging
- Open questions

**Scoring anchors:**
- **9-10**: Every section present and substantive
- **6-8**: Most sections present; minor gaps that don't block dev
- **3-5**: Several critical sections missing or one-line placeholders
- **0-2**: Skeleton only; reads like an idea, not a spec

**Common findings:** missing non-goals; success metrics stated as adjectives ("delightful") not numbers; no rollout plan.

---

## 2. Clarity

**The question:** Can two engineers read this and build the same thing?

**Look for:**
- Undefined terms (especially domain jargon used without a glossary)
- Vague modifiers: "fast", "easy", "robust", "scalable", "intuitive", "modern", "seamless"
- Pronouns with ambiguous antecedents ("it should handle this")
- Sentences that can be read two ways
- Conditional logic written in prose where a table or flowchart would be clearer
- Inconsistent terminology (calling the same thing "user", "customer", "account" in different sections)

**Scoring anchors:**
- **9-10**: Every requirement reads exactly one way; terms defined; quantified
- **6-8**: Mostly clear; a few vague phrases that need pinning down
- **3-5**: Multiple ambiguities in core requirements
- **0-2**: Reads more like marketing copy than a spec

**Test:** Pick three random requirements. Could a junior engineer implement each one without asking a question? If no, deduct.

---

## 3. Logic & Consistency

**The question:** Do the requirements agree with each other, and do they make internal sense?

**Look for:**
- Direct contradictions ("users can do X" in one section, "X is not allowed" in another)
- Implicit contradictions (a flow that requires data that an earlier requirement says we don't store)
- State machines with unreachable or undefined states
- Time/ordering issues (step B depends on step A's output but they run in parallel)
- Permissions logic that contradicts the user roles section
- Math that doesn't add up (percentages > 100%, mutually exclusive options that are both default)

**Scoring anchors:**
- **9-10**: No contradictions found; all flows internally consistent
- **6-8**: Minor inconsistencies in non-core areas
- **3-5**: One or more contradictions in core flows
- **0-2**: Fundamentally incoherent; sections seem to describe different products

---

## 4. Testability

**The question:** Can QA write a test plan from this without making things up?

**Every requirement should have:**
- A measurable acceptance criterion (number, threshold, observable behavior)
- A clear pass/fail condition
- For performance requirements: a metric, a threshold, and a load condition ("p95 latency < 200ms at 1000 RPS")

**Anti-patterns:**
- "The system should be performant"
- "Users will find it easy to use"
- "Handles errors gracefully"
- "Works across all major browsers" (which ones? what counts as "works"?)

**Scoring anchors:**
- **9-10**: Every functional and non-functional requirement has acceptance criteria
- **6-8**: Most do; a few non-critical ones are unmeasurable
- **3-5**: Many requirements have no acceptance criteria
- **0-2**: PRD describes intent, not behavior

---

## 5. Scope Discipline

**The question:** Is the boundary between in-scope and out-of-scope obvious and defended?

**Look for:**
- An explicit "Out of scope" / "Non-goals" section
- MVP vs future-phase distinction where applicable
- Scope creep signals: "and also...", "we might want to...", "would be nice if..."
- Hidden scope: requirements buried in prose that imply major work (e.g., one sentence mentioning "syncs with their calendar" implies an entire integration)

**Scoring anchors:**
- **9-10**: Crisp scope; non-goals listed; phases explicit
- **6-8**: Scope clear; minor scope creep in a few sections
- **3-5**: No explicit out-of-scope section; significant hidden scope
- **0-2**: Unbounded; reads as "everything is in scope"

---

## 6. Edge Cases & Exceptions

**The question:** Has the author thought about what happens when things go wrong?

**Required coverage for each major flow:**
- Empty state (no data yet)
- Error state (API fails, network drops, validation fails)
- Permissions denied
- Concurrent action (two users acting on same resource)
- Stale data (cache invalidation, optimistic UI corrections)
- Rate limits / quota exceeded
- Partial failure (multi-step operation fails midway)

**Scoring anchors:**
- **9-10**: Each flow has explicit edge-case handling
- **6-8**: Common edge cases covered; some less common ones missed
- **3-5**: Happy path only; few error states defined
- **0-2**: No edge cases addressed at all

---

## 7. Dependencies & Risks

**The question:** Does the PRD acknowledge what could derail it?

**Look for:**
- Upstream dependencies (other teams' deliverables, infrastructure changes)
- Downstream consumers (services or features that will need to adapt)
- Third-party dependencies (APIs, libraries, vendor SLAs)
- Data dependencies (does the required data exist? is it clean?)
- Compliance/legal/security risks (PII, GDPR, SOC2, age-gating, accessibility)
- Capacity/cost risks (will this 10x our infra bill?)
- A risks section with mitigations, not just a list

**Scoring anchors:**
- **9-10**: Dependencies mapped; risks identified with mitigations
- **6-8**: Most dependencies named; risks listed but mitigation thin
- **3-5**: Major dependencies omitted or no risk section
- **0-2**: Assumes a frictionless world

---

## 8. Traceability

**The question:** For each requirement, can you answer "why is this here?"

**Every requirement should trace to one of:**
- A user need or pain point (with evidence: research, support tickets, data)
- A business goal or OKR
- A BRD item (if a BRD exists)
- A regulatory or compliance requirement
- A technical constraint or tech-debt remediation

**Anti-patterns:**
- "Users want this" (which users? how do you know?)
- Requirements that exist with no stated rationale
- Mismatched priorities (P0 requirements that trace to a "nice to have" goal)

**Scoring anchors:**
- **9-10**: Every requirement traces to a documented need; evidence cited
- **6-8**: Most trace; a few orphan requirements
- **3-5**: Many requirements have no clear rationale
- **0-2**: PRD reads as a wishlist without justification

---

## How to use this rubric

1. Score each dimension independently. Don't let one dimension contaminate another (a clear PRD can still be untestable).
2. Write a 1-3 sentence justification per score citing specific sections.
3. Compute the overall: simple average of the 8 scores. Below 6.0 average → "Not Ready" by default.
4. Flag any dimension scoring below 5 as an automatic P0, regardless of overall average.
