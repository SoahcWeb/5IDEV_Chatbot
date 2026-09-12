from django.urls import path

from .views import (
    AddConversationMemberView,
    ConversationDetailView,
    ConversationListView,
    CreateGroupConversationView,
    CreatePrivateConversationView,
    MarkConversationReadView,
    RemoveConversationMemberView,
)


app_name = 'conversations'

urlpatterns = [
    path('', ConversationListView.as_view(), name='list'),
    path('private/', CreatePrivateConversationView.as_view(), name='create-private'),
    path('group/', CreateGroupConversationView.as_view(), name='create-group'),
    path('<int:pk>/', ConversationDetailView.as_view(), name='detail'),
    path('<int:pk>/read/', MarkConversationReadView.as_view(), name='mark-read'),
    path('<int:pk>/members/', AddConversationMemberView.as_view(), name='add-member'),
    path(
        '<int:pk>/members/<int:user_id>/',
        RemoveConversationMemberView.as_view(),
        name='remove-member',
    ),
]
