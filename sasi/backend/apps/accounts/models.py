import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models

from apps.accounts.managers import UserManager


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=30, unique=True)
    display_name = models.CharField(max_length=80)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username", "display_name"]

    def __str__(self) -> str:
        return self.email
