from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from conversations.models import Conversation, ConversationMember

from .models import Message


User = get_user_model()


class MessageAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.alice = User.objects.create_user('alice', password='TestPassword123!')
        cls.bob = User.objects.create_user('bob', password='TestPassword123!')
        cls.charlie = User.objects.create_user('charlie', password='TestPassword123!')

    def setUp(self):
        self.conversation = Conversation.objects.create(
            type=Conversation.Type.PRIVATE,
            created_by=self.alice,
        )
        ConversationMember.objects.bulk_create([
            ConversationMember(conversation=self.conversation, user=self.alice),
            ConversationMember(conversation=self.conversation, user=self.bob),
        ])

    def authenticate(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def list_url(self, conversation=None):
        conversation = conversation or self.conversation
        return f'/api/conversations/{conversation.id}/messages/'

    def detail_url(self, message):
        return f'/api/messages/{message.id}/'

    def create_message(self, author=None, content='Hello', conversation=None):
        return Message.objects.create(
            conversation=conversation or self.conversation,
            author=author or self.alice,
            content=content,
        )

    def test_member_can_send_message(self):
        self.authenticate(self.alice)
        response = self.client.post(self.list_url(), {'content': 'Hello'})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['content'], 'Hello')

    def test_non_member_cannot_send_message(self):
        self.authenticate(self.charlie)
        response = self.client.post(self.list_url(), {'content': 'Hello'})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_member_can_list_messages(self):
        message = self.create_message()
        self.authenticate(self.bob)

        response = self.client.get(self.list_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['results'][0]['id'], message.id)

    def test_non_member_cannot_list_messages(self):
        self.create_message()
        self.authenticate(self.charlie)

        response = self.client.get(self.list_url())

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_empty_message_is_rejected(self):
        self.authenticate(self.alice)
        response = self.client.post(self.list_url(), {'content': ''})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_whitespace_only_message_is_rejected(self):
        self.authenticate(self.alice)
        response = self.client.post(self.list_url(), {'content': '   '})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_author_is_set_from_authenticated_user(self):
        self.authenticate(self.bob)
        self.client.post(self.list_url(), {'content': 'Hello'})

        self.assertEqual(Message.objects.get().author, self.bob)

    def test_conversation_is_set_from_url(self):
        self.authenticate(self.alice)
        self.client.post(self.list_url(), {'content': 'Hello'})

        self.assertEqual(Message.objects.get().conversation, self.conversation)

    def test_messages_are_returned_in_chronological_order(self):
        first = self.create_message(content='First')
        second = self.create_message(content='Second')
        Message.objects.filter(pk=first.pk).update(
            created_at=timezone.now() - timedelta(minutes=1)
        )
        self.authenticate(self.alice)

        response = self.client.get(self.list_url())

        self.assertEqual(
            [item['id'] for item in response.data['results']],
            [first.id, second.id],
        )

    def test_message_list_is_paginated(self):
        Message.objects.bulk_create([
            Message(
                conversation=self.conversation,
                author=self.alice,
                content=f'Message {index}',
            )
            for index in range(21)
        ])
        self.authenticate(self.alice)

        first_page = self.client.get(self.list_url())
        second_page = self.client.get(self.list_url(), {'page': 2})

        self.assertEqual(first_page.data['count'], 21)
        self.assertEqual(len(first_page.data['results']), 20)
        self.assertEqual(len(second_page.data['results']), 1)

    def test_author_can_update_message(self):
        message = self.create_message()
        self.authenticate(self.alice)

        response = self.client.patch(
            self.detail_url(message),
            {'content': 'Updated'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        message.refresh_from_db()
        self.assertEqual(message.content, 'Updated')

    def test_other_member_cannot_update_message(self):
        message = self.create_message()
        self.authenticate(self.bob)

        response = self.client.patch(
            self.detail_url(message),
            {'content': 'Updated'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_author_can_delete_message(self):
        message = self.create_message()
        self.authenticate(self.alice)

        response = self.client.delete(self.detail_url(message))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Message.objects.filter(pk=message.pk).exists())

    def test_other_member_cannot_delete_message(self):
        message = self.create_message()
        self.authenticate(self.bob)

        response = self.client.delete(self.detail_url(message))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authentication_is_required(self):
        message = self.create_message()
        responses = (
            self.client.get(self.list_url()),
            self.client.post(self.list_url(), {'content': 'Hello'}),
            self.client.patch(self.detail_url(message), {'content': 'Updated'}),
            self.client.delete(self.detail_url(message)),
        )

        self.assertTrue(
            all(response.status_code == status.HTTP_401_UNAUTHORIZED for response in responses)
        )

    def test_outside_conversation_message_is_not_accessible(self):
        message = self.create_message()
        self.authenticate(self.charlie)

        response = self.client.get(self.detail_url(message))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_updated_at_changes_after_update(self):
        message = self.create_message()
        old_timestamp = timezone.now() - timedelta(days=1)
        Message.objects.filter(pk=message.pk).update(updated_at=old_timestamp)
        self.authenticate(self.alice)

        self.client.patch(
            self.detail_url(message),
            {'content': 'Updated'},
            format='json',
        )

        message.refresh_from_db()
        self.assertGreater(message.updated_at, old_timestamp)
