# Risk classification — what needs a human's eyes

Goal: for each dependency bump in the bulk PR, decide **how likely it is to affect the product** and whether
a human must review it before it ships. Output a table sorted by risk, manual-review items first.

## Inputs per bump

| Input | Where from |
|---|---|
| Lockfile directory | ticket `Package File` path (`references/jira.md`) |
| Semver jump | Dependabot PR title `bump <pkg> from X to Y` |
| Runtime vs dev | PR title prefix — `chore(deps):` = runtime, `chore(deps-dev):` = devDependency; confirm via `dependencies` vs `devDependencies` in that `package.json` |
| CVSS | ticket `**CVSS Score:**` |
| Direct vs transitive | is `<pkg>` listed in that `package.json`, or lock-only? |
| Check/review result | Phase 5 — `RUN_UNIT_TESTS`, `RUN_CHECKS`, `stack:code-review` |

## 1. Blast radius (from the lockfile directory)

| Radius | Directory matches | Weight |
|---|---|---|
| **Product-critical** | `axe-core/` (the submodule repo), `dom-forge-core/`, `a11y-engine-core/` **excluding** `**/test/**` and `**/examples/**`, `ip-protection/` | High |
| **Low** | `**/test/**`, `**/examples/**`, `mini-percy-renderer/`, `scripts/`, `fml/`, root dev tooling | Low |

Product-critical dirs run in the browser/extension or the ip-protection server — they ship. Test/example/tooling
lockfiles do not affect the shipped product.

## 2. Semver jump (from → to)

| Jump | Weight |
|---|---|
| **major** (`X.y.z` → `≥(X+1).0.0`), or any `0.x` **minor** (pre-1.0 minors are breaking) | High |
| **minor** (`1.2.x` → `1.3.0`) | Medium |
| **patch** (`1.2.3` → `1.2.4`) | Low |

## 3. Runtime vs dev

Runtime dependency = keep its weight. devDependency = drop one level (a dev-only bump can't reach production
behavior), **unless** it is a build/bundler tool (`esbuild`, `@babel/*`, `webpack`, `rollup`, `grunt*`) that
transforms shipped output — treat those as runtime.

## 4. CVSS (vuln severity — urgency, not change-risk)

`≥9.0` Critical · `7.0–8.9` High · `4.0–6.9` Medium · `<4.0` Low. High CVSS raises **priority** to fix, but on
its own does not force manual code review — a patch bump of a transitive test-only dep with CVSS 9 is still
low change-risk. Surface CVSS in the table regardless.

## Risk label

`risk = max(blast-radius weight, semver weight)` after the runtime/dev adjustment. Then:

## manual-review-required = true when ANY of:

- Blast radius = **product-critical** AND semver jump ≥ **minor** (real code change in a shipping path), **or**
- **major** version bump anywhere (breaking-change surface), **or**
- `<pkg>` is a **direct** dependency imported in product source — confirm with
  `grep -rl "require(['\"]<pkg>" <product-dir>` / `from ['\"]<pkg>`, **or**
- the bump touches the **axe-core submodule** (always manual — submodule + separate release), **or**
- Phase 5 flagged anything — `RUN_UNIT_TESTS`/`RUN_CHECKS` not green, or `stack:code-review` raised an issue.

Everything else (patch/minor bumps confined to test/example/tooling, transitive-only low-radius) is
**auto-shippable** — still shown, just not flagged.

## Output shape

```
DEPENDENCY        BUMP            DIR / RADIUS               CVSS  RUNTIME  RISK    MANUAL?  WHY
esbuild           0.19→0.21       a11y-engine-core /prod     8.1   build    HIGH    yes      major build-tool bump in shipping pkg
ws                8.20→8.21       axe-core /prod             7.5   runtime  HIGH    yes      submodule; runtime dep
axios             1.15→1.18       ip-protection /prod        7.5   runtime  MED     yes      minor bump, direct runtime dep in server
js-yaml           4.1→4.3         .../test/examples /low     —     dev      LOW     no       minor, test-only lockfile
```

Put every `MANUAL? ✔` row at the top of the report and call them out explicitly in the Phase 7 gate — these
are what the user reviews before `stack:publish-workflow` runs.
