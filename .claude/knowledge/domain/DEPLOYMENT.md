# Deployment

a11y-engine has **two distinct deployment paths**, one per artifact class:

| Sub-project | Artifact | Deployment path |
|---|---|---|
| `a11y-engine-core` | `axe.min.js` browser bundle (npm package + S3) | Package bump → `bumpA11yEngine.sh` + Jenkins |
| `dom-forge-core` | `dom-forge-engine-core.min.js` browser bundle | Package bump (handled via the same flow + Grunt build) |
| `axe-core/` (submodule) | Built into `axe.min.js` above | Not deployed independently |
| `ip-protection` | Docker image → Kubernetes Service + Workers | FluxCD + Argo Rollouts via `a11y-engine-infra-ops` |
| `mini-percy-renderer` | Local-only Percy replay tool (darwin-arm64) | **Not deployed** — local dev/debug only |

The two paths are **independent**. A rule change in `a11y-engine-core` ships via the package bump path and never touches Kubernetes. An `ip-protection` route/worker change ships via CI → ECR → FluxCD and never touches Jenkins.

---

## Path 1 — Package bump (a11y-engine-core, dom-forge-core)

The release script `scripts/bumpA11yEngine.sh` orchestrates the publish flow — package publish, rule consolidation, sibling-repo PR creation, Jenkins job dispatch, and extension build/upload.

> `CLAUDE.md` and the script's own header occasionally still refer to `bumpWebA11y.sh`. That filename no longer exists; only `bumpA11yEngine.sh` ships. Use what's on disk.

### What the script does — 7 stages

| # | Stage | Effect |
|---|---|---|
| 1 | Input | Prompts for new version, publish y/n, build set (WA / AUT / both), and target environments (`reg`, `preprod`, `daily-reg`, `prod`) |
| 2 | Publish `a11y-engine-core` | Bumps `a11y-engine-core/package.json`, commits + pushes to `main`, triggers Jenkins job |
| 3 | Consolidate rules | Runs `a11y-engine-core/build/scripts/consolidate_rules.js` → writes `a11y-engine-core/consolidated_rules.json` |
| 4 | Copy rules to `accessibility` | Creates `accessibility/db/rules/a11y_engine_${VERSION}.json` via `gh` CLI in the sibling repo |
| 5 | Upload rules | Triggers Jenkins `A11yUploadRules` per environment |
| 6 | Build extension | Triggers Jenkins `BuildProductTools` for WA and/or AUT per environment |
| 7 | Upload extension + PRs | Triggers Jenkins `A11yUploadExtension`, then opens PRs in `frontend` and `accessibility` via `gh pr create` |

### Files touched

**In this repo:**
- `a11y-engine-core/package.json` (version bump)
- `a11y-engine-core/package-lock.json`
- `a11y-engine-core/consolidated_rules.json` (regenerated)

**In sibling repos (via `gh`):**

| Repo | File | Action |
|---|---|---|
| `accessibility` | `db/rules/a11y_engine_${VERSION}.json` | Created (new file per release) |
| `frontend` | `apps/accessibility-toolkit/package.json` | Version bump |
| `frontend` | `apps/accessibility-toolkit-headless/package.json` | Version bump |

### Jenkins jobs

| Job | Triggered in stage | Purpose |
|---|---|---|
| `A11yEngineProductionPackagePublish` | 2 (prod) | Publishes `@browserstack/a11y-engine-core` npm package |
| `A11yEngineStagingPackagePublish` | 2 (staging) | Staging package publish |
| `A11yUploadRules` | 5 | Uploads consolidated rules JSON to a CDN / service |
| `BuildProductTools` | 6 | Builds WA / AUT extension artifacts |
| `A11yUploadExtension` | 7 | Uploads extension builds to distribution |

Jenkins host: https://minion.browserstack.com/. Credentials live in `ip-protection/config/keys.yml` under `jenkins.username` and `jenkins.token`.

### Pre-requisites

- **VPN** for Vault (if re-fetching secrets).
- **`gh` CLI** authenticated against the `browserstack` org (`gh auth login`).
- **`nvm use 18.20.4`** before running.
- **Clean working tree on `main`** for `a11y-engine-core` — the script does `git commit` + `git push` in stage 2.
- **Jenkins token** in `keys.yml` — generate at https://minion.browserstack.com/ > User Settings > Configure > "Add new token" in the API Token section.

```yaml
# ip-protection/config/keys.yml
jenkins:
  username: "<your-email>"
  token: "<your-generated-token>"
```

### Semver coupling

Per AllyEngine versioning (https://browserstack.atlassian.net/wiki/spaces/ENG/pages/4108092131) — **not verified in code**, per Confluence:

| Bump | When |
|---|---|
| **Major** | axe-core major/minor upgrade OR major engine change (e.g., AI integration) |
| **Minor** | New WCAG technique / success criterion, axe-core patch, major enhancement |
| **Patch** | Bug fixes, rollbacks, minor enhancements, experimental → stable transitions |
| **`-AT` suffix** | AT-only releases (semver pre-release marker, excluded from this scope) |

Release notes go out for major/minor; patches don't require a changelog entry.

### What goes to S3 (release artifacts)

The release flow uploads two browser bundles to S3 that **Percy consumes at scan time**:

| Artifact | Built by | Consumed by |
|---|---|---|
| `axe.min.js` (the forked + wrapped axe build) | `a11y-engine-core/build/scripts/build_axe.sh` then `npm run build` | Percy via `axe_script_url` in the `dom_forge` trigger payload |
| `dom-forge-engine-core.min.js` | `dom-forge-core` Grunt build | Percy via `dom_forge_core_script_url` |

These URLs are passed to Percy in `controllers/getProxyMap.js:formatData` for every Type C scan. Releasing a new version of `a11y-engine-core` or `dom-forge-core` means new S3 URLs that Percy will pick up.

### Branching during release

- `a11y-engine-core/package.json` bump commits directly to `main` of this repo.
- Sibling PRs (in `accessibility` and `frontend`) are opened against their respective `main` branches via `gh pr create` and must be merged manually before the version is fully live.

### Local dry-run

The script has no dedicated dry-run mode. To rehearse without hitting Jenkins:
- Comment out the `curl` lines that trigger Jenkins jobs, or
- Stop after stage 3 (consolidate rules) and inspect the generated `consolidated_rules.json` manually before proceeding.

---

## Path 2 — Kubernetes / GitOps (ip-protection)

`ip-protection` is the Node backend (Express + socket.io) plus the BullMQ workers. It is deployed to Kubernetes via **FluxCD** (GitOps) and **Argo Rollouts** (progressive delivery). Infrastructure and manifests live in the sibling repo **`a11y-engine-infra-ops`** (`github.com/browserstack/a11y-engine-infra-ops`).

### Workloads deployed

Three independent Argo Rollouts in namespace `a11y-engine`:

| Rollout | Source `Deployment` | Purpose | Scaling |
|---|---|---|---|
| `a11y-engine-service-rollout` | `a11y-engine-service` | HTTP/socket.io API (port 3000) | KEDA-scaled (min 4 in prod) |
| `a11y-engine-worker-rollout` | `a11y-engine-worker` | Main BullMQ workers (B1, B2, C-sink) | KEDA-scaled (min 10 in prod) |
| `a11y-engine-ai-worker-rollout` | `a11y-engine-ai-worker` | AI-lane workers (pre/post-process, customElementsAi) | Fixed replicas (10 in prod) |

All three reference a `Deployment` via `workloadRef` — the rollout controls the canary, the deployment defines the pod spec.

Helm chart that produces all of the above: `kubernetes-resources/charts/a11y-engine-service/` (`a11y-engine-infra-ops` repo). Templates of interest: `deployment.yaml`, `workerDeployment.yaml`, `aiWorkerDeployment.yaml`, `service.yaml`, `serviceCanary.yaml`, `ingress.yaml`, `externalSecret.yaml`, `customMetricsAutoscaler.yaml`, `cronAutoscaler.yaml`, `pdb.yaml`.

### Image flow — code commit → pod

1. Developer merges to `ip-protection` `main` → CI builds a Docker image.
2. Image pushed to ECR `737963123736.dkr.ecr.us-east-1.amazonaws.com/browserstack/a11y-engine` with an environment-specific tag pattern:
   - **stag**: `stag-<sha>-<timestamp>Z`
   - **preprod**: `preprod-<sha>-<timestamp>Z`
   - **prod**: `prod-<sha>-<timestamp>Z`
3. Flux `ImageRepository` polls ECR every **1 minute** (`fluxcd/base/a11y-engine-service/image-automation.yaml`).
4. Flux `ImagePolicy` filters tags by environment pattern and picks the newest by timestamp (alphabetical ascending — `filterTags.extract: $timestamp`).
5. `ImageUpdateAutomation` (`fluxcd/base/image-automation-common/`) commits the new tag into `fluxcd/<env>/a11y-engine-service/release.yaml` (the `tag:` field carries the `{"$imagepolicy": "..."}` marker that Flux substitutes).
6. The commit lands on `a11y-engine-infra-ops` `main`. Flux reconciles the `HelmRelease`.
7. Helm renders new Deployment specs → Argo Rollout starts a canary.
8. Canary serves 100% traffic, pauses for **15 minutes** (currently no analysis step — the `analysis` block is commented out in `rollout.yaml` for all environments).
9. After pause, full promotion.

End-to-end: typically ~5 minutes from ECR push to canary traffic, plus the 15-minute pause before full promotion.

### Environments and overlays

`kubernetes-resources/fluxcd/<env>/` overlays the base chart. Active environments:

| Env | Path | Notes |
|---|---|---|
| `dev` | `fluxcd/dev/` | Development cluster |
| `stag` | `fluxcd/stag/` | Staging |
| `preprod` | `fluxcd/preprod/` | Pre-production; canary with optional analysis |
| `prod` | `fluxcd/prod/` | Production; min 4 service / 10 worker replicas |
| `dr` | `fluxcd/dr/` | Disaster recovery |

Enable/disable an environment by editing its `kustomization.yaml` — commenting out the resources entry stops Flux from reconciling that overlay.

### Config + secrets

Both `config.yml` and `keys.yml` are mounted into the pod under `/home/app/ip-protection/config/`:

- **`keys.yml`**: JWT secrets, Redis auth, API keys. Pulled from **HashiCorp Vault** via External Secrets Operator (`externalSecret.yaml`, `secretStoreRef: vault-backend-a11y-engine`, `refreshInterval: 0m`).
- **`config.yml`**: Application config (env, redis, a11y, percy, bullmq, ai, cloudfront, alert sections). Defined inline in `release.yaml` under `secrets.file_template.data.config.yml`.

#### `increment_only` — forcing a pod restart

The Helm values carry an `increment_only: "<n>"` field that is used to suffix the rendered config Secret name (e.g. `a11y-engine-config-18`). Bumping `increment_only` produces a new Secret name, which changes the Deployment's volume reference, which triggers a rolling restart of all pods. **Bump `increment_only` whenever you edit `config.yml` or want to force a restart without changing app code.**

### Making changes

| Change | Where to edit | Effect |
|---|---|---|
| `ip-protection` app code | `ip-protection/` in this repo | CI builds new image → Flux deploys (auto) |
| Environment config (`config.yml`) | `a11y-engine-infra-ops` → `fluxcd/<env>/a11y-engine-service/release.yaml` + bump `increment_only` | Pods restart with new config |
| Vault-managed secret (`keys.yml`) | HashiCorp Vault directly | External Secret refreshes immediately (`refreshInterval: 0m`); restart only if `increment_only` is bumped |
| Helm template (k8s manifests) | `a11y-engine-infra-ops` → `kubernetes-resources/charts/a11y-engine-service/templates/` + bump `Chart.yaml` version | Re-renders on next reconcile |
| Canary strategy / pause / analysis | `a11y-engine-infra-ops` → `fluxcd/<env>/a11y-engine-service/rollout.yaml` | Applies on next merge |
| Autoscaling thresholds | `customMetricsAutoscaler.yaml` (KEDA) or `cronAutoscaler.yaml` | Applies on next reconcile |
| Enable/disable env | `fluxcd/<env>/kustomization.yaml` (comment/uncomment resources) | Flux stops/starts reconciling |

All edits to `a11y-engine-infra-ops` go through a PR. **Approvals**: `@team-allyengine-pr-reviews`.

### Manual scale-up (e.g., for SSI day, load test)

Use the Jenkins job: https://minion.browserstack.com/job/Core/job/SSIDayScaleup/

When triggering during off-hours, check **`SET_LABEL`** in the job params — that holds the scale-up for a 3-hour window. Without it, the next hourly cron-autoscaler tick will scale back down.

### Health, readiness, and probes

| Probe | Endpoint | Worker variant |
|---|---|---|
| Startup | `GET /ready` (service) | Bash script in `charts/a11y-engine-service/files/` |
| Readiness | `GET /ready` (service) | Bash script |
| Liveness | `GET /health_check` (service) | Bash script |

Workers use custom bash health-check scripts because they don't serve HTTP — they check BullMQ connectivity / queue heartbeat.

### Monitoring + debugging in the cluster

```bash
# Pods + rollouts
kubectl get pods -n a11y-engine
kubectl get rollouts -n a11y-engine
kubectl argo rollouts get rollout a11y-engine-service-rollout -n a11y-engine

# Logs
kubectl logs <pod> -n a11y-engine
kubectl logs <pod> -n a11y-engine --previous   # crash diagnosis

# Secrets and config
kubectl get secrets -n a11y-engine | grep a11y-engine-config
kubectl describe externalsecret a11y-engine-config -n a11y-engine

# Flux reconciliation
flux get helmreleases -n a11y-engine
flux get imagerepositories -n a11y-engine
flux get imagepolicies -n a11y-engine
```

### Common failure modes

| Symptom | First check |
|---|---|
| `CrashLoopBackOff` | `kubectl logs --previous`; verify `a11y-engine-config-<N>` secret exists; `describe externalsecret` for Vault errors |
| 502 Bad Gateway on the service | Confirm at least one pod is `Ready`; verify readiness probe is passing; check resource limits |
| New image not deploying | `flux get imagerepositories` for ECR poll status; verify tag matches `^<env>-(.*)-(?P<timestamp>.*)Z$` |
| Config change not applied | Confirm `increment_only` was bumped — the secret reference must change for pods to restart |
| Canary stuck | Inspect rollout pause status; manual abort/retry via `kubectl argo rollouts abort` or `promote` |

### Related infra resources (managed by `a11y-engine-infra-ops/terraform-resources/`)

| Resource | Purpose |
|---|---|
| **S3 buckets** | Temporary DOM snapshots, AI analysis payloads, screenshot assets |
| **ElastiCache Redis** | BullMQ queues + cache (per-env cluster) |
| **ECR** | Docker image registry (`browserstack/a11y-engine`) — staging + production accounts |
| **CloudFront** | CDN for the screenshot assets bucket (preprod + prod only); signed URLs in prod |

Terraform changes go through the same PR / approval process.

---

## Sub-projects that are NOT deployed

- **`mini-percy-renderer`**: Darwin-arm64 only, local Percy snapshot replay binary (`jackproxy-darwin-arm64`). Used for local development and debugging Type C scans against a captured proxy map. Never shipped or run in CI.
- **`axe-core/` (submodule)**: BrowserStack's fork of axe-core. Built into `axe.min.js` as part of the `a11y-engine-core` package-bump flow (`build/scripts/build_axe.sh`). Has no independent deployment.

---

## Pre-deploy checklist (mandatory)

Apply before merging or kicking off any deploy on either path. These gates are non-negotiable — every item in this list maps to a real prod break the team has lived through.

| Gate | Required for | Owner |
|---|---|---|
| **P0 sanity report** | All deploys (incl. skip-QA) | Dev |
| **P1 sanity report** | All deploys (incl. skip-QA) | Dev |
| **AT sanity** | Any change touching interactive flows or `lib/at-*` | QA |
| **Feature-flag ON + OFF exercised** | Any flag-gated change | Dev |
| **Mutation ON + OFF verified** | Any scan-logic or dispatch change | Dev + QA |
| **Perception management ON + OFF verified** | Any rule output / tagging change | Dev |
| **Shadow DOM + cross-origin iframe sites** | Any DOM traversal change | Dev |
| **Redis stress test on staging** | Any Redis-heavy or new-queue change | Dev |
| **Skip-QA explicit approval** | Skip-QA deploys only | QA lead (not unilateral — dev cannot self-approve) |
| **Phase-by-phase rollout** | All deploys | Dev (`stag → preprod → prod`, never skip a phase) |
| **No late-Friday deploys** | All deploys | Everyone — Friday-evening prod pushes are forbidden absent a real incident |

Attach P0/P1 sanity report URLs and the manual test-matrix output (see `knowledge/TESTING.md` §"Manual test matrix") to the PR description before requesting review. "Dev tested" without specifics gets the PR sent back.

### What "skip-QA" actually means

Skip-QA is not "skip testing". It's "QA team did not run their own sanity pass before merge". Dev still owns:

- P0 + P1 sanity reports.
- The full manual test matrix from `TESTING.md`.
- AT sanity if the change touches interactive flows.

Skip-QA requires explicit approval from a QA lead (not just absence of QA review). Document who approved in the PR thread.

## See also

- `skills/stack:feature-dev.md` — full development lifecycle (the script is invoked at the end of feature work, after all sub-project PRs merge).
- `rules/database-migrations.md` — in-repo rule versioning (distinct from package version handled here).
- `knowledge/docs/flows/release.md` — script internals and Jenkins job map.
- `knowledge/TESTING.md` §"Manual test matrix" — what to test by hand before the pre-deploy gates.
- `knowledge/learnings.md` §"Top 10 production bug sources" — the historical context for each gate.
- **`a11y-engine-infra-ops`** repo — Terraform + Kubernetes/Helm/Flux/Argo configs for the `ip-protection` deployment path.
- **`#help-release-engineering`** (Slack) — for ECR, k8s cluster access, External Secrets/Vault, and FluxCD system issues. Tag `@re-ops`.
