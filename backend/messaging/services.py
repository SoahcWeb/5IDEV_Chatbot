from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from conversations.models import ConversationMember
from conversations.unread import unread_counts_for_members

from .serializers import MessageSerializer


def create_and_broadcast_message(serializer, *, conversation, author):
    """Persist a validated message and publish its realtime events once."""
    message = serializer.save(conversation=conversation, author=author)
    message = type(message).objects.select_related(
        'author',
        'conversation',
    ).get(pk=message.pk)
    message_data = MessageSerializer(message).data

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'conversation_{conversation.pk}',
        {
            'type': 'chat.message',
            'message': message_data,
        },
    )

    recipient_ids = list(
        ConversationMember.objects.filter(conversation=conversation)
        .exclude(user=author)
        .values_list('user_id', flat=True)
    )
    unread_counts = unread_counts_for_members(conversation.pk, recipient_ids)
    for user_id in recipient_ids:
        async_to_sync(channel_layer.group_send)(
            f'user_{user_id}',
            {
                'type': 'notification.message',
                'conversation': conversation.pk,
                'message': message_data,
                'unread_count': unread_counts[user_id],
            },
        )

    return message
