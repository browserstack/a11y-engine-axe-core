# Product: a11y-engine (Spectra)

## What it is

**Spectra** is BrowserStack's accessibility rule engine. It powers automated WCAG audits across the BrowserStack Accessibility product: the browser extension, the Website Scanner, the A11y Automate SDK, and the Percy-driven async lanes.

It is built on a **forked version of axe-core 4.11.0** (git submodule at `axe-core/`), wrapped with BrowserStack's own client-side audit engine, server-side workers, AI-assisted rule lanes, and a separate browser DOM interaction engine that runs on Percy infrastructure.

## Why "Spectra"

The internal product name is Spectra; the npm package and most code identifiers are `a11y-engine` / `@browserstack/a11y-engine-core`. Both names refer to the same thing.

## Sub-projects

| Sub-project            | Runtime                                                                                                              | Purpose                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a11y-engine-core/`    | Browser (extension, Website Scanner, A11y Automate SDK)                                                              | Type A rules in-page; DOM serialization for B1/B2/C lanes. Published as `@browserstack/a11y-engine-core` on GitHub Packages.                         |
| `ip-protection/`       | Node.js server + BullMQ workers (three pods: `worker.js`, `aiWorker.js` short bucket, `aiWorkerLong.js` long bucket) | Ingests DOM, runs B1/B2/C/AI lanes, consolidates results, sends response to WebA11y backend.                                                         |
| `dom-forge-core/`      | Browser (Percy-driven headless)                                                                                      | Captures DOM + assets for async rule execution in a controlled render. **Executes Type C rules.** Published as `@browserstack/dom-forge-percy-core`. |
| `mini-percy-renderer/` | Node.js (Darwin-arm64 only)                                                                                          | Local Percy snapshot replay for debugging Type C rules without invoking live Percy.                                                                  |
| `axe-core/`            | Git submodule                                                                                                        | BrowserStack's fork of axe-core 4.11.0. Wrapped — never modified directly without explicit approval.                                                 |
| `scripts/`             | Bash + Node                                                                                                          | Release automation, linting, setup, redis helpers                                                                                                    |

## Rule type vocabulary

The taxonomy is **worker-based, not JSON-location-based**. Where a rule's `evaluate` function runs at scan time determines its type, not where its `.json` file sits.

| Type           | Runs where                                                                               | When                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**          | Browser (extension / SDK)                                                                | Synchronous, in-page. Result inlined into the scan response.                                                                                       |
| **B1**         | `ip-protection` main worker (in a `worker_thread` spawned by `combined-rules-runner.js`) | Async. Triggered by EOF on the B1 DOM-chunks stream.                                                                                               |
| **B2**         | `ip-protection` main worker                                                              | Async. Aggregation over all B1 results for a scan.                                                                                                 |
| **C** (non-AI) | `dom-forge-core` on Percy infrastructure                                                 | Async. Runs **inside Percy**, not in `ip-protection`. `workerC.js` in `ip-protection` is the result sink.                                          |
| **AI**         | `ip-protection` AI worker process                                                        | Async. Candidates collected by `dom-forge-core` on Percy (for Type C-origin AI) or by B1 (for heading AI), then routed through an AI sub-pipeline. |

**Common misconception**: people see `ip-protection/workerC.js` and assume Type C rules run there. They don't. Percy + `dom-forge-core` runs them; `workerC.js` ingests results and forwards them to consolidation.

## AI sub-pipelines (4 in current code)

| Sub-type                 | Candidate ingress                                             | Worker file                         | AI endpoint                          |
| ------------------------ | ------------------------------------------------------------- | ----------------------------------- | ------------------------------------ |
| Alt-text / image AI      | `POST /accept_rules_data_percy` (type `altText`)              | `worker/workerAI.js`                | `suggest-alt-text`                   |
| Color-contrast AI        | `POST /accept_rules_data_percy` (type `color-contrast-ai-v1`) | `worker/jobAIColorContrast.js`      | `analyse-text-contrast`              |
| Heading AI (preprocess)  | B1 check handler enqueues when `enableHeadingAIRule` is true  | `worker/workerPreProcessAIhtml.js`  | `analyze-heading-issues`             |
| Heading AI (postprocess) | `controllers/acceptAIResult.js:acceptHeadingsAIResult`        | `worker/workerPostProcessAIhtml.js` | (no API call — DOM reconstruction)   |
| Custom-elements AI       | `POST /accept_rules_data_percy` (type `customElement`)        | `worker/workerCustomElementsAI.js`  | `analyze-custom-element-interaction` |

## Note on Confluence taxonomy vs code

Confluence's "AllyEngine Rule Categories" page lists **A / B1 / B2 / C1 / C2 / D**. In code:

- `C1` / `C2` do not exist as a distinction — there is a single `C` lane split only by AI vs non-AI output endpoint.
- `D` (assisted tests) is out of scope for this stack — see `ip-protection/assistedTests/` and the source repo's `.claude/skills/add-assisted-test/`.

## Ecosystem

- **WebA11y backend** — receives the consolidated scan response via `POST /api/a11y_engine_jobs`. Lives in the sibling `accessibility` repo.
- **Frontend extension** — the BrowserStack Accessibility extension. Code lives in the sibling `frontend` repo at `frontend/apps/accessibility-toolkit/`.
- **Percy** — BrowserStack's visual testing infra. Loads `axe.min.js` + `dom-forge-engine-core.min.js` from S3 (uploaded by the release flow) at scan time.
- **AI service** — external AI API. Inbound (webhooks) via Basic auth with rotating `BASIC_WEBHOOK_AUTHTOKEN_0` / `_1`; outbound via Basic auth with `BASIC_AI_AUTHTOKEN`.
- **Vault** — secrets storage (Percy token, WebA11y API credentials, etc.). Accessed via VPN.
