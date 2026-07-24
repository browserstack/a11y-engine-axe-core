# Versioning Patterns

**Core rule**: never modify an existing version file. Add a new one that inherits / siblings the previous. This lets in-flight scans keep evaluating against the version they were dispatched with.

Three concrete patterns live in `ip-protection/`. Pick the one that matches where you're adding logic. See also `rules/database-migrations.md`.

---

## Pattern 1 — combined-rules class chain (primary example)

`ip-protection/worker/combined-rules-class-v1.js` through `-v14.js` (and counting). Each version is a JS class that `extends` the previous.

```js
// worker/combined-rules-class-v14.js
const CombinedRulesAllV13 = require('./combined-rules-class-v13');

class CombinedRulesAllV14 extends CombinedRulesAllV13 {
  getRuleFunctionMapping() {
    return {
      ...super.getRuleFunctionMapping(),
      input_label_name_mismatch: { matcher, check },
      label_content_name_mismatch: { matcher, check },
      unnecessary_list: { matcher, check },
    };
  }

  getShortenedRuleKey() {
    return {
      ...super.getShortenedRuleKey(),
      label_content_name_mismatch: 'r45',
    };
  }
}
```

**Dispatch** is dynamic — `worker/combined-rules-worker-thread.js` does:

```js
const EvaluateClass = require(
  path.resolve(__dirname, `combined-rules-class-${version}.js`)
);
```

So the scan metadata carries a `version` field (e.g., `"v14"`), and the correct class gets loaded at runtime. Old scans on `"v10"` keep using `combined-rules-class-v10.js` untouched.

**To add a rule to this chain**: create `combined-rules-class-vN+1.js` that `extends V(N)`, override `getRuleFunctionMapping()` and/or `getShortenedRuleKey()` with spread-and-add. Do **not** edit any existing `-vN.js`.

---

## Pattern 2 — `commons/v2` sibling files

`ip-protection/commons/v2/` holds utility modules. Some have both a base and a `-v2` sibling (e.g., `get-nodes-data.js` + `get-nodes-data-v2.js`, `find-visible-label.js` + `find-visible-label-v2.js`). Callers require whichever version they want by filename.

```
commons/v2/
  get-nodes-data.js        ← v1, still in use by older rule versions
  get-nodes-data-v2.js     ← v2, called by newer rule versions
```

**To bump a commons helper**: create `name-v2.js` (or `-v3.js`) next to the existing file. Update only the check / rule you want to adopt the new version. Leave other callers on the old file.

---

## Pattern 3 — versioned evaluate checks

`ip-protection/checks/combined-rules/` holds per-check `-evaluate.js` files. When a check changes, a `-evaluate-v2.js` sibling gets added.

```
checks/combined-rules/
  input-label-name-mismatch-evaluate.js       ← older version
  input-label-name-mismatch-evaluate-v2.js    ← current version, consumed by combined-rules-class-v14
  unnecessary-list-evaluate.js
  unnecessary-list-evaluate-v2.js
```

Which version runs is determined by which `combined-rules-class-vN.js` imports it. See `combined-rules-class-v14.js` top — imports `-v2` for some, the unversioned file for others.

---

## What never changes

- Never edit an existing `combined-rules-class-vN.js`.
- Never edit an existing `commons/v2/*.js` that ships the base behavior — add a `-v2` / `-v3` sibling.
- Never edit an existing `*-evaluate.js` or `*-evaluate-vN.js` — add a new sibling.

These are **hard rules** — `rules/database-migrations.md` and `agents/stack:feature-builder.md` enforce them.

## See also

- `rule-types.md` — how versions flow through worker dispatch.
- `workers.md` — where `combined-rules-worker-thread.js` gets spawned.
- `rules/database-migrations.md` — enforcement layer.
