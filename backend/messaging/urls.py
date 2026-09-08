from django.urls import path

from .views import ConversationMessageListCreateView, MessageDetailView


app_name = 'messaging'

urlpatterns = [
    path(
        'api/conversations/<int:conversation_id>/messages/',
        ConversationMessageListCreateView.as_view(),
        name='conversation-messages',
    ),
    path(
        'api/messages/<int:pk>/',
        MessageDetailView.as_view(),
        name='message-detail',
    ),
]
