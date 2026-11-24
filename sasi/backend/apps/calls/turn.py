"""Short-lived TURN credentials from Cloudflare Realtime TURN.

The Cloudflare API token never leaves the server: clients call
GET /api/calls/ice-servers/ and receive ready-to-use ICE servers whose
username/credential expire after CLOUDFLARE_TURN_TTL_SECONDS.
"""

import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

from common.redis import redis_client

logger = logging.getLogger(__name__)

CACHE_KEY = "Saran:turn:ice-servers"
CLOUDFLARE_URL = (
    "https://rtc.live.cloudflare.com/v1/turn/keys/{key_id}/credentials/generate-ice-servers"
)


def _fallback() -> list[dict]:
    return [{"urls": url} for url in settings.STUN_URLS]


def _fetch_from_cloudflare() -> list[dict]:
    request = urllib.request.Request(
        CLOUDFLARE_URL.format(key_id=settings.CLOUDFLARE_TURN_KEY_ID),
        data=json.dumps({"ttl": settings.CLOUDFLARE_TURN_TTL_SECONDS}).encode(),
        headers={
            "Authorization": f"Bearer {settings.CLOUDFLARE_TURN_API_TOKEN}",
            "Content-Type": "application/json",
            # Cloudflare rejects urllib's default User-Agent (error 1010).
            "User-Agent": "saran-backend/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        payload = json.loads(response.read())
    servers = payload.get("iceServers")
    if isinstance(servers, dict):
        servers = [servers]
    if not servers:
        raise ValueError("Cloudflare response had no iceServers")
    # Port 53 is blocked by browsers (Chrome/Firefox) and just adds timeouts.
    for server in servers:
        urls = server.get("urls")
        if isinstance(urls, list):
            server["urls"] = [u for u in urls if ":53?" not in u and not u.endswith(":53")]
    return servers


def ice_servers() -> list[dict]:
    if not (settings.CLOUDFLARE_TURN_KEY_ID and settings.CLOUDFLARE_TURN_API_TOKEN):
        return _fallback()

    client = redis_client()
    try:
        cached = client.get(CACHE_KEY)
        if cached:
            return json.loads(cached)
    except Exception:  # noqa: BLE001 - cache is best-effort
        logger.warning("TURN cache read failed", exc_info=True)

    try:
        servers = _fetch_from_cloudflare()
    except (urllib.error.URLError, ValueError, json.JSONDecodeError, TimeoutError):
        logger.exception("Could not generate Cloudflare TURN credentials; using STUN only")
        return _fallback()

    # Refresh well before the credentials expire so a call never starts with stale ones.
    cache_seconds = max(60, settings.CLOUDFLARE_TURN_TTL_SECONDS - 3600)
    try:
        client.set(CACHE_KEY, json.dumps(servers), ex=cache_seconds)
    except Exception:  # noqa: BLE001
        logger.warning("TURN cache write failed", exc_info=True)
    return servers
