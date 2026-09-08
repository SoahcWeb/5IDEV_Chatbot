from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import Conversation, ConversationMember


User = get_user_model()


class ConversationAPITests(APITestCase):
    list_url = '/api/conversations/'
    private_url = '/api/conversations/private/'
    group_url = '/api/conversations/group/'

    @classmethod
    def setUpTestData(cls):
        cls.alice = User.objects.create_user('alice', password='TestPassword123!')
        cls.bob = User.objects.create_user('bob', password='TestPassword123!')
        cls.charlie = User.objects.create_user('charlie', password='TestPassword123!')
        cls.diana = User.objects.create_user('diana', password='TestPassword123!')

    def authenticate(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def create_private(self, creator=None, other=None):
        creator = creator or self.alice
        other = other or self.bob
        conversation = Conversation.objects.create(
            type=Conversation.Type.PRIVATE,
            created_by=creator,
        )
        ConversationMember.objects.bulk_create([
            ConversationMember(conversation=conversation, user=creator),
            ConversationMember(conversation=conversation, user=other),
        ])
        return conversation

    def create_group(self):
        conversation = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            name='Team',
            created_by=self.alice,
        )
        ConversationMember.objects.create(
            conversation=conversation,
            user=self.alice,
            role=ConversationMember.Role.ADMIN,
        )
        ConversationMember.objects.create(
            conversation=conversation,
            user=self.bob,
            role=ConversationMember.Role.MEMBER,
        )
        return conversation

    def test_user_can_create_private_conversation(self):
        self.authenticate(self.alice)
        response = self.client.post(self.private_url, {'user_id': self.bob.id})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        conversation = Conversation.objects.get()
        self.assertEqual(conversation.created_by, self.alice)
        self.assertEqual(
            set(conversation.memberships.values_list('user_id', flat=True)),
            {self.alice.id, self.bob.id},
        )

    def test_private_conversation_with_self_is_rejected(self):
        self.authenticate(self.alice)
        response = self.client.post(self.private_url, {'user_id': self.alice.id})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_private_pair_is_reused_without_duplicate(self):
        self.authenticate(self.alice)
        first = self.client.post(self.private_url, {'user_id': self.bob.id})
        second = self.client.post(self.private_url, {'user_id': self.bob.id})

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(Conversation.objects.count(), 1)

    def test_list_only_returns_users_conversations(self):
        own = self.create_private()
        self.create_private(creator=self.charlie, other=self.diana)
        self.authenticate(self.alice)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item['id'] for item in response.data], [own.id])

    def test_outsider_cannot_view_conversation(self):
        conversation = self.create_private()
        self.authenticate(self.charlie)

        response = self.client.get(f'{self.list_url}{conversation.id}/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_group_creation_assigns_roles(self):
        self.authenticate(self.alice)
        response = self.client.post(
            self.group_url,
            {'name': 'Project', 'member_ids': [self.bob.id, self.charlie.id]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        conversation = Conversation.objects.get()
        roles = dict(conversation.memberships.values_list('user_id', 'role'))
        self.assertEqual(roles[self.alice.id], ConversationMember.Role.ADMIN)
        self.assertEqual(roles[self.bob.id], ConversationMember.Role.MEMBER)
        self.assertEqual(roles[self.charlie.id], ConversationMember.Role.MEMBER)

    def test_admin_can_add_member(self):
        conversation = self.create_group()
        self.authenticate(self.alice)

        response = self.client.post(
            f'{self.list_url}{conversation.id}/members/',
            {'user_id': self.charlie.id},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            conversation.memberships.filter(user=self.charlie).exists()
        )

    def test_non_admin_cannot_add_member(self):
        conversation = self.create_group()
        self.authenticate(self.bob)

        response = self.client.post(
            f'{self.list_url}{conversation.id}/members/',
            {'user_id': self.charlie.id},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_remove_member(self):
        conversation = self.create_group()
        self.authenticate(self.alice)

        response = self.client.delete(
            f'{self.list_url}{conversation.id}/members/{self.bob.id}/'
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(conversation.memberships.filter(user=self.bob).exists())

    def test_non_admin_cannot_remove_member(self):
        conversation = self.create_group()
        self.authenticate(self.bob)

        response = self.client.delete(
            f'{self.list_url}{conversation.id}/members/{self.alice.id}/'
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_member_cannot_be_added_twice(self):
        conversation = self.create_group()
        self.authenticate(self.alice)

        response = self.client.post(
            f'{self.list_url}{conversation.id}/members/',
            {'user_id': self.bob.id},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_group_without_name_is_rejected(self):
        self.authenticate(self.alice)
        response = self.client.post(
            self.group_url,
            {'name': '  ', 'member_ids': [self.bob.id]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_user_is_rejected_for_private_conversation(self):
        self.authenticate(self.alice)
        response = self.client.post(self.private_url, {'user_id': 999999})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_user_is_rejected_for_group(self):
        self.authenticate(self.alice)
        response = self.client.post(
            self.group_url,
            {'name': 'Project', 'member_ids': [999999]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_group_member_ids_are_rejected(self):
        self.authenticate(self.alice)
        response = self.client.post(
            self.group_url,
            {'name': 'Project', 'member_ids': [self.bob.id, self.bob.id]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_last_admin_cannot_be_removed(self):
        conversation = self.create_group()
        self.authenticate(self.alice)

        response = self.client.delete(
            f'{self.list_url}{conversation.id}/members/{self.alice.id}/'
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(conversation.memberships.filter(user=self.alice).exists())

    def test_all_routes_require_authentication(self):
        conversation = self.create_group()
        requests = (
            self.client.get(self.list_url),
            self.client.get(f'{self.list_url}{conversation.id}/'),
            self.client.post(self.private_url, {'user_id': self.bob.id}),
            self.client.post(self.group_url, {'name': 'Project'}, format='json'),
            self.client.post(
                f'{self.list_url}{conversation.id}/members/',
                {'user_id': self.charlie.id},
            ),
            self.client.delete(
                f'{self.list_url}{conversation.id}/members/{self.bob.id}/'
            ),
        )

        self.assertTrue(
            all(response.status_code == status.HTTP_401_UNAUTHORIZED for response in requests)
        )
