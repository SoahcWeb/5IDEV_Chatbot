import json
import os
import subprocess
import sys
from pathlib import Path

from django.test import SimpleTestCase


BACKEND_DIR = Path(__file__).resolve().parent.parent


class ProductionSettingsTests(SimpleTestCase):
    def settings_environment(self, overrides=None):
        env = os.environ.copy()
        env.pop('DJANGO_SECURE_SSL_REDIRECT', None)
        env.pop('DJANGO_SECURE_HSTS_SECONDS', None)
        env.update({
            'PYTHON_DOTENV_DISABLED': '1',
            'DJANGO_SETTINGS_MODULE': 'config.settings',
            'DJANGO_ENV': 'development',
            'DJANGO_SECRET_KEY': '',
            'DJANGO_DEBUG': 'True',
            'DATABASE_URL': '',
            'REDIS_URL': '',
        })
        env.update(overrides or {})
        return env

    def run_settings_process(self, overrides=None):
        return subprocess.run(
            [sys.executable, '-c', 'import django; django.setup()'],
            cwd=BACKEND_DIR,
            env=self.settings_environment(overrides),
            capture_output=True,
            text=True,
            check=False,
        )

    def run_settings_probe(self, overrides=None):
        code = (
            'import json; import django; django.setup(); '
            'from django.conf import settings; '
            'print(json.dumps({'
            '"debug": settings.DEBUG, '
            '"database_engine": settings.DATABASES["default"]["ENGINE"], '
            '"channel_backend": settings.CHANNEL_LAYERS["default"]["BACKEND"], '
            '"ssl_redirect": settings.SECURE_SSL_REDIRECT, '
            '"hsts_seconds": settings.SECURE_HSTS_SECONDS'
            '}))'
        )
        result = subprocess.run(
            [sys.executable, '-c', code],
            cwd=BACKEND_DIR,
            env=self.settings_environment(overrides),
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def assert_configuration_error(self, overrides, expected_message):
        result = self.run_settings_process(overrides)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ImproperlyConfigured', result.stderr)
        self.assertIn(expected_message, result.stderr)

    def test_development_uses_local_fallbacks(self):
        settings = self.run_settings_probe()

        self.assertTrue(settings['debug'])
        self.assertEqual(
            settings['database_engine'],
            'django.db.backends.sqlite3',
        )
        self.assertEqual(
            settings['channel_backend'],
            'channels.layers.InMemoryChannelLayer',
        )

    def test_production_requires_secret_key(self):
        self.assert_configuration_error(
            {
                'DJANGO_ENV': 'production',
                'DJANGO_DEBUG': 'False',
                'DATABASE_URL': 'postgresql://user:pass@localhost/app',
                'REDIS_URL': 'redis://localhost:6379/0',
            },
            'DJANGO_SECRET_KEY is required when DJANGO_ENV=production.',
        )

    def test_production_rejects_debug(self):
        self.assert_configuration_error(
            {
                'DJANGO_ENV': 'production',
                'DJANGO_SECRET_KEY': 'test-production-secret',
                'DJANGO_DEBUG': 'True',
                'DATABASE_URL': 'postgresql://user:pass@localhost/app',
                'REDIS_URL': 'redis://localhost:6379/0',
            },
            'DJANGO_DEBUG must be False when DJANGO_ENV=production.',
        )

    def test_production_requires_database_url(self):
        self.assert_configuration_error(
            {
                'DJANGO_ENV': 'production',
                'DJANGO_SECRET_KEY': 'test-production-secret',
                'DJANGO_DEBUG': 'False',
                'REDIS_URL': 'redis://localhost:6379/0',
            },
            'DATABASE_URL is required when DJANGO_ENV=production.',
        )

    def test_production_requires_redis_url(self):
        self.assert_configuration_error(
            {
                'DJANGO_ENV': 'production',
                'DJANGO_SECRET_KEY': 'test-production-secret',
                'DJANGO_DEBUG': 'False',
                'DATABASE_URL': 'postgresql://user:pass@localhost/app',
            },
            'REDIS_URL is required when DJANGO_ENV=production.',
        )

    def test_complete_production_configuration_loads_secure_defaults(self):
        settings = self.run_settings_probe({
            'DJANGO_ENV': 'production',
            'DJANGO_SECRET_KEY': 'test-production-secret',
            'DJANGO_DEBUG': 'False',
            'DATABASE_URL': 'postgresql://user:pass@localhost/app',
            'REDIS_URL': 'redis://localhost:6379/0',
        })

        self.assertFalse(settings['debug'])
        self.assertTrue(settings['ssl_redirect'])
        self.assertEqual(settings['hsts_seconds'], 0)
