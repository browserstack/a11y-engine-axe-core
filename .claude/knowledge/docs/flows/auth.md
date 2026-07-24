# Auth

All auth lives in `ip-protection/utils/middleware.js`. It exports **4 middlewares** — use one of these for any new route or socket; do not hand-roll JWT verification elsewhere.

## The middlewares

| Export | Applied to | Token source | On success | On failure |
|---|---|---|---|---|
| `verifySocketAuthToken` | `io.use(...)` on socket.io server | `socket.handshake.auth.token` | Sets `socket.data.userId`, `socket.data.groupId` from JWT | Drops connection via `next(new Error('Authentication error'))` |
| `verifyAPIAuthToken` | Express routes (user scans) | `req.headers.authorization` `Bearer <jwt>` | Sets `req.userId`, `req.groupId`, `req.apiVersion`, `req.applyConsolidation`, `req.authToken`; registers `Chitragupta.setMetaData('userId', ...)` for log correlation | `401` JSON `{status: 'FAILURE', error: {...}}`, specific branch for `TokenExpiredError` |
| `verifyAutomationAuth` | Automation-specific routes | `req.headers.authorization` `Bearer <token>` | Passes through if token === `BASIC_AUTHTOKEN` | `401` if missing, `403` if mismatch |
| `verifyBasicAuth` | Webhook endpoints (e.g., AI service callbacks) | `req.headers.authorization` `Bearer <token>` | **⚠️ Current code has a bug**: condition `token !== AUTHTOKEN_0 \|\| token !== AUTHTOKEN_1` (in `utils/middleware.js`) effectively rejects every token unless both env vars hold the same value. Intent is "match either" for key rotation; needs `&&`. | `401` or `403`. **Bypassed in `IS_DEVELOPMENT_ENV`** |

Internal helper: `verifyToken(token)` does the actual JWT decode. It tries `JWT_TOKEN_SECRET` first, falls back to `PREVIOUS_JWT_TOKEN_SECRET` if `JsonWebTokenError` and the previous secret is non-empty — this is the **key rotation window**. Not exported; do not import directly.

Dev escape hatch: in `IS_DEVELOPMENT_ENV`, `verifyToken` uses `jwt.decode` (no signature verify) and `verifyBasicAuth` short-circuits to `next()`.

## Where they're wired

- Socket.io auth: `ip-protection/app.js` does `io.use(verifySocketAuthToken)` (around line 127) **before** any `socket.on(...)` handler runs. All socket events inherit auth.
- HTTP routes: bound per-route in `ip-protection/routes/*.js`. New routes **must** declare one of the four. This is enforced by `rules/api-design.md` and `rules/security.md`.

## Hard rules

- No new HTTP route or socket event without auth.
- Do not re-implement JWT verification — call one of the 4 middlewares.
- Do not log the raw token at `info` level. (Note: current middleware code logs `authHeader` at info — if you copy this pattern, prefer redacting in new routes.)
- Key rotation: `PREVIOUS_JWT_TOKEN_SECRET` is intentional. Do not remove the fallback unless coordinating a rotation.

## See also

- `rules/security.md` — auth must-haves.
- `rules/api-design.md` — "No new routes or socket connections without auth".
- `socket-protocol.md` — socket events that inherit `verifySocketAuthToken`.
- `scan-lifecycle.md` — HTTP routes that take `verifyAPIAuthToken`.
