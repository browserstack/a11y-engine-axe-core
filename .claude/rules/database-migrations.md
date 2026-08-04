---
paths:
  - '**'
---

# Versioning Rules

a11y-engine has no SQL/NoSQL database — there are no schema migrations in the conventional sense. **The equivalent constraint is rule and helper versioning**: in-flight scans must be able to keep evaluating against the version they were dispatched with. This file is the load-bearing analogue to "database-migrations".

## Core rule

**Never modify an existing version file. Add a new one that inherits or siblings the previous.**

This applies across three concrete patterns in `ip-protection/`. See `knowledge/docs/flows/versioning.md` for the full reference with examples.

## Pattern 1 — `combined-rules-class-vN.js` (primary)

Location: `ip-protection/worker/combined-rules-class-v1.js` … `-v14.js`.

Each version is a JS class that `extends` the previous:

```js
// worker/combined-rules-class-v14.js
const CombinedRulesAllV13 = require('./combined-rules-class-v13');

class CombinedRulesAllV14 extends CombinedRulesAllV13 {
  getRuleFunctionMapping() {
    return {
      ...super.getRuleFunctionMapping(),
      input_label_name_mismatch: { matcher, check }
    };
  }

  getShortenedRuleKey() {
    return {
      ...super.getShortenedRuleKey(),
      label_content_name_mismatch: 'r45'
    };
  }
}
```

Dispatch is dynamic — `worker/combined-rules-worker-thread.js` does:

```js
const EvaluateClass = require(
  path.resolve(__dirname, `combined-rules-class-${version}.js`)
);
```

Scan metadata carries a `version` field (e.g., `"v14"`). Old scans on `"v10"` keep using `combined-rules-class-v10.js` untouched.

**To add a rule**: create `combined-rules-class-vN+1.js` that `extends V(N)`, override `getRuleFunctionMapping()` and/or `getShortenedRuleKey()` with spread-and-add. Do **not** edit any existing `-vN.js`.

## Pattern 2 — `commons/v2/*-v2.js` sibling files

Location: `ip-protection/commons/v2/`.

Some utilities have a base + a `-v2` sibling (e.g., `get-nodes-data.js` + `get-nodes-data-v2.js`, `find-visible-label.js` + `find-visible-label-v2.js`). Callers import whichever version they want by filename.

**To bump a commons helper**: create `name-v2.js` (or `-v3.js`) next to the existing file. Update only the check or rule that should adopt the new version. Leave other callers on the old file.

## Pattern 3 — versioned `*-evaluate-vN.js` checks

Location: `ip-protection/checks/combined-rules/`.

When an evaluator changes, a `-evaluate-v2.js` (or `-v3.js`) sibling is added next to the original. Which version runs is determined by which `combined-rules-class-vN.js` imports it.

## Hard prohibitions

- Never edit an existing `combined-rules-class-vN.js`.
- Never edit an existing `commons/v2/*.js` that ships base behavior — add a `-v2` / `-v3` sibling.
- Never edit an existing `*-evaluate.js` or `*-evaluate-vN.js` — add a new sibling.

## Adjacent: package version (`a11y-engine-core/package.json`)

The npm-package semver is a separate concern, controlled by `scripts/bumpA11yEngine.sh`:

- **Major** — axe-core major/minor upgrade OR major engine change (e.g., AI integration).
- **Minor** — new WCAG technique / success criterion, axe-core patch, major enhancement.
- **Patch** — bug fixes, rollbacks, minor enhancements, experimental → stable transitions.
- **`-AT` suffix** — AT-only releases (semver pre-release marker, excluded from this scope).

This is "release versioning" and is orthogonal to in-repo "rule versioning" above. The two are not coupled — adding `combined-rules-class-v15.js` does not automatically require a major package bump.

## Why this matters

Scans are long-running and asynchronous (chunked DOM → B1 queue → Type C on Percy → AI webhook → consolidation). A scan dispatched at `vN` may still be hydrating webhooks 30 minutes later. If `vN` got rewritten in-place during that window, the in-flight scan would produce a result mismatched with what was advertised. The append-only file pattern is what makes async scan replay safe.
