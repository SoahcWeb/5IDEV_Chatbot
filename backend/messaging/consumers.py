import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from conversations.models import Conversation, ConversationMember

from .serializers import CreateMessageSerializer, MessageSerializer


class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
        self.group_name = None
        user = self.scope.get('user')

        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return

        access = await self.conversation_access(user)
        if access == 'missing':
            await self.close(code=4404)
            return
        if access == 'forbidden':
            await self.close(code=4403)
            return

        self.group_name = f'conversation_{self.conversation_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if self.group_name:
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name,
            )

    async def receive(self, text_data=None, bytes_data=None, **kwargs):
        if text_data is None:
            await self.send_error('invalid_payload', 'A JSON object is required.')
            return

        try:
            content = await self.decode_json(text_data)
        except (json.JSONDecodeError, TypeError, ValueError):
            await self.send_error('invalid_payload', 'A valid JSON object is required.')
            return

        await self.receive_json(content, **kwargs)

    async def receive_json(self, content, **kwargs):
        if not isinstance(content, dict):
            await self.send_error('invalid_payload', 'A JSON object is required.')
            return
        if content.get('type') != 'message.send':
            await self.send_error('unsupported_event', 'Unsupported event type.')
            return
        if not isinstance(content.get('content'), str):
            await self.send_error('invalid_payload', 'Message content must be a string.')
            return

        message_data, errors = await self.create_message(
            self.scope['user'],
            content['content'],
        )
        if errors:
            detail = errors.get('content', ['Invalid message.'])[0]
            await self.send_error('invalid_message', str(detail))
            return

        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'chat.message',
                'message': message_data,
            },
        )

    async def chat_message(self, event):
        await self.send_json({
            'type': 'message.created',
            'message': event['message'],
        })

    async def send_error(self, code, detail):
        await self.send_json({
            'type': 'error',
            'code': code,
            'detail': detail,
        })

    @database_sync_to_async
    def conversation_access(self, user):
        if not Conversation.objects.filter(pk=self.conversation_id).exists():
            return 'missing'
        if not ConversationMember.objects.filter(
            conversation_id=self.conversation_id,
            user=user,
        ).exists():
            return 'forbidden'
        return 'allowed'

    @database_sync_to_async
    def create_message(self, user, content):
        serializer = CreateMessageSerializer(data={'content': content})
        if not serializer.is_valid():
            return None, serializer.errors

        message = serializer.save(
            conversation_id=self.conversation_id,
            author=user,
        )
        message = type(message).objects.select_related(
            'author',
            'conversation',
        ).get(pk=message.pk)
        return MessageSerializer(message).data, None
