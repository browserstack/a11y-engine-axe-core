# Structural Path Allowlist

A change in these paths should trigger architecture review. A change outside these paths should not.

## Included (structural)

```
a11y-engine-core/lib/rules/**
a11y-engine-core/lib/checks/**
a11y-engine-core/lib/commons/**
a11y-engine-core/lib/core/public/**
a11y-engine-core/lib/core/utils/**
a11y-engine-core/lib/core/errors/**
a11y-engine-core/lib/core/base/constants.js

ip-protection/app.js
ip-protection/worker.js
ip-protection/aiWorker.js
ip-protection/routes/**
ip-protection/controllers/**
ip-protection/worker/**
ip-protection/utils/middleware.js
ip-protection/utils/bullmq.js
ip-protection/utils/logger.js
ip-protection/utils/eds-utils.js
ip-protection/utils/workerShutdown.js
ip-protection/utils/redis-utils.js
ip-protection/utils/socketsMap.js
ip-protection/utils/b1DataChunkHandler.js
ip-protection/utils/notifyRunStatusHandler.js
ip-protection/utils/scanStartedHandler.js
ip-protection/utils/s3Utils.js
ip-protection/commons/v2/**
ip-protection/checks/**
ip-protection/rules/**
ip-protection/config/constants.js

dom-forge-core/percy/**
dom-forge-core/lib/core/**
dom-forge-core/lib/checks/**

scripts/bumpA11yEngine.sh
a11y-engine-core/build/scripts/build_axe.sh
a11y-engine-core/build/scripts/consolidate_rules.js
```

## Excluded (not structural — do not trigger review)

```
**/test/**
**/__tests__/**
**/*.test.js
**/*.spec.js
**/*.md                   # docs change independently
*.json                    # ONLY excluded for root / config — rule JSON IS structural
package-lock.json
yarn.lock
**/dist/**
**/coverage/**
**/node_modules/**
ip-protection/assistedTests/**    # out of scope
.prettierrc, .eslintrc*, .gitignore
.github/**, .claude/**            # meta — change here doesn't change code structure
```

## Notes

- **Rule JSON is structural**, even though `*.json` is listed under excluded. The `ip-protection/rules/**` and `a11y-engine-core/lib/rules/**` globs keep them included. The broad `*.json` exclusion is for root-level `config.yml`-style artifacts.
- **package.json** bumps — excluded from structural diff. Version bumps don't change architecture. If a new dependency appears, the code that imports it will land in an included path anyway.
- **`commons/helper.js`** and similar utility files not explicitly listed — if they start appearing in architecture docs, add them here. The allowlist is not a closed set; extend it when the architecture reference grows.

## How to extend

When a new subsystem appears:

1. Add it to the `Included` list above with a justifying comment.
2. Open a PR that includes both the new architecture doc and the allowlist entry.
3. Run `/refresh-architecture` against that PR to confirm the allowlist fires correctly.
