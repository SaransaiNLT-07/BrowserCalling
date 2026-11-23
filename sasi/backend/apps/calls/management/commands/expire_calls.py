from django.core.management.base import BaseCommand

from apps.calls.notifications import notify_calls_sync
from apps.calls.services import CallService


class Command(BaseCommand):
    help = "Mark timed-out ringing calls as missed and drop accepted calls whose peers are gone."

    def handle(self, *args, **options):
        changed = CallService.expire_stale_calls()
        notify_calls_sync(changed)
        self.stdout.write(f"updated {len(changed)} call(s)")
