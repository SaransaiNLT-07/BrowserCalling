# Browser Calling — Project Understanding & Implementation Plan

> 1-to-1 audio/video calling in the browser using **WebRTC** for media and **WebSockets** for signaling.
> Stack: **Django 5 + DRF + Channels**, **Redis**, **PostgreSQL**, **React (Vite + TypeScript)**.
> Mobile (Expo / React Native) is **phase 2** — backend + web come first.

Document layout:

1. [What the project is](#1-what-the-project-is)
2. [Architecture](#2-architecture)
3. [How the current code works](#3-how-the-current-code-works-walkthrough)
4. [Issues found in the current code](#4-issues-found-in-the-current-code)
5. [From-scratch build plan (step by step)](#5-from-scratch-build-plan-step-by-step)
6. [Roadmap: current code → production](#6-roadmap-current-code--production)
7. [Phase 2 — Mobile app](#7-phase-2--mobile-app)
8. [Testing strategy](#8-testing-strategy)
9. [Production deployment topology](#9-production-deployment-topology)
10. [Definition of done checklist](#10-definition-of-done-checklist)

---

## 1. What the project is

A WhatsApp-style 1-to-1 calling app that runs in the browser:

- Users register / sign in (JWT).
- They see a **directory of people** with live **online/offline presence**.
- They can place an **audio** or **video** call to one person.
- The callee gets a **ringing** screen and can accept or decline.
- Once accepted, both browsers exchange **SDP offer/answer** and **ICE candidates** through the Django WebSocket, then audio/video flows **peer-to-peer** (or via a TURN relay when P2P is impossible).
- Calls end by hang-up, decline, cancel, ring timeout (missed), or connection loss. Every call is recorded in **call history**.

Key principle: **Django never touches media.** It only does auth, presence, call state, and relays signaling messages. Media goes browser ↔ browser (or browser ↔ TURN ↔ browser).

---

## 2. Architecture

```
┌──────────────── Browser A (caller) ────────────────┐        ┌──────────────── Browser B (callee) ────────────────┐
│ React UI → RealtimeContext → CallCoordinator       │        │ React UI → RealtimeContext → CallCoordinator       │
│                    │               │               │        │                    │               │               │
│            SignalingSocket     RtcEngine           │        │            SignalingSocket     RtcEngine           │
│              (WebSocket)    (RTCPeerConnection)    │        │              (WebSocket)    (RTCPeerConnection)    │
└───────┬────────────┬─────────────────┬─────────────┘        └───────┬────────────┬─────────────────┬─────────────┘
        │ REST       │ WS signaling    │  SRTP media (P2P)          │ REST       │ WS               │
        │            │                 └────────────────────────────┼────────────┼──────────────────┘
        │            │                         ▲  fallback: TURN relay (coturn)  │
        ▼            ▼                         │                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Nginx / Load balancer (TLS, /api → HTTP, /ws → WebSocket upgrade, static React build)             │
└───────────────────────────────┬──────────────────────────────────────────────────────────────────┘
                                ▼
┌──────────────────────── Django ASGI (uvicorn / daphne) ─────────────────────────┐
│ DRF views: auth, users/directory, calls (create/accept/reject/cancel/end/fail)   │
│ Channels: SignalingConsumer  (ws/signaling/)                                     │
│ Services: CallService (state machine, row locks)  PresenceService (Redis count)  │
└───────────────┬─────────────────────────────────────────────┬────────────────────┘
                ▼                                             ▼
        PostgreSQL (users, calls, call_events, presence)   Redis (channel layer pub/sub,
                                                                  presence connection counters, locks)
```

### Responsibilities

| Layer | Responsibility |
|---|---|
| PostgreSQL | Source of truth: users, calls, call events (audit), presence snapshot |
| Redis | Channels layer (cross-process message fan-out), per-user live connection counter, short locks |
| DRF (HTTP) | Auth, directory, call creation and call actions (fallback when socket is down), history |
| Channels (WS) | Presence, call state push, SDP/ICE relay — only between the two participants |
| CallService | Single place that owns the **call state machine** and concurrency rules (no double calls) |
| React `CallCoordinator` | Client-side call state machine; decides who offers/answers; owns `RtcEngine` |
| React `RtcEngine` | Thin wrapper over `getUserMedia` + `RTCPeerConnection` |
| STUN / TURN | NAT discovery (STUN) and relay when direct P2P fails (TURN) |

---

## 3. How the current code works (walkthrough)

### 3.1 Backend layout

```
backend/
├── config/            settings (base / local / production / test), asgi.py, urls.py
├── common/            redis client, DRF exception handler, pagination
└── apps/
    ├── accounts/      custom User (UUID pk, email login), register/login/refresh/logout/me, directory
    ├── presence/      Presence model + PresenceService (Redis counters, broadcast)
    └── calls/         Call + CallEvent models, CallService, REST views, SignalingConsumer, JWT WS middleware
```

### 3.2 Data model

- **User** — UUID primary key, unique `email` (login field), `username`, `display_name`.
- **Presence** — 1:1 with User: `status` (online/offline), `last_seen_at`.
- **Call** — `caller`, `callee`, `call_type` (audio/video), `state`, `end_reason`, `ended_by`, `created_at`, `accepted_at`, `ended_at`. DB check constraint: caller ≠ callee.
- **CallEvent** — append-only audit log of each transition (created, accepted, rejected, …).

### 3.3 Call state machine (server-owned)

```
               accept (callee)
   RINGING ───────────────────────▶ ACCEPTED ──── end (either) ───▶ ENDED
     │  │  │                           │
     │  │  └─ ring timeout 45s ─▶ MISSED │── peer offline > 20s ─▶ FAILED (connection_lost)
     │  └──── reject (callee) ──▶ REJECTED │── fail (media_denied / ice_failed) ─▶ FAILED
     └─────── cancel (caller) ──▶ CANCELLED
```

Rules enforced in `CallService` inside `transaction.atomic()` with `SELECT … FOR UPDATE`:

- Both users' rows are locked in a stable order → no two concurrent calls can be created for the same person (no deadlock thanks to sorted lock order).
- Only the callee can accept/reject; only the caller can cancel.
- Transitions are idempotent (accepting an already-accepted call is a no-op).

### 3.4 REST API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register/` | Create account, returns user + tokens |
| POST | `/api/auth/token/` | Login → access (15 min) + refresh (7 days, rotating, blacklisted after rotation) |
| POST | `/api/auth/token/refresh/` | New access token |
| POST | `/api/auth/logout/` | Blacklist refresh token |
| GET/PATCH | `/api/auth/me/` | Profile / change display name |
| GET | `/api/users/?q=` | Directory (online first) |
| GET/POST | `/api/calls/` (`?active=true`) | History / start a call |
| POST | `/api/calls/<id>/accept|reject|cancel|end|fail/` | Same actions as WS, used as fallback |
| GET | `/api/health/` | DB + Redis check |
| GET | `/api/docs/` | Swagger (drf-spectacular) |

### 3.5 WebSocket protocol — `ws/signaling/?token=<access>`

Client → server (`action`):

| action | Who | Payload |
|---|---|---|
| `ping` | any | — (refreshes presence TTL) |
| `call.accept` / `call.reject` | callee | `call_id` |
| `call.cancel` | caller | `call_id` |
| `call.end` | either | `call_id` |
| `call.fail` | either | `call_id`, `reason` ∈ media_denied / ice_failed / connection_lost |
| `call.offer` | caller only, call must be ACCEPTED | `call_id`, `sdp {type:"offer", sdp}` |
| `call.answer` | callee only, call must be ACCEPTED | `call_id`, `sdp {type:"answer", sdp}` |
| `call.ice` | either, call ACCEPTED | `call_id`, `candidate {candidate, sdpMid, sdpMLineIndex}` |
| `call.negotiate` | callee (after reload) | `call_id` → asks caller to re-offer |

Server → client (`type`): `pong`, `presence.update`, `call.state` (full call object), `call.offer`, `call.answer`, `call.ice`, `call.negotiate`, `error {code, detail}`.

Groups: every socket joins `user-<uuid>` (personal) and `presence-broadcast`. SDP/ICE are relayed **only** to the peer's personal group.

### 3.6 Presence

- On connect: Redis `INCR presence:<user>` (TTL 90 s). Count `1` → mark online in Postgres + broadcast.
- On disconnect: decrement with `WATCH/MULTI`; reaching 0 → offline + broadcast.
- Client sends `ping` every 20 s → refreshes TTL.
- A background loop (in `asgi.py`, every 5 s) reconciles users whose Redis key expired (crashed process) and expires stale calls.

### 3.7 End-to-end call sequence

```
Caller (A)                    Django (REST + WS)                     Callee (B)
   │ POST /api/calls/ ─────────▶ CallService.initiate (RINGING)
   │ ◀──── call.state(ringing) ─┼──── call.state(ringing) ───────────▶ │ shows Incoming screen
   │                            │ ◀──────────── call.accept ────────── │
   │ ◀──── call.state(accepted) ┼──── call.state(accepted) ──────────▶ │ getUserMedia, create peer
   │ getUserMedia, create peer  │                                      │
   │ createOffer ── call.offer ─▶ relay ── call.offer ───────────────▶ │ setRemote, createAnswer
   │ ◀──────────── call.answer ─ relay ◀────────────── call.answer ─── │
   │ ◀─────── call.ice ─────────▶ relay ◀────────── call.ice ─────────▶│ (trickle ICE, both ways)
   │ ═════════════════ SRTP audio/video (P2P or TURN) ════════════════ │
   │ call.end ─────────────────▶ ENDED ── call.state(ended) ─────────▶ │ close peer, stop tracks
```

Design choice worth keeping: **the offer is only sent after ACCEPTED.** This means the callee's camera is never opened while it is still ringing, and the server can reject any SDP for a call that isn't live.

### 3.8 Frontend layout

```
frontend/src/
├── config/env.ts               API/WS URLs, ICE servers from VITE_* env
├── services/
│   ├── api-client.ts           fetch wrapper, single-flight token refresh on 401
│   ├── token-store.ts          sessionStorage tokens
│   ├── auth-service.ts         login/register/refresh/logout
│   ├── signaling-socket.ts     WS with exponential backoff, ping, 4401 → refresh
│   ├── call-coordinator.ts     client call state machine (offer/answer/ICE queueing, restore after reload)
│   └── rtc-engine.ts           getUserMedia + RTCPeerConnection wrapper
├── context/
│   ├── auth-context.tsx
│   └── realtime-context.tsx    wires socket ↔ coordinator ↔ React state, presence updates
├── pages/                      sign-in, register, people, call, history, account
└── components/                 incoming-call, media-stage, call-controls, …
```

---

## 4. Issues found in the current code

Ranked by impact. File references are relative to the project root.

### 🔴 High — fix before any real users

| # | Where | Issue | Why it matters | Fix |
|---|---|---|---|---|
| H1 | `backend/config/settings/base.py` | `ALLOWED_HOSTS = ["*"]` and `CORS_ALLOW_ALL_ORIGINS = True` (the env-driven lines are commented out). `OriginGuard` therefore accepts any origin. | Host-header attacks; any website can call your API from a victim's browser; the WS origin check is effectively off. | Restore `env.list("DJANGO_ALLOWED_HOSTS")` and `env.list("CORS_ALLOWED_ORIGINS")`; set `CSRF_TRUSTED_ORIGINS`. Keep allow-all only in `local.py`. |
| H2 | `frontend/src/config/env.ts` | TURN username/credential come from `VITE_TURN_*` and are **baked into the public JS bundle**. With no TURN set, only Google STUN is used. | Anyone can read the bundle and use your TURN server as a free relay. Without TURN, roughly 10–20 % of calls (symmetric NAT, corporate/mobile networks) will connect signaling but never get media. | Run **coturn** with `use-auth-secret`, and add `GET /api/rtc/ice-servers/` that returns short-lived HMAC credentials per user (see §6 step 3). |
| H3 | `call-coordinator.ts` + `consumers.py` | **Multi-tab / multi-device answer race.** Every socket of the callee joins `user-<id>`, so all tabs ring. After one tab accepts, *all* tabs receive `call.state(accepted)` + `call.offer`, all open the camera and all send `call.answer`. The caller applies the first; the second `applyAnswer` throws `InvalidStateError`. | Camera opens on devices the user didn't answer from; flaky connections; unhandled promise rejections. | Bind a call to the **accepting connection**: store `callee_device_id` (or channel name) on accept and relay offer/ICE only to that channel; other tabs get `call.state` with `answered_elsewhere` and dismiss. |
| H4 | `call-coordinator.ts` | `onAnswer`, `onIce`, `onOffer` are fired with `void` and have no `try/catch`; errors from `setRemoteDescription` / `addIceCandidate` become unhandled rejections and the UI stays in "connecting". | Silent stuck calls. | Wrap in try/catch, log, and call `fail(callId, "ice_failed")` (or a new `negotiation_failed` reason) on unrecoverable errors. |
| H5 | `call-coordinator.ts` (`onConnectionState`) | `connectionState === "failed"` immediately ends the call; `"disconnected"` is ignored. No **ICE restart**. | Any Wi-Fi ↔ 4G switch or short packet loss kills the call. | On `disconnected` start a 5–8 s timer; on `failed` the caller does `createOffer({ iceRestart: true })` once or twice before giving up. |
| H6 | `frontend/src/services/token-store.ts` | Access **and refresh** tokens in `sessionStorage`. | Any XSS steals a 7-day refresh token. | Keep access token in memory only; move refresh token to an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/auth/token/refresh/`. |
| H7 | `docker-compose.yml`, `backend/Dockerfile` | Hard-coded Postgres password, Postgres/Redis ports published to the host, image runs as root with `config.settings.local`, no migrations step, no healthchecks. Ports also disagree with README (8000/8743 vs 8741/5173). | Not deployable as-is; open DB to the network. | Separate `docker-compose.prod.yml`; secrets from env; don't publish DB/Redis ports; non-root user; `production` settings; `migrate` + `collectstatic` entrypoint; healthchecks; fix README. |

### 🟠 Medium — correctness & scale

| # | Where | Issue | Fix |
|---|---|---|---|
| M1 | `config/asgi.py` | The expiry loop runs in **every** ASGI worker (N workers → N loops every 5 s). It's safe thanks to row locks but wasteful, and it dies if the process runs without lifespan (daphne/Channels tests). | Run it once: a dedicated `python manage.py run_call_sweeper` process, or Celery beat, or guard with a Redis lock (`SET NX EX`). |
| M2 | `calls/views.py`, `consumers.py`, `accounts/views.py` | `expire_stale_calls()` and `reconcile_offline()` are run **synchronously inside** `GET /api/calls/`, `POST /api/calls/`, `GET /api/users/` and every WS connect. | Remove from request paths; the sweeper (M1) is enough. Read paths should only read. |
| M3 | `consumers.py` | No per-socket **rate limit / message size limit**. A client can flood `call.ice` / `ping` and each one hits Postgres (`get_for_participant`). | Token-bucket per connection (e.g. 50 msgs/s), cap frame size in the server (`--ws-max-size`), and cache the active call (id, caller, callee, state) in the consumer instead of a DB read per ICE candidate. |
| M4 | `middleware.py` | Token in the **query string** (`?token=`). It ends up in Nginx/ALB access logs. Also, an open socket stays authenticated after logout or token expiry. | Use a short-lived (30–60 s) single-use **WS ticket** from `POST /api/auth/ws-ticket/`, or send the token as the first message. On logout, `group_send` a `force.disconnect` to the user's group. |
| M5 | `presence/services.py` | `INCR` + `EXPIRE` are two calls (not atomic). If the process dies between them the key never expires → user stuck "online". | Use a pipeline (`MULTI`) or a small Lua script for incr+expire. |
| M6 | `consumers.py` `_negotiate` | Always sends to `call.caller_id`, even if the caller sends it (goes back to itself). | Only allow the callee to send `call.negotiate`; relay with `_relay`. |
| M7 | `rtc-engine.ts` `switchCamera` | On desktop `facingMode: "environment"` usually fails; the new track ignores the current `cameraEnabled` flag. | Enumerate devices (`enumerateDevices`) and cycle by `deviceId`; set `track.enabled = cameraEnabled`. |
| M8 | Repo hygiene | `frontend/dist/` with **source maps**, and `.env` files exist in the working tree (`backend/.env`, `frontend/.env`, `mobile/.env`). | Add to `.gitignore`, keep only `.env.example`; don't ship source maps publicly (or upload them to Sentry only). |

### 🟡 Low — polish

- No `CallEvent` for "answered elsewhere", "busy", or network quality — useful for analytics.
- No TURN/STUN usage metrics or `getStats()` reporting (packet loss, RTT, bitrate) → hard to debug "bad call" complaints.
- `CallService.expire_stale_calls` caps at 100 rows per pass without logging that it was capped.
- No ringtone / browser `Notification` when the tab is in the background.
- No `beforeunload` → hang-up; relies on the 20 s offline grace.

---

## 5. From-scratch build plan (step by step)

This is the order I'd build it in if starting clean. Each step ends with something you can run and test. The existing code already covers most of steps 1–9; use this as the reference order and as a checklist.

### Phase 0 — Foundations (Day 1–2)

**Step 1. Repo & tooling**
- Monorepo: `backend/`, `frontend/`, `mobile/` (later), `infra/`, `docs/`.
- Backend: Python 3.11+, `ruff` + `black` + `mypy`, `pytest`, `pre-commit`.
- Frontend: Vite + React + TypeScript (strict), ESLint, Prettier, Vitest.
- `docker-compose.yml` for **Postgres 16 + Redis 7 only** in local dev.

**Step 2. Django project skeleton**
- `config/settings/{base,local,test,production}.py`, `django-environ` for all secrets.
- Install: `djangorestframework`, `djangorestframework-simplejwt` (+ blacklist app), `channels`, `channels-redis`, `django-cors-headers`, `drf-spectacular`, `psycopg[binary]`, `uvicorn[standard]`.
- `ASGI_APPLICATION`, `CHANNEL_LAYERS` (Redis), `/api/health/`.
- ✅ *Done when:* `uvicorn config.asgi:application` serves `/api/health/` → `{"status":"ok"}`.

### Phase 1 — Accounts (Day 3–4)

**Step 3. Custom user model (do this before the first migration)**
- `User(AbstractUser)` with UUID pk, unique email as `USERNAME_FIELD`, `display_name`.

**Step 4. Auth endpoints**
- Register, login (token pair + user), refresh (rotating + blacklist), logout, `me`.
- Throttle auth endpoints (`10/minute`).
- Refresh token as HttpOnly cookie (see H6).
- ✅ *Done when:* pytest covers register → login → refresh → logout → refresh fails.

### Phase 2 — Realtime backbone (Day 5–7)

**Step 5. WebSocket auth**
- `JwtAuthMiddleware` (or WS ticket, see M4) + `OriginGuard` with a real allow-list.
- `SignalingConsumer.connect()` closes with `4401` for anonymous users.
- Each socket joins `user-<uuid>`.

**Step 6. Presence**
- Redis counter per user (atomic incr+expire), TTL 90 s, `ping` every 20 s refreshes it.
- First connection → online; last disconnect → offline; broadcast `presence.update`.
- Directory endpoint `GET /api/users/?q=` sorted online-first.
- ✅ *Done when:* two browsers show each other going online/offline within ~1 s.

### Phase 3 — Call lifecycle without media (Day 8–10)

**Step 7. Call + CallEvent models** (see §3.2), indexes on `(caller,state)`, `(callee,state)`, `(state,created_at)`.

**Step 8. CallService state machine** (see §3.3)
- Lock both users with `select_for_update()` in sorted order; reject if either has a RINGING/ACCEPTED call (`409 user_busy`).
- Every transition writes a `CallEvent`.
- After every transition, push `call.state` to both users' groups.

**Step 9. Call actions over WS and REST**
- WS actions: `call.accept/reject/cancel/end/fail`.
- REST mirrors them for when the socket is down.
- **Sweeper process** (single instance): RINGING older than 45 s → MISSED; ACCEPTED with a participant offline > 20 s → FAILED.
- ✅ *Done when:* A calls B, B sees the incoming screen, accept/decline/cancel/timeout all update both screens and history — still with no audio/video.

> Building the lifecycle before media is deliberate: 80 % of calling bugs are state bugs, and they're much easier to test without WebRTC in the way.

### Phase 4 — WebRTC media (Day 11–15)

**Step 10. ICE servers**
- Run **coturn** (Docker) with `use-auth-secret` + `static-auth-secret`.
- `GET /api/rtc/ice-servers/` → STUN + TURN with time-limited credentials (§6 step 3).

**Step 11. Signaling relay**
- WS actions `call.offer` (caller only), `call.answer` (callee only), `call.ice` (either), all only when ACCEPTED.
- Validate payloads (SDP type, max length 64 KB, candidate max 4 KB).
- Relay **only to the peer** (and, after H3, only to the peer's answering device).

**Step 12. Frontend RtcEngine**
- `getUserMedia({audio:{echoCancellation, noiseSuppression}, video})`.
- `RTCPeerConnection({ iceServers })`, `addTrack`, `ontrack`, `onicecandidate`.
- Queue remote ICE candidates until `setRemoteDescription` is done.

**Step 13. Frontend CallCoordinator**
- Client phases: `idle → outgoing|incoming → connecting → connected → ended`.
- Caller creates offer **after** `call.state(accepted)`; callee answers when the offer arrives.
- Media permission denied → `call.fail(media_denied)`.
- `connectionState`: `disconnected` → wait; `failed` → ICE restart → then `call.fail(ice_failed)`.
- ✅ *Done when:* audio + video calls work between two machines on **different networks** (one on mobile hotspot) — this proves TURN works.

### Phase 5 — UX features (Day 16–18)

**Step 14.** Mute, camera on/off, switch camera (by `deviceId`), call timer, call history page, incoming-call overlay on every page, ringtone, browser `Notification` when the tab is hidden.

**Step 15. Resilience**
- WS reconnect with exponential backoff; on reconnect, `GET /api/calls/?active=true` and restore the call; callee sends `call.negotiate` so the caller re-offers.
- `beforeunload` → best-effort `call.end`.
- Multi-tab: only the accepting tab gets media (H3).

### Phase 6 — Hardening & ship (Day 19–24)

**Step 16.** Security pass (H1, H2, H6, M3, M4), rate limits, CSP header in Nginx.
**Step 17.** Observability: structured JSON logs, Sentry (backend + frontend), `getStats()` summary sent on call end (RTT, packet loss, relay vs direct).
**Step 18.** Production Docker images, CI (lint, type check, tests, build), deploy (§9).

---

## 6. Roadmap: current code → production

The codebase is already in good shape (clean service layer, server-owned state machine, row locking, payload validation, reconnect/restore logic, tests). These are the concrete steps to close the gaps from §4, in order.

### Step 1 — Lock down config (H1, M8)

```python
# config/settings/base.py
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])
CORS_ALLOW_ALL_ORIGINS = False

# config/settings/local.py
from .base import *  # noqa
DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
CORS_ALLOWED_ORIGINS = ["http://127.0.0.1:8743", "http://localhost:8743"]
```

Then remove `.env` files and `frontend/dist/` from version control and rotate any secret that was in them.

### Step 2 — Move background work out of request paths (M1, M2)

```python
# apps/calls/management/commands/run_call_sweeper.py
import logging
import time

from asgiref.sync import async_to_sync
from django.core.management.base import BaseCommand

from apps.calls.notifications import notify_calls_sync
from apps.calls.services import CallService
from apps.presence.services import PresenceService
from common.redis import redis_client

logger = logging.getLogger(__name__)
LOCK_KEY = "calls:sweeper:leader"


class Command(BaseCommand):
    help = "Expire stale calls and reconcile presence. Safe to run on several hosts: one leader at a time."

    def add_arguments(self, parser):
        parser.add_argument("--interval", type=float, default=5.0)

    def handle(self, *args, interval: float, **options):
        client = redis_client()
        while True:
            # Leader lease slightly longer than one tick.
            if client.set(LOCK_KEY, "1", nx=True, ex=int(interval * 2)):
                try:
                    notify_calls_sync(CallService.expire_stale_calls())
                    for snapshot in PresenceService.reconcile_offline():
                        PresenceService.broadcast_sync(snapshot)
                except Exception:
                    logger.exception("call sweeper tick failed")
            time.sleep(interval)
```

- Delete the `_expire_loop` from `config/asgi.py`.
- Remove `expire_stale_calls()` / `reconcile_offline()` calls from `CallListCreateView`, `DirectoryView`, and `SignalingConsumer.connect`.
- Run the sweeper as its own container/service.

### Step 3 — TURN server + ephemeral credentials (H2)

coturn (`infra/turnserver.conf`):

```
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=${TURN_SECRET}
realm=calls.example.com
total-quota=200
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
cert=/etc/ssl/turn/fullchain.pem
pkey=/etc/ssl/turn/privkey.pem
```

Django endpoint:

```python
# apps/calls/rtc.py
import base64
import hashlib
import hmac
import time

from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView


def turn_credentials(user_id: str, ttl: int) -> tuple[str, str]:
    """coturn 'use-auth-secret' (TURN REST API) credentials."""
    username = f"{int(time.time()) + ttl}:{user_id}"
    digest = hmac.new(settings.TURN_SECRET.encode(), username.encode(), hashlib.sha1).digest()
    return username, base64.b64encode(digest).decode()


class IceServersView(APIView):
    def get(self, request):
        servers = [{"urls": settings.STUN_URLS}]
        if settings.TURN_URLS and settings.TURN_SECRET:
            username, credential = turn_credentials(str(request.user.id), settings.TURN_TTL_SECONDS)
            servers.append({"urls": settings.TURN_URLS, "username": username, "credential": credential})
        return Response({"ice_servers": servers, "ttl": settings.TURN_TTL_SECONDS})
```

Settings: `TURN_SECRET`, `TURN_URLS` (e.g. `turn:turn.example.com:3478?transport=udp`, `turns:turn.example.com:5349?transport=tcp`), `STUN_URLS`, `TURN_TTL_SECONDS=3600`.
Frontend: `CallCoordinator.openMedia()` fetches `/api/rtc/ice-servers/` (cache until `ttl`) instead of reading `VITE_TURN_*`. Delete the `VITE_TURN_*` variables.

### Step 4 — One answering device per call (H3)

1. Migration: add `callee_channel = CharField(max_length=128, blank=True)` to `Call` (or a `device_id` the client generates and sends in the WS URL).
2. `CallService.accept(call_id, actor, channel_name)` stores it.
3. In the consumer, relay `call.offer` / `call.ice` to the callee **channel** (`channel_layer.send(call.callee_channel, …)`) instead of the user group; reject `call.answer` / `call.ice` from any other callee channel.
4. Other callee tabs receive `call.state` with `accepted` + a flag `answered_elsewhere=true` → they show "Answered on another device" and do **not** open media.
5. If the answering socket disconnects and reconnects, it sends `call.reclaim` with its `device_id` to re-bind.

### Step 5 — Client robustness (H4, H5, M7)

- Wrap every async handler in `CallCoordinator.handle()` with `.catch(err => this.onNegotiationError(callId, err))`.
- ICE restart:

```ts
// call-coordinator.ts (sketch)
private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
private restarts = 0;

private onPeerState(callId: string, state: RTCPeerConnectionState) {
  if (state === "connected") {
    this.clearDisconnectTimer();
    this.restarts = 0;
    this.patch({ phase: "connected", connectedAt: this.state.connectedAt ?? Date.now(), error: null });
    return;
  }
  if (state === "disconnected") {
    this.clearDisconnectTimer();
    this.disconnectTimer = setTimeout(() => void this.tryIceRestart(callId), 6000);
    return;
  }
  if (state === "failed") void this.tryIceRestart(callId);
}

private async tryIceRestart(callId: string) {
  const call = this.state.call;
  if (!call || call.id !== callId || !this.engine) return;
  if (this.restarts >= 2) return this.fail(callId, "ice_failed");
  this.restarts += 1;
  if (call.caller.id === this.selfId) {
    const offer = await this.engine.createOffer({ iceRestart: true });
    this.send({ action: "call.offer", call_id: callId, sdp: offer });
  } else {
    this.send({ action: "call.negotiate", call_id: callId }); // ask caller to restart
  }
}
```

- Backend must allow a **second** `call.offer` on an accepted call (it already does), and the callee must handle a re-offer by calling `setRemoteDescription` on the **existing** peer (not closing it) when it's an ICE restart.
- `switchCamera`: cycle through `enumerateDevices()` video inputs by `deviceId`, keep `track.enabled` in sync.

### Step 6 — Auth hardening (H6, M4)

- Access token: memory only (a module-level variable in `token-store.ts`).
- Refresh: `Set-Cookie: refresh=…; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/token/refresh/`. Page reload calls `/token/refresh/` (cookie sent automatically) to get a new access token.
- WS ticket:
  - `POST /api/auth/ws-ticket/` → random 32-byte token stored in Redis `ws-ticket:<t> = user_id`, `EX 30`.
  - Middleware does `GETDEL ws-ticket:<t>` → single use, nothing reusable in logs.
- Logout → `group_send(user_group(id), {"type": "force.disconnect"})` → consumer closes with `4401`.

### Step 7 — Consumer limits (M3, M5, M6)

- Token bucket in the consumer (e.g. 50 messages/s, burst 100) → close with `4429` on abuse.
- Uvicorn: `--ws-max-size 131072`.
- Cache `(call_id → caller_id, callee_id, state)` on the consumer after accept; invalidate on `call.state` events, so ICE relay doesn't query Postgres per candidate.
- Atomic presence incr+expire via pipeline.
- `_negotiate`: only callee may send; relay to caller.

### Step 8 — Production containers & CI (H7)

- Backend Dockerfile: multi-stage, non-root user, `DJANGO_SETTINGS_MODULE=config.settings.production`, entrypoint runs `migrate --noinput` (in a one-off job) and `collectstatic`, `HEALTHCHECK` on `/api/health/`.
- Run with `uvicorn config.asgi:application --workers 2 --proxy-headers --forwarded-allow-ips=<lb ip> --ws-max-size 131072` (or gunicorn + `uvicorn.workers.UvicornWorker`).
- `docker-compose.prod.yml`: `api`, `sweeper`, `web` (nginx), `coturn`; Postgres/Redis managed or on a private network with **no published ports**.
- GitHub Actions: `ruff`, `mypy`, `pytest` (with Postgres + Redis services), `npm run typecheck`, `npm run lint`, `npm run build`, Docker build.

### Step 9 — Observability

- Sentry SDK in Django and React.
- On call end, client sends a small stats summary (`POST /api/calls/<id>/stats/`): avg RTT, packet loss %, jitter, `candidateType` (host/srflx/relay). Store on `Call` or a `CallStats` table.
- Dashboards: calls/day, % failed by reason, % relayed through TURN, median setup time (`accepted_at` → first `connected`).

---

## 7. Phase 2 — Mobile app

Start this only after the web app passes §10. The backend contract (REST + WS protocol) stays **identical**; only the client changes. The `mobile/` folder already mirrors the web service layer, which is the right approach.

1. **Shared contract** — move `types/models.ts`, `signaling-socket.ts`, `call-coordinator.ts`, `api-client.ts` into a shared package (`packages/core`) used by both `frontend/` and `mobile/` so fixes land once.
2. **RtcEngine per platform** — `rtc-engine.web.ts` (browser APIs) and `rtc-engine.native.ts` (`react-native-webrtc`) behind the same interface (already started).
3. **Dev build** — `react-native-webrtc` isn't in Expo Go: `npx expo prebuild` + `expo run:android` / `run:ios`, camera/mic permission strings in `app.config.ts`.
4. **Token storage** — `expo-secure-store` (Keychain/Keystore).
5. **Background & incoming calls** — the hard part on mobile:
   - Push notifications for incoming calls when the app is closed: FCM (Android) / APNs **VoIP push** (iOS).
   - Native call UI: **CallKit** (iOS) and **ConnectionService** (Android) via `react-native-callkeep`.
   - Backend: `Device` model (push token, platform) + send push on `CallService.initiate`.
6. **Audio routing** — speaker/earpiece/Bluetooth switching (`react-native-incall-manager`), proximity sensor.
7. **Network handover** — Wi-Fi ↔ cellular is common on phones, so the ICE-restart work from §6 step 5 is mandatory here.
8. **Release** — EAS Build, internal testing tracks, store review (call apps need clear permission justifications).

---

## 8. Testing strategy

| Level | What | Tools |
|---|---|---|
| Unit (backend) | Every `CallService` transition incl. forbidden actors, idempotency, busy rules; payload parsers | pytest, pytest-django |
| Concurrency | Two simultaneous `initiate` to the same callee → exactly one succeeds | pytest with `transaction=True` + threads |
| WS integration | Auth reject (4401), origin reject (4403), offer/answer only to peer, state gating | `channels.testing.WebsocketCommunicator` |
| Presence | Two sockets same user → stays online until both close; TTL expiry reconcile | pytest + real Redis (CI service) |
| Unit (frontend) | `CallCoordinator` with a fake `RtcEngine` and fake socket: glare, early ICE, re-offer, failures | Vitest |
| E2E | Two browser contexts, fake media (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`), place/accept/end call, assert `connected` | Playwright |
| Network | Force relay (`iceTransportPolicy: "relay"`) to prove TURN works; test on a mobile hotspot | Manual + Playwright |
| Load | 1k concurrent sockets, presence fan-out, ICE relay throughput | Locust / k6 (WebSocket) |

---

## 9. Production deployment topology

```
                    ┌───────────── DNS: app.example.com / turn.example.com ─────────────┐
                    ▼                                                                    ▼
          ┌──────────────────┐                                             ┌──────────────────────┐
          │ LB / Nginx (TLS) │  /         → React static (CDN)             │ coturn (public IP)   │
          │  HTTP/2 + WS     │  /api      → api pool                       │ UDP 3478, TCP 5349   │
          └────────┬─────────┘  /ws       → api pool (sticky not needed)   │ relay ports 49152+   │
                   ▼                                                       └──────────────────────┘
     ┌──────────────────────────────┐   ┌──────────────┐
     │ api × N (uvicorn, ASGI)       │   │ sweeper × 1  │  (leader-locked)
     └───────┬──────────────┬────────┘   └──────┬───────┘
             ▼              ▼                    ▼
       PostgreSQL       Redis (channels layer + presence; separate DB index or instance)
```

Notes:

- **No sticky sessions needed**: the Redis channel layer lets any API pod deliver to any socket.
- coturn needs a **public IP** and its UDP relay port range open; it cannot sit behind the HTTP load balancer.
- Both the app and TURN must be on **HTTPS/WSS/TURNS** — browsers block `getUserMedia` on non-secure origins (except `localhost`).
- Set Nginx `proxy_read_timeout` for `/ws/` high (already 86400 s) and LB idle timeout > ping interval.

---

## 10. Definition of done checklist

**Backend + web (phase 1)**

- [ ] `ALLOWED_HOSTS`, CORS, CSRF, WS origin allow-list driven by env (H1)
- [ ] coturn deployed; `/api/rtc/ice-servers/` returns ephemeral creds; no TURN secrets in the bundle (H2)
- [ ] Only the accepting tab/device gets media (H3)
- [ ] All coordinator async paths have error handling (H4)
- [ ] ICE restart on `disconnected`/`failed` (H5)
- [ ] Refresh token in HttpOnly cookie, access token in memory (H6)
- [ ] Production Dockerfiles, compose, CI green (H7)
- [ ] Sweeper runs as a single leader-locked process; no sweeps in request paths (M1, M2)
- [ ] WS rate limit + max frame size (M3); WS ticket auth; logout closes sockets (M4)
- [ ] Audio and video calls verified across two different networks with relay forced
- [ ] Playwright E2E for place → accept → connected → end
- [ ] Sentry + call stats + basic dashboard

**Mobile (phase 2)**

- [ ] Shared core package used by web and mobile
- [ ] Dev builds on Android + iOS with `react-native-webrtc`
- [ ] Push-based incoming calls with CallKit / ConnectionService
- [ ] Audio routing + network handover tested
