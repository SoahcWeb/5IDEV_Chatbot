from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Conversation, ConversationMember
from .permissions import IsConversationAdmin, IsConversationMember
from .serializers import (
    AddConversationMemberSerializer,
    ConversationSerializer,
    CreateGroupConversationSerializer,
    CreatePrivateConversationSerializer,
)
from .unread import with_unread_count


# ============================================================
#  HELPER
# ============================================================
def conversations_for(user):
    """Retourne les conversations accessibles par l'utilisateur,
    annotées avec le unread_count."""
    queryset = (
        Conversation.objects
        .filter(memberships__user=user)
        .select_related('created_by')
        .prefetch_related('memberships__user')
        .distinct()
    )
    return with_unread_count(queryset, user)


# ============================================================
#  LISTE
# ============================================================
class ConversationListView(generics.ListAPIView):
    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return conversations_for(self.request.user)


# ============================================================
#  DÉTAIL
# ============================================================
class ConversationDetailView(generics.RetrieveAPIView):
    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated, IsConversationMember]

    def get_queryset(self):
        return conversations_for(self.request.user)


# ============================================================
#  CRÉATION PRIVÉE
# ============================================================
class CreatePrivateConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CreatePrivateConversationSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        conversation = serializer.save()

        response_status = (
            status.HTTP_201_CREATED
            if getattr(serializer, 'was_created', True)
            else status.HTTP_200_OK
        )

        return Response(
            ConversationSerializer(
                conversation,
                context={'request': request},
            ).data,
            status=response_status,
        )


# ============================================================
#  CRÉATION GROUPE
# ============================================================
class CreateGroupConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CreateGroupConversationSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        conversation = serializer.save()

        return Response(
            ConversationSerializer(
                conversation,
                context={'request': request},
            ).data,
            status=status.HTTP_201_CREATED,
        )


# ============================================================
#  AJOUT MEMBRE (admin seulement)
# ============================================================
class AddConversationMemberView(APIView):
    permission_classes = [IsAuthenticated, IsConversationAdmin]

    def post(self, request, pk):
        conversation = get_object_or_404(
            conversations_for(request.user),
            pk=pk,
        )
        self.check_object_permissions(request, conversation)

        if conversation.type != Conversation.Type.GROUP:
            return Response(
                {'detail': 'Members can only be added to group conversations.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AddConversationMemberSerializer(
            data=request.data,
            context={'conversation': conversation},
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()

        return Response(
            ConversationSerializer(
                membership.conversation,
                context={'request': request},
            ).data,
            status=status.HTTP_201_CREATED,
        )


# ============================================================
#  MARQUER COMME LU
# ============================================================
class MarkConversationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        membership = get_object_or_404(
            ConversationMember,
            conversation_id=pk,
            user=request.user,
        )
        membership.last_read_at = timezone.now()
        membership.save(update_fields=('last_read_at',))
        return Response({
            'conversation': pk,
            'unread_count': 0,
        })


# ============================================================
#  RETIRER MEMBRE (admin seulement)
# ============================================================
class RemoveConversationMemberView(APIView):
    permission_classes = [IsAuthenticated, IsConversationAdmin]

    def delete(self, request, pk, user_id):
        conversation = get_object_or_404(
            conversations_for(request.user),
            pk=pk,
        )
        self.check_object_permissions(request, conversation)

        if conversation.type != Conversation.Type.GROUP:
            return Response(
                {'detail': 'Members can only be removed from group conversations.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        membership = get_object_or_404(
            conversation.memberships,
            user_id=user_id,
        )

        # Empêcher le retrait du dernier admin
        if (
            membership.role == ConversationMember.Role.ADMIN
            and conversation.memberships.filter(
                role=ConversationMember.Role.ADMIN
            ).count() == 1
        ):
            return Response(
                {'detail': 'The last group admin cannot be removed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Empêcher un admin de se retirer lui-même par erreur
        if membership.user_id == request.user.id:
            return Response(
                {'detail': "Vous ne pouvez pas vous retirer vous-même du groupe."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)