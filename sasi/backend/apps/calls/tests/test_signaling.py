import pytest
from channels.db import database_sync_to_async
from channels.testing.websocket import WebsocketCommunicator
from rest_framework_simplejwt.tokens import RefreshToken

from apps.calls.models import CallEvent
from apps.calls.notifications import notify_call_state
from apps.calls.services import CallService
from apps.presence.models import Presence
from config.asgi import application


def token_for(user) -> str:
    return str(RefreshToken.for_user(user).access_token)


async def connect(user):
    token = await database_sync_to_async(token_for)(user)
    communicator = WebsocketCommunicator(application, f"/ws/signaling/?token={token}")
    connected, _ = await communicator.connect()
    assert connected
    return communicator


async def next_of_type(communicator, expected: str):
    for _ in range(8):
        message = await communicator.receive_json_from(timeout=2)
        if message["type"] == expected:
            return message
    raise AssertionError(f"did not receive {expected}")


@pytest.mark.django_db(transaction=True)
async def test_anonymous_socket_is_rejected():
    communicator = WebsocketCommunicator(application, "/ws/signaling/")
    connected, _ = await communicator.connect()
    assert connected is False


@pytest.mark.django_db(transaction=True)
async def test_presence_tracks_connections(make_user):
    user = await database_sync_to_async(make_user)()
    first = await connect(user)
    second = await connect(user)
    presence = await database_sync_to_async(lambda: Presence.objects.get(user=user))()
    assert presence.status == Presence.Status.ONLINE

    await second.disconnect()
    presence = await database_sync_to_async(lambda: Presence.objects.get(user=user))()
    assert presence.status == Presence.Status.ONLINE

    await first.disconnect()
    presence = await database_sync_to_async(lambda: Presence.objects.get(user=user))()
    assert presence.status == Presence.Status.OFFLINE


@pytest.mark.django_db(transaction=True)
async def test_offer_is_relayed_after_accept_and_rejected_before(make_user):
    caller = await database_sync_to_async(make_user)()
    callee = await database_sync_to_async(make_user)(
        email="jordan@Saran.dev",
        username="jordan",
        display_name="Jordan Hale",
    )
    stranger = await database_sync_to_async(make_user)(
        email="mina@Saran.dev",
        username="mina",
        display_name="Mina Ortiz",
    )
    caller_ws = await connect(caller)
    callee_ws = await connect(callee)
    stranger_ws = await connect(stranger)

    call = await database_sync_to_async(CallService.initiate)(caller, callee.id, "video")
    await notify_call_state(call)
    ringing = await next_of_type(callee_ws, "call.state")
    assert ringing["call"]["state"] == "ringing"

    offer = {"type": "offer", "sdp": "v=0"}
    await caller_ws.send_json_to({"action": "call.offer", "call_id": str(call.id), "sdp": offer})
    too_early = await next_of_type(caller_ws, "error")
    assert too_early["code"] == "invalid_state"

    await callee_ws.send_json_to({"action": "call.accept", "call_id": str(call.id)})
    accepted = await next_of_type(caller_ws, "call.state")
    assert accepted["call"]["state"] == "accepted"
    await next_of_type(callee_ws, "call.state")

    await caller_ws.send_json_to({"action": "call.offer", "call_id": str(call.id), "sdp": offer})
    relayed = await next_of_type(callee_ws, "call.offer")
    assert relayed["sdp"] == offer
    assert relayed["from_user_id"] == str(caller.id)

    await stranger_ws.send_json_to({"action": "call.ice", "call_id": str(call.id), "candidate": {"candidate": "c", "sdpMid": "0", "sdpMLineIndex": 0}})
    denied = await next_of_type(stranger_ws, "error")
    assert denied["code"] == "forbidden"

    events = await database_sync_to_async(lambda: list(CallEvent.objects.filter(call_id=call.id).values_list("event_type", flat=True)))()
    assert "created" in events
    assert "accepted" in events

    await caller_ws.disconnect()
    await callee_ws.disconnect()
    await stranger_ws.disconnect()
