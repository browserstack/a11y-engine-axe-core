# 1:N Split Scenario Validation

When a single feature branches into multiple variants, every branch is its own requirement. Missing branches are the #1 cause of "we didn't think about that user type" bugs.

---

## What counts as a 1:N split

A 1:N split exists whenever the PRD describes behavior that varies along any of these axes:

- **User role** — admin / member / guest / superadmin
- **Subscription tier** — free / pro / enterprise / trial
- **Account state** — new / active / suspended / churned / locked
- **Device / platform** — web / iOS / Android / desktop / tablet
- **Geography** — US / EU / APAC, or any region-specific behavior
- **Locale / language** — i18n variants
- **Onboarding state** — first-time / returning / power user
- **Authentication state** — anonymous / logged in / SSO / 2FA-enabled
- **Permissions / feature flags** — beta / GA / enterprise-only / sunset
- **Data state** — empty / partial / full / overflow

If the PRD mentions any of these dimensions in any flow, that flow has a split.

---

## The validation procedure

For each feature or flow in the PRD:

### Step 1 — Enumerate the splits

Read the flow and list every dimension along which behavior varies. Example: "The dashboard shows different widgets for free vs pro users on mobile vs desktop" → splits are tier (free/pro) × platform (mobile/desktop) = 4 variants.

### Step 2 — Build the variant matrix

For a flow with N splitting dimensions, build the matrix of all combinations. For the example above:

| Variant | Tier | Platform | Specified? |
|---------|------|----------|------------|
| V1 | Free | Mobile | ? |
| V2 | Free | Desktop | ? |
| V3 | Pro | Mobile | ? |
| V4 | Pro | Desktop | ? |

### Step 3 — Check each variant

For each variant, verify the PRD specifies:
- What the user sees
- What they can do
- What happens on the key actions (success and failure)

Mark each cell:
- ✅ Fully specified
- ⚠️ Partially specified (mentioned but missing details)
- ❌ Not specified

### Step 4 — Generate findings

For each ❌ or ⚠️:
- **Core flow** (login, checkout, primary use case): **P0**
- **Important but secondary flow**: **P1**
- **Edge or rare flow** (e.g., suspended-user behavior on a marketing page): **P2**

---

## Common omissions to watch for

These variants are *frequently* missed in PRDs. Always check them explicitly:

- **The empty state** — what does a brand-new account see before any data exists?
- **The "almost full" state** — what happens near a quota limit (e.g., 9 of 10 items used)?
- **The "over limit" state** — what happens when the quota is exceeded?
- **The suspended/locked account** — most PRDs forget this exists
- **The "feature flag off" path** — what do users see when the feature is rolled out but not yet flipped on for them?
- **The downgrade path** — what happens to pro features when a user downgrades to free?
- **The cross-region edge case** — does behavior differ for users whose data resides in another region?

---

## When to push back vs flag

If the PRD says "behavior is identical across all variants" for some dimension, that's fine — note it as explicitly addressed.

If the PRD is silent on a dimension that *clearly* matters (e.g., a billing feature with no mention of free-tier behavior), don't try to guess what the author meant. File the finding and let them answer.

---

## Reporting

In the Review Report, group split-scenario findings under their dimension (usually "Edge Cases & Exceptions" or "Completeness", occasionally "Logic & Consistency"). Include the variant matrix in the finding body when there are 4+ unspecified variants — a table is clearer than prose.
