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
    change_password_url = '/api/auth/change-password/'
    change_email_url = '/api/auth/change-email/'

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

    def test_change_password_updates_password_for_authenticated_user(self):
        user = self.create_user()
        token = Token.objects.create(user=user)
        self.authenticate_with(token)

        response = self.client.post(
            self.change_password_url,
            {
                'old_password': 'StrongPassword123!',
                'new_password': 'NewStrongPassword456!',
                'new_password_confirm': 'NewStrongPassword456!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.check_password('NewStrongPassword456!'))
        self.assertNotEqual(response.data.get('detail'), 'Old password is incorrect.')

    def test_change_password_rejects_wrong_old_password(self):
        user = self.create_user()
        token = Token.objects.create(user=user)
        self.authenticate_with(token)

        response = self.client.post(
            self.change_password_url,
            {
                'old_password': 'WrongPassword123!',
                'new_password': 'NewStrongPassword456!',
                'new_password_confirm': 'NewStrongPassword456!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('old_password', response.data)

    def test_change_password_requires_authenticated_user(self):
        response = self.client.post(
            self.change_password_url,
            {
                'old_password': 'StrongPassword123!',
                'new_password': 'NewStrongPassword456!',
                'new_password_confirm': 'NewStrongPassword456!',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_change_email_updates_email_for_authenticated_user(self):
        user = self.create_user()
        token = Token.objects.create(user=user)
        self.authenticate_with(token)

        response = self.client.post(
            self.change_email_url,
            {
                'email': 'new-email@example.com',
                'email_confirm': 'new-email@example.com',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertEqual(user.email, 'new-email@example.com')

    def test_change_email_rejects_duplicate_email(self):
        current_user = self.create_user()
        other_user = User.objects.create_user(username='zoe', email='zoe@example.com', password='StrongPassword123!')
        token = Token.objects.create(user=current_user)
        self.authenticate_with(token)

        response = self.client.post(
            self.change_email_url,
            {
                'email': other_user.email,
                'email_confirm': other_user.email,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)


class SeedDemoUsersCommandTests(TestCase):
    @override_settings(DEBUG=True)
    def test_command_creates_three_users_and_is_idempotent(self):
        call_command('seed_demo_users', password='Realtime-Test-2026!')
        call_command('seed_demo_users', password='Realtime-Test-2026!')

        usernames = ('alice_rt', 'bob_rt', 'charlie_rt')
        self.assertEqual(User.objects.filter(username__in=usernames).count(), 3)
        for username in usernames:
            user = User.objects.get(username=username)
            self.assertTrue(user.check_password('Realtime-Test-2026!'))
            self.assertTrue(user.is_active)

    @override_settings(DEBUG=False)
    def test_command_refuses_to_run_when_debug_is_disabled(self):
        with self.assertRaises(CommandError):
            call_command('seed_demo_users', password='Realtime-Test-2026!')
