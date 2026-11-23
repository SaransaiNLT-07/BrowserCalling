import pytest
import redis
from django.conf import settings
from rest_framework.test import APIClient

from apps.accounts.models import User


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def password():
    return "Harbor-Call-19"


@pytest.fixture
def make_user(db, password):
    def _make(**kwargs):
        chosen = kwargs.pop("password", password)
        defaults = {
            "email": "avery@Saran.dev",
            "username": "avery",
            "display_name": "Avery Chen",
        }
        defaults.update(kwargs)
        return User.objects.create_user(password=chosen, **defaults)

    return _make


@pytest.fixture(autouse=True)
def clear_presence_keys():
    client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    prefix = settings.PRESENCE_KEY_PREFIX

    def wipe():
        for key in client.scan_iter(f"{prefix}*"):
            client.delete(key)

    wipe()
    yield
    wipe()
    client.close()
