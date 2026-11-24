# Django management command: seed the auth User model with fictional people.
# Save as yourapp/management/commands/seed_people.py, then run:
#   python manage.py seed_people --count 50 --seed 1
import json
import urllib.request

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

API = "https://shaqsiyad.example/api/v1"


class Command(BaseCommand):
    help = "Seed users from the Shaqsiyad API (idempotent: upserts by email)"

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, default=50)
        parser.add_argument("--seed", type=int, default=1)

    def handle(self, *args, count, seed, **options):
        url = f"{API}/fixtures?shape=users&count={count}&seed={seed}"
        with urllib.request.urlopen(url, timeout=30) as res:
            people = json.load(res)

        User = get_user_model()
        for person in people:
            first, _, last = person["fullName"].partition(" ")
            user, created = User.objects.update_or_create(
                email=person["email"],
                defaults={"username": person["email"], "first_name": first[:150], "last_name": last[:150]},
            )
            if created:
                user.set_password("password")
                user.save(update_fields=["password"])
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(people)} users"))
