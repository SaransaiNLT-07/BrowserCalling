from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import User


@receiver(post_save, sender=User)
def create_presence(sender, instance, created, **kwargs):
    if not created:
        return
    from apps.presence.models import Presence

    Presence.objects.get_or_create(user=instance)
