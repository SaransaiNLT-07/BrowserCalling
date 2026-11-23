import redis
from django.conf import settings

_client: redis.Redis | None = None


def redis_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _client


def reset_redis_client() -> None:
    global _client
    if _client is not None:
        _client.close()
    _client = None
