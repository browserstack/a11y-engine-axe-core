---
name: stack:add-assisted-test
description: Add or modify an Assisted Test (semi-automated WCAG check via browser extension).
argument-hint: "<category> <test-name> [version]"
---

# Add Assisted Test

## Categories

`modals` | `forms` | `keyboard` | `layout` | `images` | `tables` | `orientation`

## Steps

### 1. Create Versioned Class

```
ip-protection/assistedTests/<category>/<category>-v<N>.js
```

- Extend previous version (e.g., `forms-v2.js extends forms-v1.js`).
- **Never modify existing versions.**
- Initialize violation state in constructor: all rule keys -> empty arrays/null.

### 2. Define Views

```
ip-protection/assistedTests/<category>/views/<view-name>.js
```

Each view exports:
- `render(context, params)` — returns UI data for devtools
- `onNext(context, payload, params)` — processes user response, returns next view

Register in `views-v<N>.js` map file.

### 3. Define Messages

- Category constants: `<category>ATConsts.js`
- Aggregate into `ATMessages.js`
- Namespace: `ba11yengine.*`

### 4. Define Rule Info

Each rule needs in constants:
- `title`, `description`
- `tags` (WCAG success criteria)
- `howToFix`
- `impact`: `critical` | `serious` | `moderate`

### 5. Add Latency Tracking

```js
const stopTracking = context.startLatencyTracking(ruleId);
// ... check logic ...
stopTracking();
```

### 6. Error Handling

```js
doneHandler({ isError: true, error });
// Reports AT_ERROR to devtools + ErrorHandler
```

## Checklist

- [ ] New versioned class, previous version untouched
- [ ] Views registered in map file
- [ ] Messages in constants + ATMessages.js
- [ ] Rule info complete (title, description, tags, howToFix, impact)
- [ ] Latency tracking on each check
- [ ] Error handling via doneHandler
- [ ] State deep-cloned for history snapshots
