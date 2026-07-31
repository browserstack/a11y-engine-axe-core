# Split Scenarios — specify every 1:N branch at authoring time

If a flow branches by any variable, **every branch must be specified while you author** —
not left for review to catch. This mirrors `stack:prd-reviewer`'s split-scenario check;
a missing branch in a **core flow is P0**, in a secondary flow is P1, in a rare flow is P2.

## Split axes to check for every flow

- **User role** (admin / member / guest / superadmin)
- **Subscription tier** (free / pro / enterprise / trial)
- **Account state** (new / active / suspended / churned / locked)
- **Device / platform** (web / iOS / Android / desktop / tablet)
- **Geography** (US / EU / APAC; region-specific behavior)
- **Locale / language** (i18n variants)
- **Onboarding state** (first-time / returning / power user)
- **Authentication state** (anonymous / logged-in / SSO / 2FA)
- **Permissions / feature flags** (beta / GA / enterprise-only / sunset)
- **Data state** (empty / partial / full / overflow)

## Procedure

1. For each flow, list which axes apply.
2. Build the variant matrix (e.g. tier × platform = 4 cells).
3. For each cell, specify: what the user sees, what they can do, and the outcome of the
   key action (success and failure).
4. Always include: empty state, near-quota, over-limit, suspended/locked, flag-off path,
   downgrade path, cross-region edge.

Any cell you cannot specify becomes a `[TBD — owner: …]`, not a silent omission.
