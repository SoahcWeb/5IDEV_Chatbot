from rest_framework.permissions import BasePermission

from .models import ConversationMember


class IsConversationMember(BasePermission):
    """Autorise si l'utilisateur est membre de la conversation."""

    message = "Vous n'êtes pas membre de cette conversation."

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if obj is None:
            return False
        return obj.memberships.filter(user=request.user).exists()


class IsConversationAdmin(BasePermission):
    """Autorise si l'utilisateur est admin de la conversation."""

    message = "Vous devez être admin de cette conversation."

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if obj is None:
            return False
        return obj.memberships.filter(
            user=request.user,
            role=ConversationMember.Role.ADMIN,
        ).exists()