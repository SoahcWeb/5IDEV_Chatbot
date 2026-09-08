from rest_framework.permissions import BasePermission

from .models import ConversationMember


class IsConversationMember(BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.memberships.filter(user=request.user).exists()


class IsConversationAdmin(BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.memberships.filter(
            user=request.user,
            role=ConversationMember.Role.ADMIN,
        ).exists()
