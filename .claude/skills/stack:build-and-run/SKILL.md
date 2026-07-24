---
name: stack:build-and-run
description: Build and run local development services for any package in the monorepo.
argument-hint: "[package] [action]  e.g. 'a11y-engine-core build' or 'ip-protection dev'"
---

# Build and Run

## Prerequisites

```bash
nvm use 18.20.4
```

## Package Commands

### a11y-engine-core
```bash
cd a11y-engine-core
./build/scripts/build_axe.sh   # Must run first (builds axe-core dependency)
npm install
npm run build                   # Grunt -> dist/a11y-engine-core.min.js
npm test                        # Karma + Mocha + Chai
```

### ip-protection
```bash
cd ip-protection
npm install
npm run dev      # Express server (port 8881)
npm run worker   # Regular + AI workers
npm test         # Jest
```

### dom-forge-core
```bash
cd dom-forge-core
npm install
npm run build   # Grunt
npm test        # Mocha
```

### Root (linting)
```bash
npm run lint:check
npm run lint:fix
npm run lint:modified   # Only modified files
```

## Steps

1. Identify the target package from user request.
2. Ensure Node 18.20.4 is active.
3. Run the appropriate commands above.
4. Report build output, test results, or server status.
