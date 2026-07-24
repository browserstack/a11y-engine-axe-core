# EDS Data Flow (Code → BigQuery)

## Transport Methods
- **Frontend (a11y-engine-core, browser):** HTTP POST to EDS endpoint (`/send_event`)
- **Backend (ip-protection, Node server):** TCP via `browserstack-dwh` client (`EDSClient.sendTCP`)

## Event Source Files

| Kind | Source File | Transport |
|---|---|---|
| SCAN_RUN | `a11y-engine-core/lib/core/public/run.js` | HTTP POST |
| ADVANCE_SCAN_RUN | `ip-protection/worker/workerB1.js` | TCP |
| ADVANCE_SCAN_RUN_WORKER | `ip-protection/worker/workerB2.js` | TCP |
| ADVANCE_SCAN_RUN_DOMFORGE | `ip-protection/worker/workerC.js`, controllers | TCP |
| ADVANCE_SCAN_RUN_AI | `ip-protection/worker/workerAI.js`, `jobAIColorContrast.js`, `workerCustomElementsAI.js` | TCP |
| ASSET_CAPTURE | `a11y-engine-core/devtools/edsHelper.js` | HTTP POST |
| POSTPROCESS_AI_HTML_WORKER | `ip-protection/utils/eds-debug-utils.js` | TCP |
| PREPROCESS_AI_HTML_WORKER | `ip-protection/utils/eds-debug-utils.js` | TCP |
| UPTIME_METRIC_COLLECTION | `a11y-engine-core/lib/core/public/notifyRunStatus.js` | HTTP POST |

## Key Implementation Files

- **Frontend EDS**: `a11y-engine-core/lib/core/utils/eds-utils.js` (`createEDSEvent`, `sendBatchedData`)
- **Backend EDS**: `ip-protection/utils/eds-utils.js` (`EDSUtils` class, `sendEDSEvent`)
- **EDS Transport**: `ip-protection/utils/eds.js` (`EDS.sendToEDS` TCP)
- **Debug EDS**: `ip-protection/utils/eds-debug-utils.js`

## Payload Structure (backend, wrapped in `{ arr: [...] }`)

```
{
  kind: [{ type, uuid }],
  data: [{ status, violations[], incomplete[], passes[], additionalData, uuid }],
  latency: [{ a11y_engine_scan, worker_latency, percy_exec_latency, ..., rules:{}, uuid }],
  product: [{ name, version, uuid }],
  product_metadata: [{ scanRunId, scopeKey, prioritized, ..., uuid }],
  engine_run_config: [{ a11yCoreConfig, axeCoreConfig, metadata, uuid }],
  device_run_config: [{ viewport, orientation, uuid }],
  engine_data: [{ name:"a11y_engine", version, uuid }],
  url: [{ url, uuid }],
  user_agent: [{ user_agent, uuid }],
  user: { user_id, group_id },
  errors: [{ <bucket>:[{message, error, stack}], uuid }]
}
```

## Violations Array (after `removeNodes` processing)

Nodes are stripped before EDS send; `count` field added instead:

```
[{ id: <rule_id>, impact: <severity>, nodes: [], count: <number> }]
```
