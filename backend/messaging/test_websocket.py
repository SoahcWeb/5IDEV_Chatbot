from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
from rest_framework.authtoken.models import Token

from config.asgi import application
from conversations.models import Conversation, ConversationMember

from .models import Message


User = get_user_model()


class ChatConsumerTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.alice = User.objects.create_user('alice', password='password')
        self.bob = User.objects.create_user('bob', password='password')
        self.charlie = User.objects.create_user('charlie', password='password')
        self.alice_token = Token.objects.create(user=self.alice)
        self.bob_token = Token.objects.create(user=self.bob)
        self.charlie_token = Token.objects.create(user=self.charlie)
        self.conversation = Conversation.objects.create(
            type=Conversation.Type.PRIVATE,
            created_by=self.alice,
        )
        ConversationMember.objects.bulk_create([
            ConversationMember(conversation=self.conversation, user=self.alice),
            ConversationMember(conversation=self.conversation, user=self.bob),
        ])

    def socket_path(self, conversation=None, token=None):
        conversation = conversation or self.conversation
        path = f'/ws/conversations/{conversation.pk}/'
        return f'{path}?token={token.key}' if token else path

    async def connect(self, path):
        communicator = WebsocketCommunicator(
            application,
            path,
            headers=[(b'origin', b'http://testserver')],
        )
        connected, close_code = await communicator.connect()
        return communicator, connected, close_code

    def test_member_with_valid_token_can_connect(self):
        async def scenario():
            socket, connected, _ = await self.connect(
                self.socket_path(token=self.alice_token)
            )
            self.assertTrue(connected)
            await socket.disconnect()

        async_to_sync(scenario)()

    def test_connection_without_token_is_rejected(self):
        async def scenario():
            socket, connected, close_code = await self.connect(self.socket_path())
            self.assertFalse(connected)
            self.assertEqual(close_code, 4401)
            await socket.disconnect()

        async_to_sync(scenario)()

    def test_connection_with_invalid_token_is_rejected(self):
        async def scenario():
            path = f'/ws/conversations/{self.conversation.pk}/?token=invalid'
            socket, connected, close_code = await self.connect(path)
            self.assertFalse(connected)
            self.assertEqual(close_code, 4401)
            await socket.disconnect()

        async_to_sync(scenario)()

    def test_non_member_is_rejected(self):
        async def scenario():
            socket, connected, close_code = await self.connect(
                self.socket_path(token=self.charlie_token)
            )
            self.assertFalse(connected)
            self.assertEqual(close_code, 4403)
            await socket.disconnect()

        async_to_sync(scenario)()

    def test_missing_conversation_is_rejected(self):
        async def scenario():
            path = f'/ws/conversations/999999/?token={self.alice_token.key}'
            socket, connected, close_code = await self.connect(path)
            self.assertFalse(connected)
            self.assertEqual(close_code, 4404)
            await socket.disconnect()

        async_to_sync(scenario)()

    def test_member_can_send_and_message_is_saved(self):
        async def scenario():
            socket, connected, _ = await self.connect(
                self.socket_path(token=self.alice_token)
            )
            self.assertTrue(connected)
            await socket.send_json_to({
                'type': 'message.send',
                'content': ' Hello ',
            })
            event = await socket.receive_json_from()
            self.assertEqual(event['type'], 'message.created')
            self.assertEqual(event['message']['content'], 'Hello')
            await socket.disconnect()
            return event['message']

        data = async_to_sync(scenario)()
        message = Message.objects.get(pk=data['id'])
        self.assertEqual(message.author, self.alice)
        self.assertEqual(message.conversation, self.conversation)

    def test_client_cannot_spoof_author_or_conversation(self):
        other = Conversation.objects.create(
            type=Conversation.Type.PRIVATE,
            created_by=self.charlie,
        )
        ConversationMember.objects.create(conversation=other, user=self.charlie)

        async def scenario():
            socket, connected, _ = await self.connect(
                self.socket_path(token=self.alice_token)
            )
            self.assertTrue(connected)
            await socket.send_json_to({
                'type': 'message.send',
                'content': 'Safe',
                'author': self.charlie.pk,
                'conversation': other.pk,
            })
            event = await socket.receive_json_from()
            await socket.disconnect()
            return event['message']['id']

        message_id = async_to_sync(scenario)()
        message = Message.objects.get(pk=message_id)
        self.assertEqual(message.author, self.alice)
        self.assertEqual(message.conversation, self.conversation)

    def test_empty_and_whitespace_messages_are_rejected(self):
        async def scenario():
            socket, connected, _ = await self.connect(
                self.socket_path(token=self.alice_token)
            )
            self.assertTrue(connected)
            for content in ('', '   '):
                await socket.send_json_to({
                    'type': 'message.send',
                    'content': content,
                })
                event = await socket.receive_json_from()
                self.assertEqual(event['type'], 'error')
                self.assertEqual(event['code'], 'invalid_message')
            await socket.disconnect()

        async_to_sync(scenario)()
        self.assertEqual(Message.objects.count(), 0)

    def test_invalid_payloads_and_unknown_event_return_errors(self):
        async def scenario():
            socket, connected, _ = await self.connect(
                self.socket_path(token=self.alice_token)
            )
            self.assertTrue(connected)
            payloads = (
                ('not-json', 'invalid_payload'),
                ({'type': 'message.send', 'content': 123}, 'invalid_payload'),
                ({'type': 'presence.update'}, 'unsupported_event'),
            )
            for payload, expected_code in payloads:
                if isinstance(payload, str):
                    await socket.send_to(text_data=payload)
                else:
                    await socket.send_json_to(payload)
                event = await socket.receive_json_from()
                self.assertEqual(event['type'], 'error')
                self.assertEqual(event['code'], expected_code)
            await socket.disconnect()

        async_to_sync(scenario)()

    def test_members_receive_broadcast_and_other_conversation_does_not(self):
        other = Conversation.objects.create(
            type=Conversation.Type.PRIVATE,
            created_by=self.charlie,
        )
        ConversationMember.objects.create(conversation=other, user=self.charlie)

        async def scenario():
            alice_socket, alice_connected, _ = await self.connect(
                self.socket_path(token=self.alice_token)
            )
            bob_socket, bob_connected, _ = await self.connect(
                self.socket_path(token=self.bob_token)
            )
            other_socket, other_connected, _ = await self.connect(
                self.socket_path(conversation=other, token=self.charlie_token)
            )
            self.assertTrue(all((alice_connected, bob_connected, other_connected)))

            await alice_socket.send_json_to({
                'type': 'message.send',
                'content': 'Broadcast',
            })
            alice_event = await alice_socket.receive_json_from()
            bob_event = await bob_socket.receive_json_from()
            self.assertEqual(alice_event, bob_event)
            self.assertTrue(await other_socket.receive_nothing(timeout=0.1))

            await alice_socket.disconnect()
            await bob_socket.disconnect()
            await other_socket.disconnect()

        async_to_sync(scenario)()
