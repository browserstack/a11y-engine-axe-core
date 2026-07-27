# Overview — the three main packages

## The packages

| Package            | Runtime                                                 | Job                                                                      |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `a11y-engine-core` | Browser (extension, Website Scanner, A11y Automate SDK) | Runs Type A rules in-page; serializes DOM for B1/B2/C                    |
| `ip-protection`    | Node.js server + BullMQ workers                         | Ingests DOM, runs B1/B2/C/AI rules, consolidates results, sends response |
| `dom-forge-core`   | Browser (Percy-driven headless)                         | Captures DOM + assets for async rule execution in a controlled render    |

`axe-core/` (submodule) is wrapped — never modified directly. `mini-percy-renderer/` is a local debugging tool, not part of production scan flow.

## High-level data flow

```
┌──────────────────┐   DOM + meta   ┌────────────────────┐
│ a11y-engine-core │ ─────────────▶ │                    │
│ (extension)      │  HTTP + socket │                    │
└──────────────────┘                │                    │
                                    │    ip-protection   │
┌──────────────────┐  DOM snapshot  │   (HTTP routes +   │  consolidated
│ dom-forge-core   │ ─────────────▶ │  BullMQ workers)   │ ─────────────▶  client
│ (Percy runtime)  │  S3 + proxy    │                    │  response
└──────────────────┘      map       └────────────────────┘
                                             │
                                             ▼
                                    ┌────────────────────┐
                                    │ AI service (Basic  │
                                    │ auth, webhook)     │
                                    └────────────────────┘
```

Two ingress paths to `ip-protection`:

- **From extension** — DOM chunks over socket.io, one HTTP call per scan (`POST /build-proxy-map`).
- **From dom-forge-core (on Percy)** — DOM + assets uploaded to S3 by the extension; Percy callback triggers Type C results via `/accept_percy_result` or AI candidates via `/accept_rules_data_percy`.

One egress: socket-backed `sendResponse()` from `controllers/apiClient.js` POSTs consolidated results to the WebA11y backend at `/api/a11y_engine_jobs`.

## Vocabulary (load-bearing only — see `knowledge/GLOSSARY.md` for the full list)

| Term             | Meaning                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Run              | One end-to-end run for a page. Has a `scanId` (a.k.a. `runId` downstream).                              |
| Scan             | Complete end to end scan which can include multiple runs for a product.                                 |
| Scope key        | `product@userId@scanId` — the UUID for each scan. `getScopeKey()` in `utils/helpers.js`.                |
| B1 / B2 / C / AI | Rule execution lane — **determined by worker dispatch, not rule JSON location**. See `rule-types.md`.   |
| Proxy map        | Map of original asset URL → S3-hosted proxy URL. Required for Type C to render without phoning home.    |
| Combined rules   | B1/B2 rule batch runner — see `versioning.md` for the `combined-rules-class-v*` inheritance chain.      |
| EOF              | End-of-file marker in Redis — signals a chunked payload is complete and ready for a worker to dispatch. |

## See also

- `rule-types.md` — rule taxonomy.
- `scan-lifecycle.md` — full end-to-end flow.
- `dom-capture.md` — full Type C pipeline.
