import asyncio
import logging
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

django_asgi_app = get_asgi_application()

from apps.calls.middleware import JwtAuthMiddleware, OriginGuard  # noqa: E402
from apps.calls.notifications import notify_calls  # noqa: E402
from apps.calls.routing import websocket_urlpatterns  # noqa: E402
from apps.calls.services import CallService  # noqa: E402
from apps.presence.services import PresenceService  # noqa: E402
from asgiref.sync import sync_to_async  # noqa: E402

logger = logging.getLogger(__name__)


class Application:
    """ASGI entrypoint that also expires abandoned calls while the process lives."""

    def __init__(self, app):
        self.app = app
        self._task: asyncio.Task | None = None

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan":
            await self._lifespan(receive, send)
            return
        await self.app(scope, receive, send)

    async def _lifespan(self, receive, send):
        while True:
            message = await receive()
            if message["type"] == "lifespan.startup":
                self._task = asyncio.create_task(self._expire_loop())
                await send({"type": "lifespan.startup.complete"})
            elif message["type"] == "lifespan.shutdown":
                if self._task is not None:
                    self._task.cancel()
                await send({"type": "lifespan.shutdown.complete"})
                return

    async def _expire_loop(self):
        while True:
            try:
                calls = await sync_to_async(CallService.expire_stale_calls)()
                offline = await sync_to_async(PresenceService.reconcile_offline)()
                if calls:
                    await notify_calls(calls)
                for snapshot in offline:
                    await PresenceService.broadcast(snapshot)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Call expiry loop failed")
            await asyncio.sleep(5)


application = Application(
    ProtocolTypeRouter(
        {
            "http": django_asgi_app,
            "websocket": OriginGuard(JwtAuthMiddleware(URLRouter(websocket_urlpatterns))),
        }
    )
)
