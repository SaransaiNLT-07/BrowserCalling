# Saran

Saran is a one-to-one audio and video calling app. Accounts, presence, and call state live in Django. The Expo client places calls through a service layer and keeps that logic out of the screens.

## Layout

- `backend/` — Django REST Framework, Channels signaling, PostgreSQL, Redis
- `frontend/` — Vite React web client for the same API
- `mobile/` — Expo SDK 57, Expo Router, TypeScript

## Call flow

1. A person signs in and receives a short-lived JWT access token plus a rotating refresh token.
2. The app opens `ws/signaling/` with that access token. Connecting marks them online. The last socket closing marks them offline. A Redis counter keeps two devices online until both disconnect.
3. `POST /api/calls/` creates a ringing call. The server refuses self-calls and refuses a call when either person already has an active one.
4. The callee accepts. Only then may the caller send an SDP offer, the callee send an answer, and either side send ICE candidates. The socket relays those messages only to the other participant.
5. Hanging up, declining, cancelling, a 45-second ring timeout, or a peer who stays offline past the grace period moves the call to a terminal state. The client stops tracks and closes the peer connection.

Native iOS and Android use `react-native-webrtc`, which needs a development build. Expo web uses the browser's WebRTC APIs so the same service contract runs in a desktop browser.

## Local setup

Requirements: Python 3.11, Node.js 22, PostgreSQL 16, and Redis.

```bash
cp backend/.env.example backend/.env
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
uvicorn config.asgi:application --host 0.0.0.0 --port 8000
```

In another shell, the production web client:

```bash
cd frontend
npm install
npm run dev
```

The React app is served at `http://127.0.0.1:5173`. API and socket URLs come from `frontend/.env`.

The Expo client still runs on `http://127.0.0.1:8081`:

```bash
cd mobile
npm install
npm run web
```

`seed_demo` runs only while `DJANGO_DEBUG=true`. The local password is `DEMO_SEED_PASSWORD` in `backend/.env` (`Harbor-Call-19` in the example). It creates:

- avery@Saran.dev / avery / Avery Chen
- jordan@Saran.dev / jordan / Jordan Hale
- mina@Saran.dev / mina / Mina Ortiz

Sign in as two of them in separate browser sessions to place a call. Browsers will ask for the microphone and camera.

Docker Compose can start Postgres, Redis, and the API:

```bash
docker compose up --build
```

The API container overrides `POSTGRES_HOST` and `REDIS_URL`. Run migrations inside the container before the first request. The `web` service serves the React build at `http://127.0.0.1:5173` and proxies `/api` and `/ws` to Django.

## Tests

```bash
cd backend && .venv/bin/pytest
cd frontend && npm run typecheck
cd mobile && npx tsc --noEmit
```

## Environment

Backend values are listed in `backend/.env.example`. Production should use `DJANGO_SETTINGS_MODULE=config.settings.production`, a unique `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, and HTTPS. Terminate TLS at the proxy and point the app at `wss://`.

Mobile values use the `EXPO_PUBLIC_` prefix so Expo can inline them. Do not put secrets there. Optional TURN credentials belong in `EXPO_PUBLIC_TURN_URL`, `EXPO_PUBLIC_TURN_USERNAME`, and `EXPO_PUBLIC_TURN_CREDENTIAL`.

On iOS and Android, tokens are stored with Expo SecureStore (Keychain / Keystore). The web client keeps them in `sessionStorage` for the tab session because SecureStore is not available in browsers.

## Native builds

`react-native-webrtc` is not in Expo Go. Create a development build after prebuild:

```bash
cd mobile
npx expo prebuild
npx expo run:ios
npx expo run:android
```

Camera and microphone usage strings are set in `mobile/app.config.ts`.

## Operations

The ASGI process expires ringing calls after `CALL_RING_TIMEOUT_SECONDS` (45) and ends accepted calls when a participant has been offline longer than `CALL_OFFLINE_GRACE_SECONDS` (20). The same sweep is available on demand:

```bash
python manage.py expire_calls
```
