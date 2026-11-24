from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import ALLOWED_HOSTS, CORS_ALLOW_ALL_ORIGINS, SECRET_KEY, SPECTACULAR_SETTINGS, env

DEBUG = False

# Fail at startup instead of running with development-grade settings.
if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
    raise ImproperlyConfigured("Set DJANGO_ALLOWED_HOSTS to your real domain(s); '*' is not allowed.")
if CORS_ALLOW_ALL_ORIGINS:
    raise ImproperlyConfigured("CORS_ALLOW_ALL_ORIGINS must be false in production; use CORS_ALLOWED_ORIGINS.")
if len(SECRET_KEY) < 50 or SECRET_KEY.startswith(("django-insecure", "change-me")):
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY to a long random value.")

# Loopback only: lets the container health check reach /api/health/.
ALLOWED_HOSTS = [*ALLOWED_HOSTS, "127.0.0.1", "localhost"]

# TLS is terminated by the reverse proxy (Caddy) which sets X-Forwarded-Proto.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = env.int("DJANGO_HSTS_SECONDS", default=60 * 60 * 24 * 365)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"

# API schema/Swagger UI only for staff in production.
SPECTACULAR_SETTINGS = {
    **SPECTACULAR_SETTINGS,
    "SERVE_PERMISSIONS": ["rest_framework.permissions.IsAdminUser"],
}
