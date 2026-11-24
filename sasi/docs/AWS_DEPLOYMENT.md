# Deploying on AWS (free tier, single EC2 server)

Everything runs on **one EC2 instance** with Docker:

```
                 ┌──────────────── EC2 t3.micro (Ubuntu 24.04) ────────────────┐
Internet ─443──▶ │ caddy (HTTPS) ─▶ web (nginx + React) ─▶ api (Django) ─▶ postgres, redis │
                 └──────────────────────────────────────────────────────────────┘
Calls: browser ⇄ browser directly, or through Cloudflare TURN when that is blocked.
```

No RDS, ElastiCache or load balancer: they are outside the free allowance and not needed at this size.

> **Cost check:** AWS changed the free tier in July 2025. New accounts get credits on a free plan for up to
> 6 months; older accounts have the 12-month "750 hours of t2/t3.micro" offer. Look at
> **Billing and Cost Management → Free Tier** to see which one you have. A public IPv4 address costs
> about $3.60/month either way (it is paid from credits on the new plan).

---

## 0. Set a budget alert first (2 minutes)
**Billing and Cost Management → Budgets → Create budget → "Zero spend budget"** (or a $5 monthly budget)
with your email. You get an email the moment anything starts costing money.

## 1. Launch the server
**EC2 → Launch instance**
| Setting | Value |
|---|---|
| Name | `saran-call` |
| AMI | **Ubuntu Server 24.04 LTS** (x86_64) |
| Instance type | **t3.micro** (or t2.micro: whichever is marked "Free tier eligible") |
| Key pair | Create new → RSA → `.pem` → download and keep it safe |
| Storage | **25 GiB gp3** (free tier allows up to 30) |

**Network settings → Edit → Create security group** with these inbound rules:
| Type | Port | Source | Why |
|---|---|---|---|
| SSH | 22 | **My IP** | your terminal only |
| HTTP | 80 | Anywhere (0.0.0.0/0) | Let's Encrypt + redirect to HTTPS |
| HTTPS | 443 | Anywhere | the app |
| Custom UDP | 443 | Anywhere | HTTP/3 (optional) |

Do **not** open 5432, 6379 or 8000.

## 2. Give it a fixed IP address
**EC2 → Elastic IPs → Allocate → Actions → Associate** with your instance.
Without this, the IP changes when the instance stops and your domain breaks.

## 3. Point a domain at it
- **Own domain:** at your registrar (or Route 53), add an **A record** `call.yourdomain.com → <Elastic IP>`.
- **No domain yet (testing):** use `<ip-with-dashes>.sslip.io`, e.g. Elastic IP `13.60.1.2` →
  `13-60-1-2.sslip.io`. It resolves to your IP automatically and works with Let's Encrypt.

HTTPS is required: browsers only allow camera and microphone on HTTPS pages.

## 4. Prepare the server
From your computer (PowerShell works):
```powershell
ssh -i path\to\key.pem ubuntu@<Elastic IP>
```
On the server:
```bash
git clone https://github.com/SaransaiNLT-07/sasi.git
sudo bash sasi/sasi/deploy/aws-ec2-setup.sh
exit
```
This installs Docker, adds 2 GB swap, limits log size and enables security updates.
Log back in so you can use `docker` without `sudo`.

> **Private repo?** `git clone` will ask for a username and password. Use your GitHub username and a
> [fine-grained personal access token](https://github.com/settings/personal-access-tokens) with
> read-only "Contents" access to this repo as the password.

## 5. Configure
```bash
cd ~/sasi/sasi
bash deploy/init-env.sh call.yourdomain.com      # or 13-60-1-2.sslip.io
nano backend/.env.production
```
`init-env.sh` fills in the domain, a random secret key and database password, and sets
`UVICORN_WORKERS=1` for the 1 GB server. In `nano`, add:
```
CLOUDFLARE_TURN_KEY_ID=...
CLOUDFLARE_TURN_API_TOKEN=...      # use a NEW token, not the one shared in chat
```
Save with `Ctrl+O`, `Enter`, `Ctrl+X`.

## 6. Start
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
The first build takes roughly 5–10 minutes on a t3.micro. Then:
```bash
docker compose -f docker-compose.prod.yml ps                 # all services "running"/"healthy"
docker compose -f docker-compose.prod.yml exec api python manage.py createsuperuser
curl https://call.yourdomain.com/api/health/                 # {"status": "ok"}
```

## 7. Test a real call
Open `https://call.yourdomain.com` on two devices on **different networks** (for example one laptop on
Wi-Fi and one phone on mobile data), register two users, and place a video call.

---

## Day-to-day

**Deploy an update**
```bash
cd ~/sasi && git pull
cd sasi && docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f        # free disk space from old images
```

**Logs**
```bash
docker compose -f docker-compose.prod.yml logs -f api        # or web, caddy, postgres
```

**Database backup** (run regularly; copy the file off the server)
```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > backup-$(date +%F).sql.gz
```
From your computer: `scp -i key.pem ubuntu@<ip>:~/sasi/sasi/backup-*.sql.gz .`

**Mobile app**: build with
`EXPO_PUBLIC_API_URL=https://call.yourdomain.com/api` and
`EXPO_PUBLIC_WS_URL=wss://call.yourdomain.com/ws/signaling/`. Leave `EXPO_PUBLIC_TURN_*` empty.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Browser shows a certificate error, `caddy` logs mention ACME | DNS doesn't point at the Elastic IP yet, or port 80/443 isn't open in the security group. Fix, then `docker compose -f docker-compose.prod.yml restart caddy`. |
| Build stops with `Killed` / exit code 137 | Out of memory. Check swap: `free -h` should show 2 GB swap. Re-run `sudo bash deploy/aws-ec2-setup.sh`. |
| `api` keeps restarting | `docker compose -f docker-compose.prod.yml logs api`. An `ImproperlyConfigured` message names the missing or unsafe setting in `backend/.env.production`. |
| Site loads but login fails with a network error | `DJANGO_ALLOWED_HOSTS` / `CORS_ALLOWED_ORIGINS` don't match the domain you opened. |
| Calls ring but stay on "connecting" | `docker compose -f docker-compose.prod.yml logs api \| grep -i turn`. "Could not generate Cloudflare TURN credentials" means the key id or token is wrong. |
| SSH stops working | Your home IP changed: update the port 22 rule to "My IP" again. |

## When you outgrow one micro server
1. Move to **t3.small** (2 GB RAM) and set `UVICORN_WORKERS=2`: no other change needed.
2. Move Postgres to **RDS** by pointing `POSTGRES_HOST` at it and removing the `postgres` service.
