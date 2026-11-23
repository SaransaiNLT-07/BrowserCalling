from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from apps.calls.models import Call
from apps.calls.services import CallService
from apps.presence.models import Presence


def auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {RefreshToken.for_user(user).access_token}"}


@pytest.mark.django_db
def test_call_accept_and_end(api, make_user):
    caller = make_user()
    callee = make_user(email="jordan@Saran.dev", username="jordan", display_name="Jordan Hale")
    created = api.post(
        "/api/calls/",
        {"callee_id": str(callee.id), "call_type": "video"},
        format="json",
        **auth(caller),
    )
    assert created.status_code == 201
    call_id = created.data["id"]
    assert created.data["state"] == "ringing"
    assert created.data["caller"]["username"] == "avery"

    accepted = api.post(f"/api/calls/{call_id}/accept/", **auth(callee))
    assert accepted.status_code == 200
    assert accepted.data["state"] == "accepted"
    assert accepted.data["accepted_at"]

    ended = api.post(f"/api/calls/{call_id}/end/", **auth(caller))
    assert ended.status_code == 200
    assert ended.data["state"] == "ended"
    assert ended.data["end_reason"] == "hung_up"
    assert ended.data["ended_by"] == str(caller.id)


@pytest.mark.django_db
def test_reject_cancel_and_illegal_transition(api, make_user):
    caller = make_user()
    callee = make_user(email="jordan@Saran.dev", username="jordan", display_name="Jordan Hale")
    created = api.post(
        "/api/calls/",
        {"callee_id": str(callee.id), "call_type": "audio"},
        format="json",
        **auth(caller),
    )
    call_id = created.data["id"]

    forbidden = api.post(f"/api/calls/{call_id}/accept/", **auth(caller))
    assert forbidden.status_code == 403
    assert forbidden.data["code"] == "forbidden"

    rejected = api.post(f"/api/calls/{call_id}/reject/", **auth(callee))
    assert rejected.status_code == 200
    assert rejected.data["state"] == "rejected"

    again = api.post(f"/api/calls/{call_id}/accept/", **auth(callee))
    assert again.status_code == 409
    assert again.data["code"] == "invalid_state"


@pytest.mark.django_db
def test_cannot_call_self_or_a_busy_person(api, make_user):
    caller = make_user()
    callee = make_user(email="jordan@Saran.dev", username="jordan", display_name="Jordan Hale")
    other = make_user(email="mina@Saran.dev", username="mina", display_name="Mina Ortiz")

    self_call = api.post(
        "/api/calls/",
        {"callee_id": str(caller.id), "call_type": "audio"},
        format="json",
        **auth(caller),
    )
    assert self_call.status_code == 400
    assert self_call.data["code"] == "self_call"

    first = api.post(
        "/api/calls/",
        {"callee_id": str(callee.id), "call_type": "audio"},
        format="json",
        **auth(caller),
    )
    assert first.status_code == 201
    second = api.post(
        "/api/calls/",
        {"callee_id": str(callee.id), "call_type": "video"},
        format="json",
        **auth(other),
    )
    assert second.status_code == 409
    assert second.data["code"] == "user_busy"


@pytest.mark.django_db
def test_non_participant_cannot_read_a_call(api, make_user):
    caller = make_user()
    callee = make_user(email="jordan@Saran.dev", username="jordan", display_name="Jordan Hale")
    stranger = make_user(email="mina@Saran.dev", username="mina", display_name="Mina Ortiz")
    created = api.post(
        "/api/calls/",
        {"callee_id": str(callee.id), "call_type": "audio"},
        format="json",
        **auth(caller),
    )
    hidden = api.get(f"/api/calls/{created.data['id']}/", **auth(stranger))
    assert hidden.status_code == 404


@pytest.mark.django_db
def test_ring_timeout_marks_call_missed(make_user):
    caller = make_user()
    callee = make_user(email="jordan@Saran.dev", username="jordan", display_name="Jordan Hale")
    call = CallService.initiate(caller, callee.id, Call.Type.AUDIO)
    Call.objects.filter(id=call.id).update(created_at=timezone.now() - timedelta(seconds=90))
    changed = CallService.expire_stale_calls()
    assert len(changed) == 1
    assert changed[0].state == Call.State.MISSED
    assert changed[0].end_reason == "ring_timeout"


@pytest.mark.django_db
def test_accepted_call_fails_when_a_peer_stays_offline(make_user):
    caller = make_user()
    callee = make_user(email="jordan@Saran.dev", username="jordan", display_name="Jordan Hale")
    call = CallService.initiate(caller, callee.id, Call.Type.VIDEO)
    CallService.accept(call.id, callee)
    stale = timezone.now() - timedelta(minutes=5)
    Presence.objects.filter(user=caller).update(status=Presence.Status.OFFLINE, last_seen_at=stale)
    changed = CallService.expire_stale_calls()
    assert changed[0].state == Call.State.FAILED
    assert changed[0].end_reason == "connection_lost"


@pytest.mark.django_db
def test_caller_cancel(api, make_user):
    caller = make_user()
    callee = make_user(email="jordan@Saran.dev", username="jordan", display_name="Jordan Hale")
    created = api.post(
        "/api/calls/",
        {"callee_id": str(callee.id), "call_type": "audio"},
        format="json",
        **auth(caller),
    )
    cancelled = api.post(f"/api/calls/{created.data['id']}/cancel/", **auth(caller))
    assert cancelled.status_code == 200
    assert cancelled.data["state"] == "cancelled"
