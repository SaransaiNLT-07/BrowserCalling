import os

os.environ["DJANGO_SECRET_KEY"] = "test-only-secret-key-with-enough-length"
os.environ.setdefault("DJANGO_DEBUG", "false")
os.environ.setdefault("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost,testserver")
os.environ.setdefault("POSTGRES_DB", "webrtc2")
os.environ.setdefault("POSTGRES_USER", "saran")
os.environ.setdefault("POSTGRES_PASSWORD", "S@r@ns@i07")
os.environ.setdefault("POSTGRES_HOST", "127.0.0.1")
os.environ.setdefault("POSTGRES_PORT", "5432")
os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/0")
os.environ.setdefault("CORS_ALLOWED_ORIGINS", "http://127.0.0.1:8000,http://localhost:8081")
os.environ["PRESENCE_KEY_PREFIX"] = "Saran:test:presence"

from .base import *  # noqa: E402,F401,F403

DEBUG = False
DATABASES["default"]["CONN_MAX_AGE"] = 0
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {
        **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
        "auth": "1000/minute",
    },
}
