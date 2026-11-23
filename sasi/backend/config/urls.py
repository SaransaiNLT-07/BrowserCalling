import logging

from django.contrib import admin
from django.db import connection
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.accounts.views import DirectoryView, PublicUserDetailView
from common.redis import redis_client

logger = logging.getLogger(__name__)


def health(_request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        if not redis_client().ping():
            raise RuntimeError("Redis did not respond.")
    except Exception:
        logger.exception("health check failed")
        return JsonResponse({"status": "error"}, status=503)
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/users/", DirectoryView.as_view(), name="user-list"),
    path("api/users/<uuid:user_id>/", PublicUserDetailView.as_view(), name="user-detail"),
    path("api/calls/", include("apps.calls.urls")),
]

admin.site.site_header = "Saran"
admin.site.site_title = "Saran"
