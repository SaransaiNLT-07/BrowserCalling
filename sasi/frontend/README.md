# Saran web

Production React client for the Saran Django API. It uses the same auth, directory, call, and signaling contracts as `mobile/`.

## Stack

- React 19, TypeScript, Vite 7
- JWT access + rotating refresh tokens
- Channels signaling over WebSocket
- Browser WebRTC for one-to-one audio and video

## Local

The API must already be running on port `8000`.

```bash
cp frontend/.env.example frontend/.env
cd frontend
npm install
npm run dev
```

The app is at `http://127.0.0.1:5173`.

`seed_demo` accounts from the backend README work here. Sign in as two people in separate browser sessions (or an incognito window) to place a call.

## Scripts

```bash
npm run typecheck
npm run lint
npm run build
npm run preview
```

## Environment

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | REST base, including `/api` |
| `VITE_WS_URL` | Signaling socket, including `/ws/signaling/` |
| `VITE_STUN_URLS` | Comma-separated STUN URLs |
| `VITE_TURN_URL` | Optional TURN URL |
| `VITE_TURN_USERNAME` | Optional TURN username |
| `VITE_TURN_CREDENTIAL` | Optional TURN credential |

Do not put secrets that must stay private in `VITE_` variables; Vite inlines them into the browser bundle. Tokens live in `sessionStorage` for the tab. Production deployments that need longer sessions should move refresh tokens to httpOnly cookies on the API.

Docker builds default `VITE_API_URL=/api` and derive the socket URL from the page origin so nginx can proxy `/api` and `/ws` to the Django service.
