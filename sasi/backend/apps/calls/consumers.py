import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from apps.calls.exceptions import CallServiceError
from apps.calls.groups import PRESENCE_GROUP, user_group
from apps.calls.models import Call
from apps.calls.notifications import notify_call_state, notify_calls
from apps.calls.payloads import parse_candidate, parse_fail_reason, parse_sdp, parse_uuid
from apps.calls.services import CallService
from apps.presence.services import PresenceService

logger = logging.getLogger(__name__)


class SignalingConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.user = user
        self.user_group = user_group(user.id)
        await self.accept()
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        await self.channel_layer.group_add(PRESENCE_GROUP, self.channel_name)
        snapshot = await database_sync_to_async(PresenceService.mark_connected)(user.id)
        if snapshot is not None:
            await PresenceService.broadcast(snapshot)
        changed = await database_sync_to_async(CallService.expire_stale_calls)()
        if changed:
            await notify_calls(changed)
        logger.info("signaling connected user=%s", user.id)

    async def disconnect(self, code):
        user = getattr(self, "user", None)
        if user is None:
            return
        await self.channel_layer.group_discard(self.user_group, self.channel_name)
        await self.channel_layer.group_discard(PRESENCE_GROUP, self.channel_name)
        snapshot = await database_sync_to_async(PresenceService.mark_disconnected)(user.id)
        if snapshot is not None:
            await PresenceService.broadcast(snapshot)
        logger.info("signaling disconnected user=%s code=%s", user.id, code)

    async def receive_json(self, content, **kwargs):
        if not isinstance(content, dict):
            await self._error("invalid_payload", "Messages must be JSON objects.")
            return
        action = content.get("action")
        if action == "ping":
            await database_sync_to_async(PresenceService.touch)(self.user.id)
            await self.send_json({"type": "pong"})
            return
        handlers = {
            "call.accept": self._accept,
            "call.reject": self._reject,
            "call.cancel": self._cancel,
            "call.end": self._end,
            "call.fail": self._fail,
            "call.offer": self._offer,
            "call.answer": self._answer,
            "call.ice": self._ice,
            "call.negotiate": self._negotiate,
        }
        handler = handlers.get(action)
        if handler is None:
            await self._error("unknown_action", "That signaling action is not recognized.")
            return
        try:
            await handler(content)
        except CallServiceError as exc:
            await self._error(exc.code, exc.detail)
        except Exception:
            logger.exception("signaling action failed user=%s action=%s", self.user.id, action)
            await self._error("server_error", "The signaling server could not handle that message.")

    async def signaling_event(self, event):
        await self.send_json(event["event"])

    async def _accept(self, content):
        call = await database_sync_to_async(CallService.accept)(parse_uuid(content.get("call_id")), self.user)
        await notify_call_state(call)

    async def _reject(self, content):
        call = await database_sync_to_async(CallService.reject)(parse_uuid(content.get("call_id")), self.user)
        await notify_call_state(call)

    async def _cancel(self, content):
        call = await database_sync_to_async(CallService.cancel)(parse_uuid(content.get("call_id")), self.user)
        await notify_call_state(call)

    async def _end(self, content):
        call = await database_sync_to_async(CallService.end)(parse_uuid(content.get("call_id")), self.user)
        await notify_call_state(call)

    async def _fail(self, content):
        call = await database_sync_to_async(CallService.fail)(
            parse_uuid(content.get("call_id")),
            self.user,
            parse_fail_reason(content.get("reason")),
        )
        await notify_call_state(call)

    async def _offer(self, content):
        call = await self._media_call(content, Call.State.ACCEPTED)
        if call.caller_id != self.user.id:
            raise CallServiceError("forbidden", "Only the caller can send an offer.", 403)
        await self._relay(
            call,
            {"type": "call.offer", "call_id": str(call.id), "from_user_id": str(self.user.id), "sdp": parse_sdp(content.get("sdp"), "offer")},
        )

    async def _answer(self, content):
        call = await self._media_call(content, Call.State.ACCEPTED)
        if call.callee_id != self.user.id:
            raise CallServiceError("forbidden", "Only the person being called can send an answer.", 403)
        await self._relay(
            call,
            {
                "type": "call.answer",
                "call_id": str(call.id),
                "from_user_id": str(self.user.id),
                "sdp": parse_sdp(content.get("sdp"), "answer"),
            },
        )

    async def _ice(self, content):
        call = await self._media_call(content, Call.State.ACCEPTED)
        await self._relay(
            call,
            {
                "type": "call.ice",
                "call_id": str(call.id),
                "from_user_id": str(self.user.id),
                "candidate": parse_candidate(content.get("candidate")),
            },
        )

    async def _negotiate(self, content):
        call = await self._media_call(content, Call.State.ACCEPTED)
        await self.channel_layer.group_send(
            user_group(call.caller_id),
            {"type": "signaling.event", "event": {"type": "call.negotiate", "call_id": str(call.id)}},
        )

    async def _media_call(self, content, expected_state: str) -> Call:
        call_id = parse_uuid(content.get("call_id"))
        call = await database_sync_to_async(CallService.get_for_participant)(call_id, self.user)
        if call.state != expected_state:
            raise CallServiceError("invalid_state", "Media signaling is only allowed on an accepted call.", 409)
        return call

    async def _relay(self, call: Call, event: dict) -> None:
        peer = CallService.peer_id(call, self.user.id)
        await self.channel_layer.group_send(user_group(peer), {"type": "signaling.event", "event": event})

    async def _error(self, code: str, detail: str) -> None:
        await self.send_json({"type": "error", "code": code, "detail": detail})

