import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


DEMO_USERS = (
    ('alice_rt', 'alice_rt@example.test'),
    ('bob_rt', 'bob_rt@example.test'),
)


class Command(BaseCommand):
    help = 'Create or reset local demo accounts for browser testing.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--password',
            default=os.environ.get('DEMO_USER_PASSWORD'),
            help='Password for both demo accounts (or set DEMO_USER_PASSWORD).',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('Demo users can only be seeded when DEBUG is enabled.')

        password = options['password']
        if not password:
            raise CommandError(
                'Set DEMO_USER_PASSWORD or pass --password to create demo accounts.'
            )

        user_model = get_user_model()
        for username, email in DEMO_USERS:
            user, created = user_model.objects.get_or_create(
                username=username,
                defaults={'email': email},
            )
            user.set_password(password)
            if not user.is_active:
                user.is_active = True
                user.save(update_fields=('password', 'is_active'))
            else:
                user.save(update_fields=('password',))

            action = 'Created' if created else 'Updated'
            self.stdout.write(f'{action} demo account: {username}')