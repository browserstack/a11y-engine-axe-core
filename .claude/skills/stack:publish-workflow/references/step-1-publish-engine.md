# Step 1 — Publish Engine Package

Triggered by `SKILL.md`. Reads params: `<A11Y_ENGINE_REPO>`, `<A11Y_ENGINE_BRANCH>`, `<ENGINE_VERSION>`.

## 1.1 Prepare the version bump

```bash
cd <A11Y_ENGINE_REPO>
git checkout <A11Y_ENGINE_BRANCH>
git pull origin <A11Y_ENGINE_BRANCH>
```

## 1.2 Update version

Edit `a11y-engine-core/package.json` — set the `"version"` field to `<ENGINE_VERSION>`.

## 1.3 Regenerate lock file

```bash
cd a11y-engine-core
npm install          # updates package-lock.json only — no build step
```

> Requires Node 18.x. Run `nvm use 18.20.4` if needed.

## 1.4 Commit and push

```bash
cd <A11Y_ENGINE_REPO>
git add a11y-engine-core/package.json a11y-engine-core/package-lock.json
git commit -m "chore: bump engine version to <ENGINE_VERSION>"
git push origin <A11Y_ENGINE_BRANCH>
```

> **Safety:** Never push to `main` or `master`.

## 1.5 Trigger Jenkins package publish

1. Open: <https://minion.browserstack.com/job/A11yEngine/view/Staging%20Deploys/job/A11yEngineStagingPackagePublish/>
2. Click **Build with Parameters**.
3. Set `BRANCH_NAME` = `<A11Y_ENGINE_BRANCH>`.
4. Click **Build**.
5. Note the build number (Build History sidebar) and share the link.

> No need to wait for completion — move to Step 2 immediately.
