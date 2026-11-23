from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from apps.calls.groups import user_group
from apps.calls.serializers import CallSerializer


def state_event(call) -> dict:
    return {"type": "call.state", "call": CallSerializer(call).data}


def notify_call_state_sync(call) -> None:
    layer = get_channel_layer()
    if layer is None:
        return
    event = {"type": "signaling.event", "event": state_event(call)}
    for user_id in (call.caller_id, call.callee_id):
        async_to_sync(layer.group_send)(user_group(user_id), event)


def notify_calls_sync(calls) -> None:
    for call in calls:
        notify_call_state_sync(call)


async def notify_call_state(call) -> None:
    layer = get_channel_layer()
    if layer is None:
        return
    event = {"type": "signaling.event", "event": state_event(call)}
    for user_id in (call.caller_id, call.callee_id):
        await layer.group_send(user_group(user_id), event)


async def notify_calls(calls) -> None:
    for call in calls:
        await notify_call_state(call)
