# Step 6 — Run P0 and P1 Pipelines

Reads params: `<SCANNER_VERSION>` (from Slack — see Gate Check 2 in SKILL.md), target environments, selected pipelines.

## 6.1 Collect parameters

Ask the user which pipelines to run (multi-select):

- `p0`
- `p1`
- `wa_p0`
- `prod_sanity_p0`
- `ai_p0`

## 6.2 Trigger Jenkins pipeline (once per pipeline per environment)

For **each** selected pipeline and **each** environment, trigger a separate build:

1. Open: <https://minion.browserstack.com/job/A11yEngine/view/all/job/A11yEngineWebsiteStagingRunner/build?delay=0sec>
2. Fill in the form:

| Field                                 | Value                                                  | Notes                                                                                           |
| ------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `AUTOMATION_BRANCH`                   | `master`                                               | Default — leave as-is                                                                           |
| `AUTOMATION_HELPER_BRANCH`            | `master`                                               | Default — leave as-is                                                                           |
| `PROFILE`                             | `preprod` / `reg` / etc.                               | Default is `reg`. Use `reg` for regression (not `regression`). Change to `preprod` for preprod. |
| `OS`                                  | `OS X`                                                 | Default — leave as-is                                                                           |
| `EXECUTION`                           | One of: `p0`, `p1`, `wa_p0`, `prod_sanity_p0`, `ai_p0` | Dropdown, single-select — one per build                                                         |
| `SCANNER_VERSION`                     | e.g., `4.47.0.0-preprod-1776940760`                    | Default is `latest` — **must change** to scanner version from Slack                             |
| `WA_SCANNER_VERSION`                  | `latest`                                               | Default — leave as-is                                                                           |
| `BROWSER`                             | `mac_chrome`                                           | Default — leave as-is                                                                           |
| `BROWSER_VERSION`                     | `latest`                                               | Default — leave as-is                                                                           |
| `CS_SCAN`                             | unchecked                                              |                                                                                                 |
| `IS_BACKWARD_COMPATIBLE`              | unchecked                                              |                                                                                                 |
| `BACKWARD_COMPATIBLE_PACKAGE_VERSION` | leave empty                                            |                                                                                                 |
| `notifyA11y`                          | **unchecked**                                          | Do NOT check — notifies the entire A11y QA team                                                 |
| `notifyOnFailure`                     | unchecked                                              |                                                                                                 |
| `notifyme`                            | **checked**                                            | Notifies you when the build completes                                                           |

> **Warning:** The form resets all fields between builds. You must re-enter `PROFILE`, `EXECUTION`, `SCANNER_VERSION`, and re-check `notifyme` for each build.

3. Click **Build**. Note the build number and share the link.
4. Repeat for each pipeline × environment combination.

> **Example:** If user selects `p0`, `p1`, and `ai_p0` for `preprod`, trigger **3 separate builds** — each with the same `PROFILE` and `SCANNER_VERSION`, but different `EXECUTION` values.
