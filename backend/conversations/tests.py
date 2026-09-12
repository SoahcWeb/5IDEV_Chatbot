from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from messaging.models import Message

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


class ConversationUnreadTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user('unread-alice', password='password')
        self.bob = User.objects.create_user('unread-bob', password='password')
        self.charlie = User.objects.create_user('unread-charlie', password='password')
        self.conversation = self.create_conversation(self.alice, self.bob)
        self.authenticate(self.alice)

    def authenticate(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def create_conversation(self, first, second):
        conversation = Conversation.objects.create(
            type=Conversation.Type.PRIVATE,
            created_by=first,
        )
        ConversationMember.objects.bulk_create([
            ConversationMember(conversation=conversation, user=first),
            ConversationMember(conversation=conversation, user=second),
        ])
        return conversation

    def create_message(self, author, conversation=None, content='Hello'):
        return Message.objects.create(
            conversation=conversation or self.conversation,
            author=author,
            content=content,
        )

    def conversation_data(self, conversation=None):
        conversation = conversation or self.conversation
        response = self.client.get(f'/api/conversations/{conversation.pk}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def test_unread_count_is_zero_without_messages(self):
        self.assertEqual(self.conversation_data()['unread_count'], 0)

    def test_other_users_messages_are_unread_when_never_read(self):
        self.create_message(self.bob)
        self.create_message(self.bob)
        self.assertEqual(self.conversation_data()['unread_count'], 2)

    def test_own_message_is_not_unread(self):
        self.create_message(self.alice)
        self.assertEqual(self.conversation_data()['unread_count'], 0)

    def test_mark_read_resets_unread_count(self):
        self.create_message(self.bob)

        response = self.client.post(
            f'/api/conversations/{self.conversation.pk}/read/'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {
            'conversation': self.conversation.pk,
            'unread_count': 0,
        })
        self.assertEqual(self.conversation_data()['unread_count'], 0)
        membership = ConversationMember.objects.get(
            conversation=self.conversation,
            user=self.alice,
        )
        self.assertIsNotNone(membership.last_read_at)

    def test_non_member_cannot_mark_conversation_read(self):
        self.authenticate(self.charlie)
        response = self.client.post(
            f'/api/conversations/{self.conversation.pk}/read/'
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_list_exposes_counts_for_multiple_conversations(self):
        other = self.create_conversation(self.alice, self.charlie)
        self.create_message(self.bob)
        self.create_message(self.charlie, conversation=other)
        self.create_message(self.charlie, conversation=other)

        response = self.client.get('/api/conversations/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        counts = {item['id']: item['unread_count'] for item in response.data}
        self.assertEqual(counts, {self.conversation.pk: 1, other.pk: 2})

    def test_only_messages_after_last_read_are_counted(self):
        old_message = self.create_message(self.bob, content='Old')
        cutoff = timezone.now()
        membership = ConversationMember.objects.get(
            conversation=self.conversation,
            user=self.alice,
        )
        membership.last_read_at = cutoff
        membership.save(update_fields=('last_read_at',))
        Message.objects.filter(pk=old_message.pk).update(
            created_at=cutoff - timedelta(minutes=1)
        )
        self.create_message(self.bob, content='New')

        self.assertEqual(self.conversation_data()['unread_count'], 1)

    def test_list_does_not_query_per_conversation(self):
        self.create_conversation(self.alice, self.charlie)

        # Token auth + conversations + memberships + all membership users.
        with self.assertNumQueries(4):
            response = self.client.get('/api/conversations/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
