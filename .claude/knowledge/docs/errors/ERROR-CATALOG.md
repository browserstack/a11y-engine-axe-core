# Error Catalog

Known failure modes across the a11y-engine stack, with classifications, common root causes, and recovery paths.

## Scan-level failures

### Symptom: Scan never returns to client (hangs)

**Diagnostic path**: `skills/stack:debugging.md` Phase 3.

| Likely cause                                                   | Where to look                                                                                      | Fix                                                                                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One of the 6 `COMPLETION_TASK_TYPES.*` was never marked done   | `controllers/buildProxyMap.js` (kill-switch path), every exit point that calls `sendResponse(...)` | Ensure `markTaskCompleted` runs before `sendResponse` at every exit. Prefer the combined `sendResponse(..., task, isComplete)` signature.                         |
| `scan_state:${runId}` expired before `notifyRunStatus` arrived | `utils/scanStartedHandler.js`, `utils/notifyRunStatusHandler.js`                                   | `SCAN_STATE_TTL` is 60 s — if the client takes >60s between `scan_started` and the first status update, statuses get dropped. Increase TTL or fix client timing.  |
| Consolidation queue stuck (worker dead)                        | `worker/consolidationWorker.js`                                                                    | Restart `npm run worker`. Verify `setupWorkerShutdown` includes `consolidationQueue` in the workers array.                                                        |
| Percy never callbacks                                          | `controllers/getProxyMap.js:processProxyMapRequest`                                                | Check Percy logs. Auth: `Authorization: Token token=<percy.secret>`. Retries: 3 with exp backoff. If Percy is down, the scan can't proceed — error-path the user. |

### Symptom: AI webhook never returns

**Diagnostic path**: `skills/stack:debugging.md` Phase 5.

| Likely cause                          | Where to look                                                                                                  | Fix                                                                                                                                                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong AI state key written            | `controllers/getProxyMap.js:createAIrunIdMapping` vs `checks/checkHandler-v2.js:setAIHtmlMetadataIfAIKeyEmpty` | The two keys (`ai_${runId}` and `aihtml_${runId}`) are mutually exclusive per runId — webhook controllers read whichever is set. Verify the Lua-atomic guard wasn't skipped.                                                                                              |
| Idempotency gate stuck                | Redis `acceptRules_${type}_${runId}`                                                                           | Either the key has 2h TTL remaining (normal) or webhook failed earlier and the gate is wedged. Delete the key to allow retry.                                                                                                                                             |
| `verifyBasicAuth` rejects valid token | `utils/middleware.js`                                                                                          | **Known bug**: `token !== AUTHTOKEN_0 \|\| token !== AUTHTOKEN_1` rejects every token unless both env vars hold the same value. Workaround: set both `BASIC_WEBHOOK_AUTHTOKEN_0` and `_1` to the active token. Fix: change `\|\|` to `&&` (coordinate with key rotation). |
| AI API timeout / 5xx                  | `controllers/apiClient.js:getAIResponse`                                                                       | Retries 3 times on 502/503/504/429 + network errors. After exhaustion the worker logs ERROR; failure-path `removeAIHtmlProcessDataAndEOF` clears state.                                                                                                                   |

### Symptom: B1 worker keeps retrying

| Likely cause                                                   | Where to look                                             | Fix                                                                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Lock duration exceeded                                         | `worker/workerB1.js`, lock=`QUEUES_LOCK_DURATION` (2 min) | If processing legitimately needs longer, add an explicit timeout inside the worker. If a tight loop is at fault, profile.        |
| `combined-rules-class-vN` for the scan's version doesn't exist | `worker/combined-rules-worker-thread.js`                  | Scan's `version` field doesn't map to any existing file. Add the missing version file (do **not** alias to a different version). |
| `b1_data:${scanId}@${uuid}` expired                            | `utils/redis-utils.js`, `B1_REDIS_EXPIRY` (1 h)           | DOM chunks expired before the worker drained them. Likely indicates queue backpressure. Investigate worker scaling.              |

### Symptom: Type C response never arrives

| Likely cause                          | Where to look                                                    | Fix                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pendingResponseCount` mismatch       | `controllers/getProxyMap.js`, `worker/workerC.js`                | Percy can split one scan into multiple Type C posts. `workerC.js` counts down. If the count is wrong, the last response never fires `isLastResponse=true`. |
| `workerC.js` filtered the only result | `worker/workerC.js` filters `color-contrast-axe` from incomplete | This is intentional — the AI path reports the same items separately. If you're seeing zero results for `color-contrast`, check the AI lane.                |
| Proxy map not built                   | `worker/proxyMapWorker.js:generateProxyMap`                      | `buildProxyMapQueue` has 6 attempts + exp backoff. After exhaustion, the scan fails. Check S3 access (`fetchAssetsZip`).                                   |

## Worker-level failures

### Worker process won't start

| Likely cause                   | Fix                                                                     |
| ------------------------------ | ----------------------------------------------------------------------- |
| Redis not running on port 8883 | `brew services start redis-stack` (or `redis-stack-server --port 8883`) |
| `keys.yml` missing             | Re-run `scripts/setup.sh` (VPN required for Vault)                      |
| Node version mismatch          | `nvm use 18.20.4`                                                       |

### Worker process crashes on startup

| Likely cause                                               | Fix                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| New queue not registered in `setupWorkerShutdown(workers)` | Add the queue to the workers array in the owning process file (`worker.js` or `aiWorker.js`) |
| Native module compilation failure                          | Typically Node version drift. Re-run `npm install` after `nvm use 18.20.4`.                  |

## Auth failures

### `401` on a previously-working route

| Likely cause                    | Fix                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| JWT secret rotation in progress | Confirm `PREVIOUS_JWT_TOKEN_SECRET` is set and non-empty during the rotation window. `verifyToken` falls back to it on `JsonWebTokenError`. |
| Wrong middleware applied        | Routes serving user scans use `verifyAPIAuthToken`. Automation routes use `verifyAutomationAuth` (different token entirely).                |

### Webhook `401` from AI service

See "AI webhook never returns" above — `verifyBasicAuth` bug.

## Submodule failures

### `git submodule update --init` brings down wrong axe-core

The submodule remote MUST be `git@github.com:browserstack/a11y-engine-axe-core.git` (the BrowserStack fork), not the public Deque mirror. Check `.gitmodules`.

### axe-core change breaks a downstream rule

| Likely cause                                     | Fix                                                                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing impact tag on the offending commit       | `git -C axe-core log -G "function-name"` to find the change. The author should have added `// [a11y-*]: …` per `rules/commit-conventions.md`. |
| Rule no longer in the rule classification arrays | Check `a11y-engine-core/lib/core/base/constants.js` — `TYPE_B_RULES`, `TYPE_C_RULES`, `RULES_WITH_AI_COUNTERPARTS`.                           |

## Setup failures

### Setup script hangs at Vault step

VPN not connected, or Vault credentials missing locally. Connect VPN and re-run.

### `ngrok` daemon fails to start

Run `ngrok config add-authtoken <token>` (token from https://dashboard.ngrok.com/). The setup script tries to install the launchd plist — if it fails, manually:

```bash
launchctl unload ~/Library/LaunchAgents/com.ngrok.*.plist
launchctl load ~/Library/LaunchAgents/com.ngrok.*.plist
```

### `redis-stack` port conflict on 8883

```bash
brew services stop redis-stack
lsof -ti:8883 | xargs kill -9
brew services start redis-stack
```

## Release-time failures

### `bumpA11yEngine.sh` fails at stage 2 (package publish)

| Likely cause                                            | Fix                                                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Working tree not clean on `main` for `a11y-engine-core` | Commit or stash changes; the script does `git commit` + `git push` and refuses dirty trees.                |
| Jenkins token expired                                   | Regenerate at https://minion.browserstack.com/ > User Settings > Configure > API Token. Update `keys.yml`. |

### Stage 4 (copy to `accessibility`) fails

| Likely cause                                                  | Fix                                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `gh` CLI not authenticated against `browserstack` org         | `gh auth login`.                                                           |
| Sibling `accessibility` repo not checked out at expected path | The script expects a specific sibling layout. See its source for the path. |

### Stage 7 (PR creation) fails for `frontend`

| Likely cause                                          | Fix                                                                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend` package files changed in a conflicting way | Manually bump `apps/accessibility-toolkit/package.json` and `apps/accessibility-toolkit-headless/package.json`, then re-run from stage 7. |

## When to escalate

| Symptom                         | Where to go                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Any service refusing to start   | `/restart-services` from the `accessibility` repo (not from `a11y-engine`).                                            |
| Production scan failure pattern | Check EDS `a11y_engine_scan` / `percy_exec_latency` / `worker_latency` events in BigQuery before code changes.         |
| Suspected axe-core fork drift   | Open an issue tagged for the engine team — do not `git submodule update` against upstream.                             |
| Suspected secret leakage        | Rotate `keys.yml` entries from Vault immediately; force a `bumpA11yEngine.sh` stage 2 to rotate the npm publish token. |
