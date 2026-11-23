from django.db import models

from apps.accounts.models import User


class Presence(models.Model):
    class Status(models.TextChoices):
        ONLINE = "online", "Online"
        OFFLINE = "offline", "Offline"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="presence")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OFFLINE)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.user.email} ({self.status})"
