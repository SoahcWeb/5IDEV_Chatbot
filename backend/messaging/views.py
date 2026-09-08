from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from conversations.models import Conversation

from .models import Message
from .pagination import MessagePagination
from .permissions import IsMessageAuthor
from .serializers import CreateMessageSerializer, MessageSerializer


def conversation_for(user, conversation_id):
    return get_object_or_404(
        Conversation.objects.filter(memberships__user=user).distinct(),
        pk=conversation_id,
    )


class ConversationMessageListCreateView(generics.ListCreateAPIView):
    pagination_class = MessagePagination

    def get_conversation(self):
        if not hasattr(self, '_conversation'):
            self._conversation = conversation_for(
                self.request.user,
                self.kwargs['conversation_id'],
            )
        return self._conversation

    def get_queryset(self):
        return Message.objects.filter(
            conversation=self.get_conversation()
        ).select_related('author', 'conversation')

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return CreateMessageSerializer
        return MessageSerializer

    def perform_create(self, serializer):
        serializer.save(
            conversation=self.get_conversation(),
            author=self.request.user,
        )

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        message = Message.objects.select_related('author', 'conversation').get(
            pk=response.data['id']
        )
        response.data = MessageSerializer(message).data
        return response


class MessageDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated, IsMessageAuthor]
    http_method_names = ('get', 'patch', 'delete', 'head', 'options')

    def get_queryset(self):
        return (
            Message.objects.filter(
                conversation__memberships__user=self.request.user,
            )
            .select_related('author', 'conversation')
            .distinct()
        )
