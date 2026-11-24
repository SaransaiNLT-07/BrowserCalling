# Production deployment

```
Internet ──443──▶ Caddy (HTTPS) ──▶ nginx "web" (React build, /api /ws /admin proxy)
                                         └──▶ Django "api" (uvicorn, Channels) ──▶ Postgres, Redis
Browsers ◀── media P2P, or via Cloudflare TURN when P2P is blocked ──▶ Browsers
```

## 1. Server prerequisites
- A Linux host with Docker and the Compose plugin.
- A DNS record for your domain pointing at the host.
- Firewall: open TCP 80 and 443 (plus UDP 443 for HTTP/3). Do **not** open 5432, 6379 or 8000.

## 2. Configure
```sh
cp backend/production.env.example backend/.env.production
```
Fill in `DOMAIN`, `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD`, the hosts/origins and the Cloudflare TURN values.
Django refuses to start in production if `DJANGO_ALLOWED_HOSTS` is `*`, `CORS_ALLOW_ALL_ORIGINS` is true,
or the secret key is short.

## 3. Start
```sh
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api python manage.py createsuperuser
```
Migrations run automatically on api start (`RUN_MIGRATIONS=1`). Caddy gets a Let's Encrypt
certificate on first request.

## 4. Check
- `https://<domain>/api/health/` returns `{"status": "ok"}`.
- Log in on two devices on **different networks** (e.g. one on mobile data) and place a video call.
- `docker compose -f docker-compose.prod.yml logs api | grep -i turn` shows no
  "Could not generate Cloudflare TURN credentials" errors.

## Mobile app
Build with `EXPO_PUBLIC_API_URL=https://<domain>/api` and `EXPO_PUBLIC_WS_URL=wss://<domain>/ws/signaling/`.
Leave the `EXPO_PUBLIC_TURN_*` values empty: TURN credentials come from the API.

## Operations
- **Backups:** the `postgres-data` volume holds all accounts and call history. Schedule
  `docker compose -f docker-compose.prod.yml exec postgres pg_dump -U saran saran > backup.sql`.
- **Cloudflare TURN cost:** set a usage alert in the Cloudflare dashboard. Rotating the API token
  invalidates all issued TURN credentials; restart `api` afterwards. Cached credentials live in
  Redis under `Saran:turn:ice-servers`.
- **Scaling:** `UVICORN_WORKERS` sets API workers. WebSocket groups go through Redis, so several
  workers (or hosts sharing Postgres and Redis) work together.
