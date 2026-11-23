from django.contrib import admin

from apps.calls.models import Call, CallEvent


class CallEventInline(admin.TabularInline):
    model = CallEvent
    extra = 0
    readonly_fields = ("event_type", "actor", "created_at")
    can_delete = False


@admin.register(Call)
class CallAdmin(admin.ModelAdmin):
    list_display = ("id", "call_type", "state", "caller", "callee", "created_at", "ended_at")
    list_filter = ("state", "call_type")
    search_fields = ("id", "caller__email", "callee__email", "caller__username", "callee__username")
    readonly_fields = ("id", "created_at", "accepted_at", "ended_at")
    inlines = [CallEventInline]
