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


def delete_and_broadcast_message(*, message, user):
    """Supprime un message et prévient tous les clients de la conversation."""
    conversation_id = message.conversation_id
    message_id = message.pk

    # Suppression en base
    message.delete()

    # Broadcast de l'événement de suppression
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'conversation_{conversation_id}',
        {
            'type': 'chat.message.deleted',
            'message_id': message_id,
            'conversation': conversation_id,
        },
    )


def update_and_broadcast_message(*, message, serializer):
    """Met à jour un message et prévient tous les clients de la conversation."""
    updated = serializer.save()
    message_data = MessageSerializer(updated).data

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'conversation_{updated.conversation_id}',
        {
            'type': 'chat.message.updated',
            'message': message_data,
        },
    )

    return updated