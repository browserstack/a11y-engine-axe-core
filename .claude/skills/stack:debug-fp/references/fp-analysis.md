# False-positive analysis framework

Given the JSON returned by `cdp-run.js`, decide **TP / FP / INCONCLUSIVE** and name the specific cause.

## Step 1 &mdash; does the script match the engine?

Before judging the verdict, confirm the port is faithful:

- Does `observed.target.tag` / `id` match what the violation report showed? If not, wrong selector &mdash; fix and rerun.
- Did `observed.errors` capture anything? If so, the ported script itself threw &mdash; investigate that first; the verdict is meaningless.
- Is `decision` one of `true | false | "undefined …"`? Any other value = contract violation.

## Step 2 &mdash; reconcile with the reported violation

Line up the three signals:

| Engine reported | Script decided | Meaning                                                                                                                                                       |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fail`          | `false` (fail) | **TP reproduced.** Proceed to step 3 to see _why_ it fails &mdash; maybe the rule itself is wrong.                                                            |
| `fail`          | `true` (pass)  | **FP candidate.** The live state differs from what the engine saw at scan time, or the ported algorithm is more correct than the original &mdash; see step 4. |
| `fail`          | `undefined`    | Check error &mdash; inconclusive. Usually means a commons helper couldn't be reached.                                                                         |
| `pass`          | `false`        | The page changed since the scan, or the selector now matches a different element. Not an FP &mdash; it's drift.                                               |

## Step 3 &mdash; `false` + `false` : why does the rule fail?

Read `reasons` bottom-up. The last entry is the branch that tipped the decision. Check whether that branch's premise actually aligns with the WCAG criterion cited in the rule's `tags` **and** with the rule's public docs page fetched in step 2 (`https://www.browserstack.com/docs/accessibility/rules/a11y-engine/<major.minor>/<rule-id>`). If the docs list the live-page pattern under "pass examples" or "known issues" but the algorithm fails it &mdash; that is an FP even though the algorithm is running as written.

Common legitimate failures with misleading messages:

- **Rule tests the wrong surrogate.** e.g., a rule fails on `label` with no direct text, but the form element has a fully sufficient `aria-label` &mdash; true WCAG pass, but the algorithm never looked at the control.
- **Rule inherits an axe-core bug.** Cross-reference `axe-core/CHANGELOG.md` / GitHub issues.
- **Rule ignores a WCAG-allowed mechanism.** e.g., doesn't consider `title`, or doesn't pierce shadow DOM.

If any apply, the engine is **"technically failing for a valid page" &mdash; that is an FP**, even though the algorithm is running as written. Flag it as such.

## Step 4 &mdash; `false` (engine) + `true` (script) : FP confirmed?

Possible causes:

1. **Hydration delay.** Rule scanned before an async label appeared. Mitigation: re-run with `--wait=3000` &mdash; if script _still_ passes, the engine snapshot was stale. Classify as **FP due to timing** and point to the scan-type's DOM capture window.
2. **Shadow/iframe visibility.** Element lives in a nested context the engine does capture but the script does not (or vice-versa). Re-port with piercing selector &mdash; if it now fails, the engine was right.
3. **Commons mis-port.** Your stubbed helper was stricter than the real one. Re-read the commons source line-by-line against your inline.
4. **Selector drift.** Engine flagged a _different_ element matching the same selector &mdash; check that `observed.target.outerHTML` matches the one the user reported. If not, reproduce with the engine's actual selector (usually a longer CSS path, see `target` field in the violation payload).
5. **Ported algorithm is wrong (rare but real).** Diff side-by-side. Re-run with the original algorithm faithfully ported.

Only classify as **FP due to rule bug** after ruling out 1–4. Then point the user at the exact branch in the source that needs fixing, e.g., "`label-empty-evaluate.js:146` &mdash; `isFormElementWithIdPresent` misses `<input>` inside a shadow root."

## Step 5 &mdash; render the two-axis judgment

Every verdict must state **two independent judgments** before classifying:

### WCAG axis &mdash; does the cited SC actually apply?

Look up each WCAG success criterion cited in the rule's `tags` (e.g. `wcag412`, `wcag111`, `wcag131`) and ask: _given this element's effective role, focusability, and content, does the SC text actually apply?_

Common misses:

- **4.1.2 (Name, Role, Value)** applies to **"user interface components"**. A non-interactive element (default role `cell`, `generic`, `none`, etc., not focusable, no handlers) is not a UI component &mdash; 4.1.2 does not apply.
- **1.1.1 (Non-text Content)** applies to non-text content that **conveys information**. An empty element conveys nothing &mdash; 1.1.1 does not apply.
- **1.3.1 (Info and Relationships)** applies when presentation carries structure that must be programmatically determined. A single-item list inside a parallel group where other siblings have multiple items may or may not count &mdash; read the SC's "understanding" doc, don't assume.

If all cited SCs demonstrably do not apply, the element is WCAG-valid regardless of what the algorithm does. Record `WCAG axis: SC does not apply` with the one-sentence reason.

### Algo axis &mdash; does our algorithm correctly implement the SC?

Separately, trace the algorithm branches for this element and decide whether the fire/pass decision is correct relative to _what the algorithm is trying to check_. An algorithm can be internally consistent (algo axis = correct) while still mis-targeting an element that WCAG didn't care about (WCAG axis = does not apply).

### Classify

| WCAG axis         | Algo axis                                                                 | Verdict                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| SC does not apply | fires                                                                     | **FP by design** &mdash; highest confidence FP. Rule is targeting elements WCAG doesn't care about.                            |
| SC applies        | fires correctly (or misses wrong branch but still lands on right verdict) | **TP**.                                                                                                                        |
| SC applies        | fires on wrong branch / misses a valid mechanism                          | **FP by bug** &mdash; WCAG would fail this too, but our algorithm fires for the wrong reason or misses a legitimate exemption. |
| Any               | undefined / check errored                                                 | **INCONCLUSIVE**.                                                                                                              |

Fix paths:

- FP by design &rarr; narrow the rule's selector / add an "out-of-scope" guard at the top of `evaluate`.
- FP by bug &rarr; fix the specific branch; add a regression test mirroring the case.
- TP &rarr; page-side fix; no rule change.

Use the exact verdict format from SKILL.md §9. One sentence per axis, concrete evidence, actionable next step. No hedging.

## Edge: rule disagrees with its own spec

If the rule's `metadata.description` says one thing and the algorithm does another, that is a spec/impl mismatch &mdash; an **FP by design**. The fix is to the rule; file a Jira against the rule owner with the reproduced case.
