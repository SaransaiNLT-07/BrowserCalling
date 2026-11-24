#!/usr/bin/env bash
# Create backend/.env.production for a domain, with random secrets.
#
# Usage (from the project folder, the one containing docker-compose.prod.yml):
#   bash deploy/init-env.sh call.example.com
#
# Cloudflare TURN values are left empty: add them yourself afterwards.
# Will not overwrite an existing backend/.env.production.
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Usage: bash deploy/init-env.sh <domain>   e.g. call.example.com or 13-60-1-2.sslip.io" >&2
  exit 1
fi
if [[ "$DOMAIN" == http* || "$DOMAIN" == */* ]]; then
  echo "Pass only the host name, without https:// or a path." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
TEMPLATE="backend/production.env.example"
TARGET="backend/.env.production"

if [[ -e "$TARGET" ]]; then
  echo "$TARGET already exists; not overwriting. Edit it directly or delete it first." >&2
  exit 1
fi

random() { openssl rand -base64 "$1" | tr -d '/+=\n'; }
SECRET_KEY="$(random 64)"
DB_PASSWORD="$(random 32)"

sed \
  -e "s|call\.example\.com|${DOMAIN}|g" \
  -e "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=${SECRET_KEY}|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DB_PASSWORD}|" \
  -e "s|^UVICORN_WORKERS=.*|UVICORN_WORKERS=1|" \
  "$TEMPLATE" > "$TARGET"
chmod 600 "$TARGET"

echo "Created $TARGET for https://${DOMAIN}"
echo "  - secret key and database password generated"
echo "  - UVICORN_WORKERS=1 (fits a 1 GB free-tier instance)"
echo
echo "Still to fill in:"
grep -nE '^CLOUDFLARE_TURN_(KEY_ID|API_TOKEN)=$' "$TARGET" || true
