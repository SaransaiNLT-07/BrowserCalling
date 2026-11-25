# Browser Calling — Production Code Review (2026-11-24)

Scope: `backend/`, `frontend/`, `deploy/`, compose files, and the key `mobile/` files.
Since the last review, these were fixed: env-driven `ALLOWED_HOSTS`/CORS with production startup guards, a production compose file (no published DB/Redis ports, healthchecks), a non-root Docker image, TURN credentials served from the backend (Cloudflare), and `sourcemap: false`.

## 🔴 High

### 1. Expired-token WebSocket never recovers (reconnect loop)
`consumers.py` calls `close(4401)` **before** `accept()`. Channels then rejects the HTTP upgrade with 403, so the browser sees close code **1006**, not 4401. `signaling-socket.ts` only refreshes on 4401, so it reconnects every 10 s with the same expired token. Presence shows offline and incoming calls are missed until some REST call happens to trigger a refresh. The test passes only because `WebsocketCommunicator` reports the code.
**Fix:** `await self.accept(); await self.close(code=4401)` for anonymous users (do the same in `OriginGuard` with 4403). On the client, refresh the token when the socket closes before `onopen`, and refresh it before it expires (check the `exp` claim).

### 2. Presence can say "offline" for a connected user, and the sweeper then kills their call
- `mark_connected` / `mark_disconnected` update Redis and Postgres in separate steps. When a tab reloads (old socket disconnects while the new one connects), the Postgres writes can land in the wrong order: Redis has the key, but the database says OFFLINE.
- `touch()` refreshes the TTL only if the key still exists. If it expired once (laptop sleep, throttled background tab), it is never recreated while the socket stays open.
- `reconcile_offline` only fixes the online-without-key case, never the offline-with-key case.
- `mark_connection_lost` reads the **Postgres** status, so after 20 s an accepted call is set to FAILED `connection_lost` while both users are connected.
**Fix:** track presence per connection (a Redis ZSET `presence:<user>` of `channel_name → last_heartbeat`, written with a Lua script or pipeline). Online means the ZSET has an entry newer than the TTL. Make the sweeper use Redis as the source of truth, and update Postgres from it in both directions.

### 3. Registration returns a 500
DRF's `UniqueValidator` runs before `validate_email`, so `Avery@x.dev` passes the uniqueness check against `avery@x.dev`, then gets lowercased and hits the DB `IntegrityError` → 500. Two parallel sign-ups with the same username also cause a 500 (check-then-insert race).
**Fix:** check `iexact` uniqueness in `validate_email` and `validate_username`, catch `IntegrityError` in `create()` and return 400, and add `UniqueConstraint(Lower("email"))` and `UniqueConstraint(Lower("username"))`.

### 4. TURN credentials are shared by every user for 12 h (cost and abuse)
`turn.py` caches one Cloudflare credential set (TTL 24 h) in Redis for **all** users for TTL/2. Any account can copy it and use your relay for 24 h, and you pay per GB. It also can't be revoked per user.
**Fix:** issue credentials per user with a short TTL (1–2 h), cache them per user, add a throttle scope on `IceServersView`, and fetch new credentials when the client reconnects.

### 5. Multi-tab / multi-device answer race (still open, H3)
Every callee tab gets `call.offer`, opens the camera, and sends `call.answer`. The caller's second `setRemoteDescription` throws.
**Fix:** bind the call to the accepting `channel_name` and relay offer/ICE only to that channel. Other tabs get "answered elsewhere".

### 6. CallCoordinator robustness (still open, H4/H5, plus two new bugs)
- `handle()` fires `void this.onX()` with no catch: errors from `createAnswer`, `applyAnswer` or `addIceCandidate` become unhandled rejections, leave `answerSent=true`, and the call is stuck on "Connecting".
- `failed` immediately ends the call, `disconnected` is ignored, and there is no ICE restart.
- **New – privacy:** any re-offer or `call.negotiate` closes the engine and reopens media with `muted:false`. A user who muted is **silently unmuted** when the peer reconnects.
- **New – deadlock:** if `call.negotiate` arrives while `openMedia` is still running, `generation` is bumped and `ensureMedia` returns the old `mediaTask`, which exits early. `engine` stays null, no offer is ever sent, and the call stays on "Connecting" forever.
**Fix:** wrap each handler in a catch that calls `fail(callId, "negotiation_failed")`. On a re-offer, call `setRemoteDescription` on the existing peer instead of recreating it, and keep `muted`/`cameraEnabled`. Clear `mediaTask` when `generation` changes. Add the ICE-restart flow from IMPLEMENTATION.md §6 step 5.

### 7. Tokens exposed (still open, H6/M4)
- The access JWT is in the WS query string, and nginx's default `access_log` writes the full URI, so every token lands in logs.
- The 7-day refresh token is stored in `sessionStorage`, so any XSS can steal it.
**Fix:** use a single-use WS ticket (`POST /api/auth/ws-ticket/` → Redis `GETDEL`), keep the refresh token in an HttpOnly cookie, keep the access token in memory only, and on logout send `force.disconnect` to the user's group.

### 8. Rate limits don't work in production
There is no `CACHES` setting, so DRF throttles use per-process `LocMemCache`. Each uvicorn worker gets its own counter, and counters reset on every restart. `/admin/` is public behind nginx, and its login has no throttle.
**Fix:** `CACHES = {"default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": REDIS_URL}}` (use a separate DB index). Restrict `/admin/` by IP or put it behind VPN/basic auth, or add django-axes.

## 🟠 Medium

| # | Where | Issue | Fix |
|---|---|---|---|
| M1 | `asgi.py`, `views.py`, `consumers.py` | The sweeper runs in every worker, inside `GET/POST /api/calls/` and `GET /api/users/`, and on every WS connect. | Run one leader-locked `run_call_sweeper` process. Read paths should only read. |
| M2 | `services.expire_stale_calls` | `accepted_ids[:100]` (newest first). Once there are more than 100 live calls, older calls are never checked. | Paginate by `id`/`created_at`, or check only calls whose participants are offline (join on presence). |
| M3 | `consumers.py` | No per-socket rate or size limit. Every `call.ice` runs a Postgres query with 5 joins. | Token bucket (close with 4429), `--ws-max-size 131072`, cache `(call_id → caller, callee, state)` on the consumer. |
| M4 | `CHANNEL_LAYERS` | channels_redis `group_expiry` defaults to 24 h: a tab open longer than a day silently stops receiving calls and presence. | Re-run `group_add` on every ping (cheap), or raise `group_expiry`. |
| M5 | `base.py` | `CONN_MAX_AGE=60` under ASGI: each thread-pool thread keeps its own connection, so `workers × threads` can exhaust Postgres. | `CONN_MAX_AGE=0` plus `OPTIONS: {"pool": True}` (psycopg pool, Django 5.1+) or PgBouncer. |
| M6 | `auth-service.refreshAccess` | Any error, **including a network blip**, clears the tokens, which logs the user out. | Clear only on 401/400 from `/token/refresh/`. |
| M7 | `signaling-socket.ts` | `stop()` during the `await getToken()` still opens a socket (leak after sign-out). There is no pong deadline, so a half-open TCP connection (common on mobile/Wi-Fi) is never detected. | Re-check `shouldRun` after the await. Close and reconnect if no `pong` arrives within ~45 s. |
| M8 | `consumers._negotiate` | Either participant can send it, and it always goes to the caller. | Allow only the callee, and send it with `_relay`. |
| M9 | `realtime-context.refreshDirectory` | Search requests race, so a slow old response overwrites newer results. | Use an `AbortController` or a request sequence id. |
| M10 | `rtc-engine.switchCamera` | Uses `facingMode` (fails on desktop), ignores `cameraEnabled`, and leaks the new track when there is no video sender. | Cycle `enumerateDevices()` by `deviceId` and set `track.enabled`. |

## 🟡 Low / hygiene

- `config/settings/test.py` contains a real-looking DB password (`S@r@ns@i07`). Remove it and rotate it if it is used anywhere.
- `docker-compose.prod.yml` gives the whole `.env.production` (Django secret, Cloudflare token) to the **postgres** and **caddy** containers. Split it into per-service env files.
- `nginx.conf`: `add_header` inside `/assets/` removes the server-level security headers there (nginx inheritance rule). The SPA has no CSP and no HSTS (Caddy doesn't add HSTS). `index.html` should get `Cache-Control: no-cache`.
- `frontend/Dockerfile` still accepts `VITE_TURN_*` build args, and `env.ts` falls back to static TURN credentials. Delete both.
- `requirements.txt` puts pytest in the production image. `daphne` and `uvicorn` are both installed. Split into `requirements/base.txt` + `dev.txt`.
- Django admin "Add user" uses the stock `UserCreationForm` (bound to `auth.User`), which breaks with the custom user. Add custom admin forms.
- `Call.caller/callee` use `on_delete=PROTECT`, so accounts can't be deleted (GDPR). There is no block list, and anyone can ring anyone (spam).
- There are no Postgres backups for the `postgres-data` volume, no CI, no backend lint/mypy, and no frontend tests.
- README tells you to copy `backend/.env.example`, which doesn't exist.
- Mobile: the coordinator is a copy of the web one (fixes drift), the Android package `com.Saran.calls` and iOS bundle `com.saran2.calls` don't match, there is no background or push incoming-call handling, and `BLUETOOTH` is deprecated on Android 12+.

## Suggested fix order
1 → 2 → 3 (correctness bugs users will hit) → 6 → 8 → 4 → 7 → 5 → Medium table.
