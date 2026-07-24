# debug-fp — usage

A user-facing guide for the `/debug-fp` skill. For the agent-facing flow, read `SKILL.md` and the `references/` folder.

## What it does

Given a rule ID, a URL, and one or more CSS selectors, drives Chrome to the page, executes the rule's actual algorithm against the flagged element(s), and returns a verdict: **TP** (true positive), **FP by design**, **FP by bug**, or **INCONCLUSIVE** — on two independent axes (WCAG and algorithm).

## Invocation

```
/debug-fp <rule-id> <url> [css-selector, …]
```

- `rule-id` — the axe / a11y-engine rule ID (`role-img-alt`, `color-contrast`, `image-alt`, …).
- `url` — the page where the violation was reported.
- `css-selector` — one or more CSS paths to the flagged element(s). Comma-separated or free-text ("selectors: `.foo`, `i[role='img']`") both work. Multiple selectors that resolve to the same element are automatically de-duplicated.

XPath is accepted but treated as a string; if the page has non-trivial shadow DOM, prefer a CSS path rooted at a known ancestor.

## Examples

```
/debug-fp role-img-alt https://qa-landmark-wapp.azurewebsites.net/recording
    selectors: .bi-info-circle, i[role="img"]

/debug-fp color-contrast https://example.com/pricing
    selectors: .cta-primary

/debug-fp image-alt https://example.com
    .hero-img, .logo-badge      # also use AI mode? deterministic
```

## Before you invoke — prep checklist

- **Ready at least one selector.** A screenshot alone is not enough; the agent will ask for one. Running against every element that matches the rule is last-resort and noisy.
- **Know which mode produced the violation (AI vs non-AI)** for rules that have both routes (`image-alt`, `link-name`, `accessible-name`, …). The agent will ask if it's ambiguous.
- **If the URL is inaccessible** (auth-gated, geo-blocked, removed, changed since scan) — have a `proxy_map.json` from the original scan ready and drop it at `mini-percy-renderer/proxy_map.json`. Mention this in the prompt: *"inaccessible site, proxyMap added at …"*.
- **Launch Claude Code with `claude --chrome`** if you want the live path (Path A). Not required for Path B.

## Path A vs Path B

The agent chooses automatically but will confirm before switching paths.

| | Path A — live URL | Path B — proxyMap replay |
|---|---|---|
| Launched via | `claude --chrome` | `scripts/launch-proxy-chrome.js` + jackproxy |
| Works for auth-gated / geo-blocked pages | ✗ (you'd need to log in) | ✓ (snapshot already captured it) |
| Works for removed or changed pages | ✗ | ✓ (scan-time DOM) |
| Platform | any | darwin-arm64 only (jackproxy binary) |
| Manual interaction (clicks, dropdowns) | ✓ | limited |
| Requires proxy_map.json | ✗ | ✓ |

**Never silently fall from A to B** — the agent will ask you which to use.

## What happens — step by step

1. **Intake.** Agent confirms rule, URL, selector(s), AI-vs-non-AI mode.
2. **Rule locate.** Finds the rule definition + check evaluators in `a11y-engine-core / axe-core / ip-protection / dom-forge-core`. Reports back the rule type (A / B1 / B2 / C / AI) and worker file.
3. **Docs fetch.** Pulls the public docs page for the rule's WCAG intent. If the page is a placeholder, falls back to the axe rule JSON's `tags` and check evaluators.
4. **Paper-triage.** Tries to verdict from static analysis + your `outerHTML`. If that's enough, you can stop here and skip the live drive.
5. **Drive browser.** Navigates Chrome to the URL (Path A) or spins up jackproxy + Chrome on `:9222` (Path B). Agent will pause and ask you to complete any login / cookie-banner / dropdown steps.
6. **Inject axe + write port.** Loads `a11y-engine-core/dist/axe.min.js`, calls `axe.setup(document)`, writes a port at `/tmp/debug-fp-<rule-id>.js` that iterates your selectors and calls the rule's actual helpers.
7. **Execute.** Runs the port, captures the returned JSON.
8. **Analyse.** Two axes: does WCAG apply? does the algorithm fire correctly? Combined into TP / FP-by-design / FP-by-bug / INCONCLUSIVE.
9. **Reuse or tear down.** Agent asks whether to run another selector/rule on the same page (session is still warm — much cheaper) or to kill Chrome + jackproxy. *Always answer this prompt — silently saying "done" is fine but tearing down is irreversible for the current session.*

## Output shape

```
Rule:       role-img-alt (A)
URL:        https://qa-landmark-wapp.azurewebsites.net/recording  (via proxyMap replay)
Selectors:  .bi-info-circle, i[role="img"]   (both resolved to the same element)
Element(s):
  - <i class="bi bi-info-circle" role="img" alt="Provides information about sub total">
    Verdict:    TRUE POSITIVE
      WCAG axis:  SC 1.1.1 applies — role=img exposed to AT with no accessible name.
      Algo axis:  fires correctly — aria-label/labelledby/title all absent.
    Reason:     alt on <i> is ignored by HTML-AAM; accessible name is empty.
    Evidence:   accessibleName="", computedRole="img", visibleToAT=true, checks all false
Trace:        (grep / read / inject / evaluate steps)
Artifacts:
  - /tmp/debug-fp-role-img-alt.js
  - /tmp/debug-fp-role-img-alt-raw.json
Fix hint:     Replace `alt="…"` with `aria-label="…"` on the <i>, or mark the icon decorative with aria-hidden="true".
```

Verdicts are *two-axis*: the WCAG axis can say "SC does not apply" even when the algorithm is doing exactly what its tests expect. That combination = **FP by design** — the engine needs a scope change, not a bug fix.

## Reuse the session to save tokens

The first run on a page pays for:
- agent reading `SKILL.md` + references + the axe rule JSON + check evaluators (one-time, amortized),
- starting jackproxy, launching Chrome, injecting `axe.min.js`,
- writing and executing the port,
- analysis + summary.

A **second run on the same page** (another selector, a different rule, a re-probe with different logic) skips almost all of the above: axe is already injected (`run-with-axe.js` detects it and no-ops), jackproxy is already serving, the tab is already on the page. Only the new port + summary cost tokens.

When the agent asks *"Chrome (`:9222`) + jackproxy (`:8080`) are still live on `<url>`. Run another selector, another rule, or tear down?"* — if you have anything else to check on this page, **say yes**.

## Output artifacts (survive the session)

- `/tmp/debug-fp-<rule-id>.js` — the browser-executable port. Re-runnable via `node .claude/skills/stack:debug-fp/scripts/run-with-axe.js /tmp/debug-fp-<rule-id>.js`.
- `/tmp/debug-fp-<rule-id>-raw.json` — the raw CDP return, if captured.
- Skill scripts: `scripts/launch-proxy-chrome.js`, `scripts/run-with-axe.js` are reusable for ad-hoc probes outside the skill.

Files in `/tmp/` are ephemeral — copy anything you want to keep.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| *"no Chrome on 127.0.0.1:9222"* | Path B Chrome not up, or died | Re-run `node .claude/skills/stack:debug-fp/scripts/launch-proxy-chrome.js <url>` |
| Port returns `decision: "undefined (no elements matched)"` | Selector is wrong for the hydrated DOM, or page didn't finish rendering | Re-run with `--wait=2000`; or inspect the page in DevTools and give the agent a corrected selector |
| Port returns `decision: "undefined (no axe)"` | Axe injection failed (strict CSP, closed shadow root) | Fall back to the native-DOM conversion described in `references/script-conversion.md` Path B |
| Background task reports *"exit code 143"* | `jackproxy` or Chrome received SIGTERM at teardown | Expected. Not a failure. |
| Docs page returns *"Content in development"* | Docs for this rule aren't published yet | Agent falls back to axe rule JSON + check evaluators automatically |
| Verdict says **INCONCLUSIVE** | Paper-triage + live probe both ambiguous | Ask the agent for the next probe it recommends (usually a specific attribute / computed-style check) |

## Limits and known issues

- **Type AI rules** (`image-alt-ai`, `link-name-ai`, AI heading-family): the port can reproduce the *client-side pre-filter*, but not the server-side Gemini judgement. The agent will say so explicitly.
- **Shadow DOM / cross-origin iframes**: open shadow roots work; closed ones don't; cross-origin iframes follow normal browser rules and are usually unreachable.
- **Platform**: Path B requires darwin-arm64 (jackproxy binary). Path A works anywhere `claude --chrome` works.
- **Does not modify rule source.** If the verdict is FP, the agent points at the file:line to change, but fixing the rule is the `add-rule` / normal dev flow.

## See also

- `SKILL.md` — the agent-facing workflow (don't edit unless you're changing the skill's behaviour)
- `references/rule-locator.md` — how rules are located across packages
- `references/script-conversion.md` — converting rule algorithms to browser-executable ports
- `references/axe-injection.md` — axe lifecycle, `nodeData` reconstruction for Type C/AI
- `references/fp-analysis.md` — the two-axis FP framework
- `references/proxy-map-fallback.md` — full Path B recipe
