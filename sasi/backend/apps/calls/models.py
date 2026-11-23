import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.accounts.models import User


class Call(models.Model):
    class Type(models.TextChoices):
        AUDIO = "audio", "Audio"
        VIDEO = "video", "Video"

    class State(models.TextChoices):
        RINGING = "ringing", "Ringing"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"
        MISSED = "missed", "Missed"
        ENDED = "ended", "Ended"
        FAILED = "failed", "Failed"

    ACTIVE_STATES = (State.RINGING, State.ACCEPTED)
    TERMINAL_STATES = (State.REJECTED, State.CANCELLED, State.MISSED, State.ENDED, State.FAILED)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    caller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="outgoing_calls")
    callee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="incoming_calls")
    call_type = models.CharField(max_length=16, choices=Type.choices)
    state = models.CharField(max_length=16, choices=State.choices, default=State.RINGING, db_index=True)
    end_reason = models.CharField(max_length=64, blank=True)
    ended_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="calls_ended",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["caller", "state"]),
            models.Index(fields=["callee", "state"]),
            models.Index(fields=["state", "created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=~Q(caller=F("callee")),
                name="call_caller_is_not_callee",
            )
        ]

    def __str__(self) -> str:
        return f"{self.call_type} {self.state} {self.id}"


class CallEvent(models.Model):
    class Type(models.TextChoices):
        CREATED = "created", "Created"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"
        MISSED = "missed", "Missed"
        ENDED = "ended", "Ended"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    call = models.ForeignKey(Call, on_delete=models.CASCADE, related_name="events")
    actor = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="call_events")
    event_type = models.CharField(max_length=32, choices=Type.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
