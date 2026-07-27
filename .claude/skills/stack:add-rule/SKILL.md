---
name: stack:add-rule
description: Add a new accessibility rule to the engine. Guides through B1, C, or AI rule creation.
argument-hint: '<rule-name> <type: b1|c|ai>'
---

# Add Rule

**Read first**: [`.claude/knowledge/docs/flows/rule-types.md`](../../knowledge/docs/flows/rule-types.md) — authoritative taxonomy (worker-based, not JSON-location-based), AI sub-fanout, and the exact dispatch function for each lane.

## Determine Rule Type

- **B1** — Client-side, runs in browser. All logic in a11y-engine-core.
- **C** — Server-side processing. Logic split between a11y-engine-core (orchestration) and ip-protection (workers).
- **AI** — Type C with AI counterpart. Multiple AI sub-lanes (alt-text, color-contrast, heading, custom-elements) — pick the right worker per `rule-types.md` § AI fan-out.

## Type B1 (Client-side)

1. **Check definition:** `a11y-engine-core/lib/checks/<category>/<rule-name>.json`
2. **Check evaluate:** `a11y-engine-core/lib/checks/<category>/<rule-name>-evaluate.js`
3. **Rule definition:** `a11y-engine-core/lib/rules/<category>/<rule-name>.json`
4. **Commons (if needed):** `a11y-engine-core/lib/commons/`
5. **Test:** Add test fixtures and assertions in `a11y-engine-core/test/`

## Type C (Server-side)

1. **Client orchestration:** Follow B1 steps for the client portion.
2. **Server rule:** `ip-protection/rules/<rule-name>.json`
3. **Server check:** `ip-protection/checks/<rule-name>/`
4. **Server commons:** `ip-protection/commons/v2/` — **new version file only, never modify existing**.
5. **Worker registration:** Update worker configuration.
6. **Test:** Jest tests in `ip-protection/test/`

## Type AI

1. Follow Type C steps.
2. Add AI counterpart: `<rule-name>-ai` in `workerAI.js`.
3. Map original rule to AI variant.

## Checklist

- [ ] Rule JSON has correct `id`, `selector`, `tags` (WCAG criteria)
- [ ] Check has `evaluate` function returning `true`/`false`/`undefined`
- [ ] `impact` set: `critical` | `serious` | `moderate` | `minor`
- [ ] `markTaskCompleted` called before `sendResponse` at exit points
- [ ] Tests cover happy path, null/missing DOM, edge cases
- [ ] Lint passes: `npm run lint:check`
