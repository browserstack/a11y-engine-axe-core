# Quick Reference — Automate A/B Validation

## TapScanner IDs

| ID  | Engine Version                         | Branch    |
| --- | -------------------------------------- | --------- |
| 309 | 6.4.5-custom-1-regression-22072026-153 | R2        |
| 315 | 6.5.0-bl-reg-test                      | BL (main) |

## Image Tags

| Tag                                 | Branch                       | axe-core |
| ----------------------------------- | ---------------------------- | -------- |
| `regression-847dc756-260727102649Z` | main (Release 6.5.0)         | 4.11.0   |
| `reg-e2aa7ae3-260727111510Z`        | AXE-3845-axe-core-upgrade-r2 | 4.11.4   |

## ECR Base

```
737963123736.dkr.ecr.eu-central-1.amazonaws.com/browserstack/a11y-engine
```

## Redis Commands

```bash
# Get accessibility pod
A_POD=$(kubectl --context stag get pods -n regression --no-headers \
  | grep "^accessibility-" | grep Running | head -1 | awk '{print $1}')

# Enable ancestry
kubectl --context stag exec -n regression $A_POD -- bundle exec rails runner \
  'RedisUtils.add_to_release_whitelist("target_format_ancestry", <group_id>)'

# Disable ancestry
kubectl --context stag exec -n regression $A_POD -- bundle exec rails runner \
  'RedisUtils.remove_from_release_whitelist("target_format_ancestry", <group_id>)'

# Check ancestry
kubectl --context stag exec -n regression $A_POD -- bundle exec rails runner \
  'puts RedisUtils.is_feature_released_for_group?("target_format_ancestry", <group_id>)'
```

## SDK URL Mapping (when `BROWSERSTACK_ENV=reg`)

| URL                    | Value                                      | Purpose                     |
| ---------------------- | ------------------------------------------ | --------------------------- |
| `hubUrl`               | `https://hub-k8s.bsstag.com/wd/hub`        | Selenium WebDriver sessions |
| `BROWSERSTACK_API_URL` | `https://api-k8s.bsstag.com`               | Testhub build registration  |
| `HUB_URL_REGEX`        | `*.bsstag.com`                             | Hub URL validation          |
| Accessibility API      | `https://accessibility-k8s.bsstag.com/api` | Scan results, reports       |

## Jenkins Pipelines

| Pipeline                          | Host      | Purpose                                   |
| --------------------------------- | --------- | ----------------------------------------- |
| `ContainerImageBuilder`           | minion    | Build docker image from branch            |
| `A11yEngineStagingPackagePublish` | minion    | Publish npm package                       |
| `BuildProductTools`               | minion    | Build extension                           |
| `A11yUploadRules`                 | qa-minion | Upload rules to env                       |
| `A11yUploadExtension`             | qa-minion | Upload extension, create TapScanner entry |

## Dashboard URL Template

```
https://accessibility-k8s.bsstag.com/automated-tests/projects/p/builds/b/1?thBuildId=<thBuildId>
```

## Full npm/npx Path

```
/Users/sunny/.nvm/versions/node/v20.4.0/bin/npm
/Users/sunny/.nvm/versions/node/v20.4.0/bin/npx
```
