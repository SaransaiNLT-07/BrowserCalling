import logging
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.utils import timezone
from redis.exceptions import WatchError

from apps.calls.groups import PRESENCE_GROUP
from apps.presence.models import Presence
from common.redis import redis_client

logger = logging.getLogger(__name__)


class PresenceSnapshot:
    def __init__(self, user_id, status: str, last_seen_at):
        self.user_id = user_id
        self.status = status
        self.last_seen_at = last_seen_at

    def event(self) -> dict:
        return {
            "type": "presence.update",
            "user_id": str(self.user_id),
            "status": self.status,
            "last_seen_at": self.last_seen_at.isoformat() if self.last_seen_at else None,
        }


class PresenceService:
    @staticmethod
    def _key(user_id) -> str:
        return f"{settings.PRESENCE_KEY_PREFIX}:{user_id}"

    @staticmethod
    def _reconcile_lock_key() -> str:
        return f"{settings.PRESENCE_KEY_PREFIX}:reconcile"

    @classmethod
    def mark_connected(cls, user_id) -> PresenceSnapshot | None:
        client = redis_client()
        key = cls._key(user_id)
        count = client.incr(key)
        client.expire(key, settings.PRESENCE_TTL_SECONDS)
        if count != 1:
            return None
        now = timezone.now()
        presence, _ = Presence.objects.update_or_create(
            user_id=user_id,
            defaults={"status": Presence.Status.ONLINE, "last_seen_at": now},
        )
        logger.info("presence online user=%s", user_id)
        return PresenceSnapshot(user_id, presence.status, presence.last_seen_at)

    @classmethod
    def mark_disconnected(cls, user_id) -> PresenceSnapshot | None:
        client = redis_client()
        key = cls._key(user_id)
        became_offline = False
        with client.pipeline() as pipe:
            while True:
                try:
                    pipe.watch(key)
                    current = int(client.get(key) or 0)
                    pipe.multi()
                    if current <= 1:
                        pipe.delete(key)
                        became_offline = True
                    else:
                        pipe.set(key, current - 1, ex=settings.PRESENCE_TTL_SECONDS)
                        became_offline = False
                    pipe.execute()
                    break
                except WatchError:
                    continue
        if not became_offline:
            return None
        now = timezone.now()
        presence, _ = Presence.objects.update_or_create(
            user_id=user_id,
            defaults={"status": Presence.Status.OFFLINE, "last_seen_at": now},
        )
        logger.info("presence offline user=%s", user_id)
        return PresenceSnapshot(user_id, presence.status, presence.last_seen_at)

    @classmethod
    def touch(cls, user_id) -> None:
        client = redis_client()
        key = cls._key(user_id)
        if client.exists(key):
            client.expire(key, settings.PRESENCE_TTL_SECONDS)

    @classmethod
    def reconcile_offline(cls) -> list[PresenceSnapshot]:
        client = redis_client()
        if not client.set(cls._reconcile_lock_key(), "1", nx=True, ex=10):
            return []
        changed: list[PresenceSnapshot] = []
        now = timezone.now()
        online = Presence.objects.filter(status=Presence.Status.ONLINE).only("user_id", "status", "last_seen_at")
        for presence in online:
            if client.exists(cls._key(presence.user_id)):
                continue
            presence.status = Presence.Status.OFFLINE
            presence.last_seen_at = now
            presence.save(update_fields=["status", "last_seen_at", "updated_at"])
            if client.exists(cls._key(presence.user_id)):
                presence.status = Presence.Status.ONLINE
                presence.last_seen_at = now
                presence.save(update_fields=["status", "last_seen_at", "updated_at"])
                continue
            changed.append(PresenceSnapshot(presence.user_id, presence.status, presence.last_seen_at))
            logger.info("presence reconciled offline user=%s", presence.user_id)
        return changed

    @classmethod
    def is_offline_past_grace(cls, user_id) -> bool:
        grace = timezone.now() - timedelta(seconds=settings.CALL_OFFLINE_GRACE_SECONDS)
        presence = Presence.objects.filter(user_id=user_id).first()
        if presence is None:
            return False
        return (
            presence.status == Presence.Status.OFFLINE
            and presence.last_seen_at is not None
            and presence.last_seen_at < grace
        )

    @staticmethod
    def broadcast_sync(snapshot: PresenceSnapshot) -> None:
        layer = get_channel_layer()
        if layer is None:
            return
        async_to_sync(layer.group_send)(
            PRESENCE_GROUP,
            {"type": "signaling.event", "event": snapshot.event()},
        )

    @staticmethod
    async def broadcast(snapshot: PresenceSnapshot) -> None:
        layer = get_channel_layer()
        if layer is None:
            return
        await layer.group_send(PRESENCE_GROUP, {"type": "signaling.event", "event": snapshot.event()})
