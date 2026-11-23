from django.contrib import admin

from apps.presence.models import Presence


@admin.register(Presence)
class PresenceAdmin(admin.ModelAdmin):
    list_display = ("user", "status", "last_seen_at", "updated_at")
    list_filter = ("status",)
    search_fields = ("user__email", "user__username", "user__display_name")
