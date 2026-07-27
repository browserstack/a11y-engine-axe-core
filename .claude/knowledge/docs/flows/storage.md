# Storage

Three backends: **Redis** (coordination + chunked payloads), **S3** (assets + large payloads), **BullMQ** (job queues — layered on Redis). See `workers.md` for queues.

All TTL defaults live in `ip-protection/config/constants.js` unless noted.

## Redis TTL constants

| Constant                          | Value          | Used for                                                                                            |
| --------------------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| `B1_REDIS_EXPIRY`                 | 3600 s (1 h)   | Accumulated B1 node-data chunks per `scanId@uuid`                                                   |
| `B2_REDIS_EXPIRY`                 | 3600 s (1 h)   | B2 intermediate aggregation state                                                                   |
| `REDIS_TTL`                       | 7200 s (2 h)   | AI state, idempotency, acceptRules keys                                                             |
| `SCAN_STATE_TTL`                  | 60 s           | `scan_state:${runId}` STARTED flag (defined in `utils/scanStartedHandler.js`, set by `app.js`)      |
| `PENDING_STATUS_TTL`              | 60 s           | `scan_pending_status:${runId}` queue list (defined in `utils/notifyRunStatusHandler.js`)            |
| `SCAN_COMPLETE_REDIS_TTL`         | 900 s (15 min) | `scanComplete:${scopeKey}:${type}` completion flag (set in `utils/redis-utils.js:setScanCompleted`) |
| `REDIS_EXPIRY`                    | 21600 s (6 h)  | Scan metadata cache (generic)                                                                       |
| `TYPE_C_AUTOMATION_TTL`           | 172800 s (2 d) | Type C automation results cache                                                                     |
| _(inline in `proxyMapWorker.js`)_ | 28800 s (8 h)  | `resources:${scanId}` — uploaded-resource tracker                                                   |

**Hard rule** (`rules/security.md`): every Redis key **must** have a TTL.

## Known key patterns

| Key pattern                                                         | TTL                                 | Set by                                                                                                     | Read by                                                                                        | Meaning                                                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scan_state:${runId}`                                               | `SCAN_STATE_TTL` (60 s)             | `app.js` socket `scan_started` (constant defined in `utils/scanStartedHandler.js`)                         | `notifyRunStatusHandler`, `queueIfScanNotStarted`                                              | STARTED flag; gates `processPendingStatuses`                                                                                                         |
| `scan_pending_status:${runId}` (list)                               | `PENDING_STATUS_TTL` (60 s)         | `utils/notifyRunStatusHandler.js:queueIfScanNotStarted`                                                    | `processPendingStatuses`                                                                       | Buffers `notifyRunStatus` events that arrived before `scan_started`                                                                                  |
| `scanComplete:${scopeKey}:${type}`                                  | `SCAN_COMPLETE_REDIS_TTL` (15 m)    | `utils/redis-utils.js:setScanCompleted` (NX)                                                               | Completion-gate checks                                                                         | One-shot completion flag per scan + type                                                                                                             |
| `b1_data:${scanId}@${uuid}`                                         | `B1_REDIS_EXPIRY` (1 h)             | `utils/redis-utils.js` (via `b1DataChunkHandler`)                                                          | `workerB1.js`                                                                                  | Accumulated gzip-buffered DOM chunks                                                                                                                 |
| `ai_${runId}`                                                       | `REDIS_TTL` (2 h)                   | **`controllers/getProxyMap.js:processProxyMapRequest`** → `createAIrunIdMapping` (before Percy is invoked) | `controllers/acceptAIResult.js`, `workerAI.js`, `jobAIColorContrast.js`                        | In-flight scan context for **Type C-originated** AI (altText, color-contrast, customElements). Created only if `rules[]` contains those AI rule ids. |
| `aihtml_${runId}`                                                   | `REDIS_TTL` (2 h)                   | `checks/checkHandler-v2.js → setAIHtmlMetadataIfAIKeyEmpty` (Lua: sets only if `ai_${runId}` is empty)     | `acceptHeadingsAIResult` (fallback hydration when `ai_${runId}` missing), failure-path cleanup | In-flight scan context for **B1-originated** Heading AI. Mutually exclusive with `ai_${runId}` per runId.                                            |
| `ai_html@${runId}`                                                  | `REDIS_TTL` (2 h)                   | `worker/workerPreProcessAIhtml.js → storeAIHtmlProcessDataUrl`                                             | `worker/workerPostProcessAIhtml.js`                                                            | S3 GET URL for `aiHtmlProcessData` JSON                                                                                                              |
| `aihtml_eof@${scopeKey}`                                            | (per-key)                           | `addPreProcessAIhtmlEOFFlag`                                                                               | `removeAIHtmlProcessDataAndEOF` (cleanup on failure/completion)                                | EOF marker for Heading-AI preprocess pipeline                                                                                                        |
| `aihtml_postprocess_job@${runId}`                                   | `REDIS_TTL` (2 h)                   | `controllers/acceptAIResult.js:acceptHeadingsAIResult → storePostProcessAIhtmlJobData`                     | `worker/workerPostProcessAIhtml.js → getPostProcessAIhtmlJobData`                              | Full heading-AI webhook body + scan context (kept tiny job payload — IDs-not-raw-data rule)                                                          |
| `acceptRules_${type}_${runId}` or `…_${batchNumber}` (apiVersion 2) | `REDIS_TTL` (2 h)                   | `controllers/acceptRulesDataPercy.js`                                                                      | self (idempotency)                                                                             | Idempotency gate for Percy-originated AI-candidate POSTs                                                                                             |
| `resources:${scanId}` (hash)                                        | 28800 s (8 h)                       | `worker/proxyMapWorker.js:generateProxyMap`                                                                | `proxyMapWorker` on subsequent runs (for `existing` resources)                                 | Per-scan map of resource UUID → presence flag                                                                                                        |
| `proxymap_metadata@${runId}`                                        | per `CUSTOM_ELEMENTS_AI_REDIS_KEYS` | `utils/custom-elements-ai-utils.js` (via `handleProxyMapCoordination`)                                     | Custom-elements-AI pipeline                                                                    | CE-AI coordination metadata                                                                                                                          |
| `customElementsB1Payload@${runId}`                                  | per `CUSTOM_ELEMENTS_AI_REDIS_KEYS` | `utils/custom-elements-ai-utils.js`                                                                        | CE-AI workers                                                                                  | B1 payload cached for custom-elements AI                                                                                                             |
| `CUSTOM_ELEMENTS_PERCY_LOCK@${runId}`                               | per `CUSTOM_ELEMENTS_AI_REDIS_KEYS` | `utils/custom-elements-ai-utils.js`                                                                        | CE-AI workers                                                                                  | Coordination lock between Percy and CE-AI                                                                                                            |
| `eof_ai@ce@${scopeKey}`                                             | —                                   | `utils/custom-elements-ai-utils.js`                                                                        | `workerCustomElementsAI.js`                                                                    | EOF marker for CE nodes                                                                                                                              |
| `eof@run@ce@${scopeKey}`                                            | —                                   | `utils/custom-elements-ai-utils.js`                                                                        | `workerCustomElementsAI.js`                                                                    | EOF marker for CE runs                                                                                                                               |
| `ce_ai_pending_image_count:${runId}`                                | —                                   | `utils/custom-elements-ai-utils.js`                                                                        | CE-AI workers                                                                                  | Pending image count                                                                                                                                  |
| `${scanId}`                                                         | `TYPE_C_AUTOMATION_TTL` (2 d)       | `controllers/automation/pushProxyMapToPercy.js`, `controllers/automation/acceptPercyRulesResult.js`        | Automation polling                                                                             | Preprod-only automation scan status `{Status, Result, Message}`                                                                                      |

Full CE-AI key factory lives in `config/constants.js → CUSTOM_ELEMENTS_AI_REDIS_KEYS`.

## Redis connection

`REDIS_OPTIONS` + `REDIS_READ_REPLICA_OPTIONS` in `config/constants.js`. Use read replica for read-heavy paths (results fetching, status checks). Writes always go to the primary.

## S3

Two logical buckets per env: the **OCR / image bucket** (`CONFIG.OCR.images_bucket`, used for `imageProcessingQueue` payloads and the legacy proxy-map staging) and the **accessibility bucket** (resolved via `resolveAccessibilityBucket()` in `utils/s3Utils.js` — typically of the form `bucket@region`). Asset uploads (per-resource zips, proxy-map JSON, Percy-consumed payloads) write **only** to the accessibility bucket; both Percy and `ip-protection`-side readers source from it. The historical dual-write to the OCR bucket has been removed — there is no fallback for assets in the OCR bucket.

`parseBucketAndClient(spec)` splits a `bucket@region` string and returns `{ bucket, bucketRegion, client }` so callers can target a non-default region with the same s3 client pool. Access via `ip-protection/utils/s3Utils.js`.

| Path shape                                                   | Purpose                                                                                                                                     | Written by                                                                      | URL style                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `${IMAGES_DIRECTORY}/${uuidv4()}.png`                        | OCR input images                                                                                                                            | `createPutPresignedUrl()` → client PUT                                          | Presigned PUT, `PRESIGNED_URL_EXPIRY` from config                                     |
| `${IMAGES_DIRECTORY}/${payload.name}`                        | OCR result fetch                                                                                                                            | `fetchImage()` via `GetObjectCommand`                                           | Direct SDK read, auto-retry on `NoSuchKey`                                            |
| (client asset upload)                                        | Asset zip from a11y-engine-core before proxy-map build                                                                                      | Via presigned URLs from `controllers/presignedUrlGenerator.js:getPreSignedUrls` | Presigned PUT (optionally CloudFront-routed per `isRoutedToS3ViaCloudFront(groupId)`) |
| Per-resource extracted assets                                | `worker/proxyMapWorker.js:generateProxyMap → uploadAssetFile(testCaseId, content, uuid, a11yBucket, bucketRegion)`                          | On zip extraction                                                               | Regional S3 URL on the accessibility bucket                                           |
| Proxy map JSON                                               | `worker/proxyMapWorker.js:generateProxyMap → uploadAssetFile(testCaseId, JSON.stringify(proxyMap), proxyMapUuid, a11yBucket, bucketRegion)` |                                                                                 | S3 URL on the accessibility bucket fed into Percy's `proxy_url` payload field         |
| Percy-consumed `axe.min.js` + `dom-forge-engine-core.min.js` | Built and uploaded by release flow                                                                                                          | `scripts/bumpA11yEngine.sh` (via Jenkins `A11yUploadExtension` etc.)            | Direct public S3 URLs                                                                 |
| `consolidated_rules.json` (release artifact)                 | Committed to sibling `accessibility` repo                                                                                                   | `scripts/bumpA11yEngine.sh`                                                     | N/A — not an S3 path                                                                  |

Two S3 clients in `s3Utils.js`:

- `s3client` — standard
- `s3clientWithAcceleration` — S3 Transfer Acceleration for `preprod` / `production` / `dr` environments

For CloudFront-signed URLs (not direct S3), use `useRouting: true` on `createPutPresignedUrl()`. Requires `CONFIG.cloudfront.keypair_id` + `CONFIG.cloudfront.private_key`.

## BullMQ (runs on Redis)

Default job options (`utils/bullmq.js`):

```js
{
  removeOnComplete: { age: 3 * 24 * 3600, count: CONFIG.bullmq.removeOnCompleteCount },
  removeOnFail:     { age: 3 * 24 * 3600, count: CONFIG.bullmq.removeOnFailCount },
}
```

- Completed / failed jobs purged after 3 days or at count limit.
- `scanCompleteQueue` (B2) overrides with `attempts: 2` + exponential backoff.
- `buildProxyMapQueue` overrides with `attempts: 6` + exponential backoff.
- See `workers.md` for lock durations + concurrency.

## What goes where (decision table)

| Kind of data                 | Store in                         | Why                                                                  |
| ---------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| DOM chunks from extension    | Redis key with `B1_REDIS_EXPIRY` | Small, per-scan, expires in 1 h                                      |
| Client-uploaded asset zip    | S3 (presigned PUT)               | Large binary, direct client → S3                                     |
| Extracted per-resource asset | S3 (via `uploadAssetFile`)       | Large binary, reused across scans with `resources:${scanId}` tracker |
| Proxy map JSON               | S3 (URL referenced by Percy)     | Feeds into Percy's `proxy_url` trigger payload                       |
| Scan metadata / status flag  | Redis (short TTL)                | Needs fast concurrent access                                         |
| AI per-image context         | Redis (under `ai_${runId}`)      | Small, webhook-correlated; purged via `fetchAndDeleteImageData`      |
| BullMQ job payload           | Redis key → pass key in job      | Keep job payload small (rule: IDs, not raw data)                     |
| OCR image                    | S3 with presigned URL            | Binary, large, external process-friendly                             |
| Consolidated rules JSON      | Sibling `accessibility` repo     | Released via `bumpA11yEngine.sh`, not runtime                        |

## See also

- `workers.md` — queue shapes and job options.
- `dom-capture.md` — where the proxy map and assets land.
- `scan-lifecycle.md` — Percy trigger payload and response paths.
- `auth.md` — `BASIC_WEBHOOK_AUTHTOKEN_0/_1` key rotation.
- `rules/security.md` — TTL enforcement.
