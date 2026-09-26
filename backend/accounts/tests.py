from django.contrib.auth import get_user_model
from django.core.management import call_command, CommandError
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase


User = get_user_model()


class AuthenticationAPITests(APITestCase):
    register_url = '/api/auth/register/'
    login_url = '/api/auth/login/'
    logout_url = '/api/auth/logout/'
    me_url = '/api/auth/me/'
    users_url = '/api/auth/users/'

    def registration_data(self, **overrides):
        data = {
            'username': 'john',
            'email': 'john@example.com',
            'password': 'StrongPassword123!',
            'password_confirm': 'StrongPassword123!',
        }
        data.update(overrides)
        return data

    def create_user(self):
        return User.objects.create_user(
            username='john',
            email='john@example.com',
            password='StrongPassword123!',
        )

    def authenticate_with(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_valid_registration_creates_user_and_token(self):
        response = self.client.post(self.register_url, self.registration_data(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', response.data)
        self.assertNotIn('password', response.data['user'])
        user = User.objects.get(username='john')
        self.assertTrue(user.check_password('StrongPassword123!'))
        self.assertTrue(Token.objects.filter(user=user, key=response.data['token']).exists())

    def test_registration_rejects_different_passwords(self):
        response = self.client.post(
            self.register_url,
            self.registration_data(password_confirm='DifferentPassword123!'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password_confirm', response.data)

    def test_registration_rejects_existing_email(self):
        self.create_user()
        response = self.client.post(
            self.register_url,
            self.registration_data(username='another-user'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_valid_login_returns_existing_token(self):
        user = self.create_user()
        token = Token.objects.create(user=user)

        response = self.client.post(
            self.login_url,
            {'username': 'john', 'password': 'StrongPassword123!'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['token'], token.key)
        self.assertEqual(Token.objects.filter(user=user).count(), 1)

    def test_invalid_login_is_rejected(self):
        self.create_user()
        response = self.client.post(
            self.login_url,
            {'username': 'john', 'password': 'wrong-password'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_without_token_is_rejected(self):
        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_with_valid_token_returns_user(self):
        user = self.create_user()
        token = Token.objects.create(user=user)
        self.authenticate_with(token)

        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], user.username)
        self.assertNotIn('password', response.data)

    def test_logout_deletes_token(self):
        user = self.create_user()
        token = Token.objects.create(user=user)
        self.authenticate_with(token)

        response = self.client.post(self.logout_url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Token.objects.filter(key=token.key).exists())

    def test_logged_out_token_cannot_access_me(self):
        user = self.create_user()
        token = Token.objects.create(user=user)
        token_key = token.key
        self.authenticate_with(token)
        self.client.post(self.logout_url)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token_key}')

        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_list_without_token_is_rejected(self):
        response = self.client.get(self.users_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_list_excludes_current_user_and_is_sorted_by_username(self):
        current_user = self.create_user()
        token = Token.objects.create(user=current_user)
        zoe = User.objects.create_user(username='zoe', password='password')
        alice = User.objects.create_user(username='alice', password='password')
        self.authenticate_with(token)

        response = self.client.get(self.users_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            [
                {'id': alice.id, 'username': alice.username},
                {'id': zoe.id, 'username': zoe.username},
            ],
        )
        self.assertNotIn(current_user.id, [user['id'] for user in response.data])
        self.assertEqual(set(response.data[0]), {'id', 'username'})


class SeedDemoUsersCommandTests(TestCase):
    @override_settings(DEBUG=True)
    def test_command_creates_two_users_and_is_idempotent(self):
        call_command('seed_demo_users', password='Realtime-Test-2026!')
        call_command('seed_demo_users', password='Realtime-Test-2026!')

        self.assertEqual(User.objects.filter(username__in=('alice_rt', 'bob_rt')).count(), 2)
        for username in ('alice_rt', 'bob_rt'):
            user = User.objects.get(username=username)
            self.assertTrue(user.check_password('Realtime-Test-2026!'))
            self.assertTrue(user.is_active)

    @override_settings(DEBUG=False)
    def test_command_refuses_to_run_when_debug_is_disabled(self):
        with self.assertRaises(CommandError):
            call_command('seed_demo_users', password='Realtime-Test-2026!')
