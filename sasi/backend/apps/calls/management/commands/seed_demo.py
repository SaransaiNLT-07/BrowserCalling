import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import User

DEMO_USERS = (
    {"email": "avery@Saran.dev", "username": "avery", "display_name": "Avery Chen"},
    {"email": "jordan@Saran.dev", "username": "jordan", "display_name": "Jordan Hale"},
    {"email": "mina@Saran.dev", "username": "mina", "display_name": "Mina Ortiz"},
)


class Command(BaseCommand):
    help = "Create local demo accounts. Refuses to run when DEBUG is off."

    def add_arguments(self, parser):
        parser.add_argument("--password", default="")
        parser.add_argument("--reset-password", action="store_true")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo only runs when DJANGO_DEBUG is true.")
        password = options["password"] or os.environ.get("DEMO_SEED_PASSWORD", "")
        if len(password) < 10:
            raise CommandError("Pass --password or set DEMO_SEED_PASSWORD to at least 10 characters.")
        for spec in DEMO_USERS:
            user, created = User.objects.get_or_create(
                email=spec["email"],
                defaults={"username": spec["username"], "display_name": spec["display_name"]},
            )
            if created or options["reset_password"]:
                user.username = spec["username"]
                user.display_name = spec["display_name"]
                user.set_password(password)
                user.save()
            self.stdout.write(f"{'created' if created else 'exists'} {user.email}")
