from unittest import mock

import pytest
from rest_framework_simplejwt.tokens import RefreshToken

from apps.calls import turn


def auth(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {RefreshToken.for_user(user).access_token}"}


@pytest.mark.django_db
def test_ice_servers_requires_auth(api):
    assert api.get("/api/calls/ice-servers/").status_code == 401


@pytest.mark.django_db
def test_ice_servers_falls_back_to_stun_without_cloudflare(api, make_user):
    response = api.get("/api/calls/ice-servers/", **auth(make_user()))
    assert response.status_code == 200
    assert response.data["ice_servers"] == [{"urls": "stun:stun.cloudflare.com:3478"}]


@pytest.mark.django_db
def test_ice_servers_uses_cloudflare_and_caches(api, make_user, settings):
    settings.CLOUDFLARE_TURN_KEY_ID = "key"
    settings.CLOUDFLARE_TURN_API_TOKEN = "token"
    generated = [
        {
            "urls": ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp"],
            "username": "u",
            "credential": "c",
        }
    ]
    store = {}
    fake_redis = mock.Mock(get=lambda k: store.get(k), set=lambda k, v, ex: store.__setitem__(k, v))
    with (
        mock.patch.object(turn, "redis_client", return_value=fake_redis),
        mock.patch.object(turn, "_fetch_from_cloudflare", wraps=lambda: [dict(s) for s in generated]) as fetch,
    ):
        user = make_user()
        first = api.get("/api/calls/ice-servers/", **auth(user))
        second = api.get("/api/calls/ice-servers/", **auth(user))
    assert first.status_code == 200
    assert first.data["ice_servers"][0]["username"] == "u"
    assert second.data == first.data
    assert fetch.call_count == 1
