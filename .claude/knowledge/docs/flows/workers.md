# Workers

> **Three worker processes**, not one. Started as separate Node pods: `worker.js` (core lanes), `aiWorker.js` (short-bucket AI), `aiWorkerLong.js` (long-bucket AI). All drain BullMQ queues defined in `ip-protection/utils/bullmq.js`.
>
> The short/long AI split exists because long-running AI jobs (preprocess + postprocess of heading-AI HTML, and on-demand/workflow-analyser long variants) otherwise starve the round-robin loop that serves short jobs. `entrypoint.sh` selects the pod via `EXECUTION_CONTEXT` (`WORKER`, `AI-WORKER`, `AI-WORKER-LONG`). `npm run worker` runs all three concurrently for local dev.

```
┌──────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────────┐
│ ip-protection/       │  │ ip-protection/aiWorker.js │  │ ip-protection/aiWorkerLong.js │
│   worker.js          │  │   (AI short bucket)       │  │   (AI long bucket)            │
├──────────────────────┤  ├──────────────────────────┤  ├──────────────────────────────┤
│ • typeB1Queue        │  │ • aiTypeCProcessingQueue │  │ • preProcessAIhtmlQueue       │
│ • scanCompleteQueue  │  │   (2 job types)          │  │ • postProcessAIhtmlQueue      │
│ • percyResultsQueue  │  │ • customElementsAiQueue  │  │ • aiOnDemandScanQueueLong     │
│ • buildProxyMapQueue │  │ • aiOnDemandScanQueue    │  │ • aiWorkflowAnalyserQueueLong │
│ • imageProcessingQ.  │  │ • aiWorkflowAnalyserQ.   │  │                              │
│ • consolidationQueue │  │                          │  │                              │
│ • onDemandScanQueue  │  │                          │  │                              │
│ • workflowAnalyserQ. │  │                          │  │                              │
└──────────────────────┘  └──────────────────────────┘  └──────────────────────────────┘
```

Round-robin + priority-lane execution for both AI pods is implemented in `worker/aiWorkerRuntime.js → startAIWorker({ roundRobinWorkers, roundRobinQueues, priorityWorkers, priorityQueues })`. The runtime adapts batch size to backlog depth (`BATCH_SIZE_THRESHOLDS` 1 → 5 jobs/turn).

## Queue → worker → dispatch function

All queues are instantiated in `ip-protection/utils/bullmq.js`. Workers are bound to queues in `worker.js` (main) and `aiWorker.js` (AI).

### Main worker process (`ip-protection/worker.js`)

| Queue                   | Job names          | Dispatch function                     | File                            | Lock duration                                             |
| ----------------------- | ------------------ | ------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| `typeB1Queue`           | `TYPE_B1`          | `processB1Job`                        | `worker/workerB1.js`            | `QUEUES_LOCK_DURATION` (2 min)                            |
| `scanCompleteQueue`     | `SCAN_COMPLETE`    | `processB2Job`                        | `worker/workerB2.js`            | `QUEUES_LOCK_DURATION_EXTENDED_15_MIN` (15 min)           |
| `percyResultsQueue`     | `PERCY_RESULTS`    | `processTypeCJob`                     | `worker/workerC.js`             | `QUEUES_LOCK_DURATION` (2 min)                            |
| `buildProxyMapQueue`    | `BUILD_PROXY_MAP`  | `buildProxyMap`                       | `worker/proxyMapWorker.js`      | `QUEUES_LOCK_DURATION` (2 min); 6 attempts w/ exp backoff |
| `imageProcessingQueue`  | `IMAGE_PROCESSING` | `processImageJob`                     | `worker/workerImage.js`         | `QUEUES_LOCK_DURATION_EXTENDED` (5 min)                   |
| `consolidationQueue`    | `CONSOLIDATION`    | `processConsolidationJob`             | `worker/consolidationWorker.js` | `QUEUES_LOCK_DURATION`                                    |
| `onDemandScanQueue`     | _any_              | `priorityJobs` → switch on `job.name` | `worker/priorityJobsWorker.js`  | `QUEUES_LOCK_DURATION`                                    |
| `workflowAnalyserQueue` | _any_              | `priorityJobs` → switch on `job.name` | `worker/priorityJobsWorker.js`  | `QUEUES_LOCK_DURATION`                                    |

### AI short-bucket process (`ip-protection/aiWorker.js`)

| Queue                     | Job names                                                                               | Dispatch function            | File                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `aiTypeCProcessingQueue`  | `AI_TYPE_C_PROCESSING`, `AI_COLOR_CONTRAST_PROCESSING`, `CUSTOM_ELEMENTS_AI_PROCESSING` | inline switch                | `worker/workerAI.js`, `worker/jobAIColorContrast.js`, `worker/workerCustomElementsAI.js` |
| `customElementsAiQueue`   | `CUSTOM_ELEMENTS_AI_PROCESSING`                                                         | `processCustomElementsAIJob` | `worker/workerCustomElementsAI.js`                                                       |
| `aiOnDemandScanQueue`     | _any_                                                                                   | priority router              | `worker/aiWorkerRuntime.js`                                                              |
| `aiWorkflowAnalyserQueue` | _any_                                                                                   | priority router              | `worker/aiWorkerRuntime.js`                                                              |

### AI long-bucket process (`ip-protection/aiWorkerLong.js`)

| Queue                         | Job names              | Dispatch function             | File                                |
| ----------------------------- | ---------------------- | ----------------------------- | ----------------------------------- |
| `preProcessAIhtmlQueue`       | `PRE_PROCESS_AI_HTML`  | `processPreProcessAIhtmlJob`  | `worker/workerPreProcessAIhtml.js`  |
| `postProcessAIhtmlQueue`      | `POST_PROCESS_AI_HTML` | `processPostProcessAIhtmlJob` | `worker/workerPostProcessAIhtml.js` |
| `aiOnDemandScanQueueLong`     | _any_                  | priority router               | `worker/aiWorkerRuntime.js`         |
| `aiWorkflowAnalyserQueueLong` | _any_                  | priority router               | `worker/aiWorkerRuntime.js`         |

When enqueuing on-demand or workflow-analyser AI jobs, `utils/bullmq.js` chooses the `*Long` queue when `job.name` ∈ {`PRE_PROCESS_AI_HTML`, `POST_PROCESS_AI_HTML`} and the short variant otherwise — the routing is in `addAIJobToQueue` and does not need to be re-implemented by callers.

## Queue multiplexing

Several queues have one worker handling multiple job types, dispatched by `job.name`:

- **`aiTypeCProcessingQueue`** — inline `switch (job.name)` in `aiWorker.js` routes to either `processAITypeCJob` or `processAIColorContrastJob`.
- **`onDemandScanQueue`, `workflowAnalyserQueue`** — both bound to `priorityJobs` (`worker/priorityJobsWorker.js`), which is a switch table across all 10 known job types (`BUILD_PROXY_MAP`, `SCAN_COMPLETE`, `PERCY_RESULTS`, `AI_TYPE_C_PROCESSING`, `IMAGE_PROCESSING`, `TYPE_B1`, `AI_COLOR_CONTRAST_PROCESSING`, `PRE_PROCESS_AI_HTML`, `POST_PROCESS_AI_HTML`, `CUSTOM_ELEMENTS_AI_PROCESSING`). This is the **priority fast-lane** for scans marked `prioritized: true` in the job payload.
- **`aiOnDemandScanQueue`, `aiWorkflowAnalyserQueue`** — same `priorityJobs`, AI variant.

See the `addJobToQueue` / `addAIJobToQueue` helpers in `utils/bullmq.js` — they inspect `job.prioritized` and `productName` to choose between the normal queue and the priority queue.

## Adding to a queue

Use the typed helpers exported from `utils/bullmq.js`. **Do not call `queue.add(...)` directly** — the helpers encode the priority-routing rules and log shape.

| To enqueue a...        | Call                                  |
| ---------------------- | ------------------------------------- |
| B1 job                 | `addJobToTypeB1Queue(job)`            |
| B2 (scan complete)     | `addJobToScanCompleteQueue(job)`      |
| Type C                 | `addJobToPercyResultsQueue(job)`      |
| Proxy map build        | `addJobToProxyMapQueue(job)`          |
| Image OCR              | `addJobToImageProcessingQueue(job)`   |
| AI Type C              | `addJobToAiProcessingQueue(job)`      |
| AI Color Contrast      | `addJobToAiColorContrastQueue(job)`   |
| AI Heading preprocess  | `addJobToPreProcessAIhtmlQueue(job)`  |
| AI Heading postprocess | `addJobToPostProcessAIhtmlQueue(job)` |
| Custom Elements AI     | `addJobToCustomElementsAiQueue(job)`  |
| Consolidation          | `addJobToConsolidationQueue(job)`     |

## Job payload discipline

**BullMQ jobs pass IDs, not raw DOM or user data.** Store payloads in Redis, hand the key to the job. This keeps Redis memory bounded per-scan and makes retries cheap. See `rules/api-design.md` and `rules/security.md`.

## Shutdown

Both processes use `utils/workerShutdown.js` — `setupWorkerShutdown(workers)` registers SIGTERM/SIGINT handlers, drains in-flight jobs, and closes queues. When adding a new queue, include it in the `workers` array passed to `setupWorkerShutdown` in the owning process file.

## See also

- `rule-types.md` — which job kinds belong to which lane.
- `storage.md` — what goes in Redis vs the job payload.
- `scan-lifecycle.md` — how jobs get created end-to-end.
