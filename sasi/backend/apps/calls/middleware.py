from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken


def _header(scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key.lower() == name:
            return value.decode("latin1")
    return None


# class OriginGuard:
#     """Browsers must send an allowed Origin. Native clients omit it and rely on the JWT."""

#     def __init__(self, inner):
#         self.inner = inner

#     async def __call__(self, scope, receive, send):
#         if scope["type"] != "websocket":
#             return await self.inner(scope, receive, send)
#         origin = _header(scope, b"origin")
#         if origin is None or origin in settings.CORS_ALLOWED_ORIGINS:
#             return await self.inner(scope, receive, send)
#         await send({"type": "websocket.close", "code": 4403})

class OriginGuard:
    """Validate browser WebSocket origins while allowing native clients."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        if scope["type"] != "websocket":
            return await self.inner(scope, receive, send)

        origin = _header(scope, b"origin")

        # Native clients may omit Origin.
        if origin is None:
            return await self.inner(scope, receive, send)

        # Allow all origins when configured.
        if getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False):
            return await self.inner(scope, receive, send)

        # Otherwise validate against configured origins.
        if origin in getattr(settings, "CORS_ALLOWED_ORIGINS", []):
            return await self.inner(scope, receive, send)

        await send({
            "type": "websocket.close",
            "code": 4403,
        })


class JwtAuthMiddleware:
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        scope = dict(scope)
        scope["user"] = await self._user_from_scope(scope)
        return await self.inner(scope, receive, send)

    async def _user_from_scope(self, scope):
        token = self._extract_token(scope)
        if not token:
            return AnonymousUser()
        try:
            return await self._get_user(token)
        except (TokenError, get_user_model().DoesNotExist, KeyError, ValueError):
            return AnonymousUser()

    @staticmethod
    def _extract_token(scope) -> str | None:
        header = _header(scope, b"authorization")
        if header and header.lower().startswith("bearer "):
            return header.split(" ", 1)[1].strip()
        query = parse_qs(scope.get("query_string", b"").decode())
        values = query.get("token") or []
        return values[0] if values else None

    @database_sync_to_async
    def _get_user(self, raw_token: str):
        token = AccessToken(raw_token)
        user_id = token.get("user_id")
        return get_user_model().objects.get(id=user_id, is_active=True)
