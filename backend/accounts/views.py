from django.contrib.auth import authenticate, get_user_model
from django.db import transaction
from rest_framework import generics, status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import (
    ChangeEmailSerializer,
    ChangePasswordSerializer,
    DeleteAccountSerializer,
    RegisterSerializer,
    UserListSerializer,
    UserSerializer,
    UpdateProfileSerializer,
)
from conversations.models import Conversation, ConversationMember


User = get_user_model()


# ============================================================
#  INSCRIPTION
# ============================================================
class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {
                'token': token.key,
                'user': UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


# ============================================================
#  CONNEXION
# ============================================================
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response(
                {'detail': "Nom d'utilisateur et mot de passe requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request=request, username=username, password=password)
        if user is None:
            return Response(
                {'detail': "Nom d'utilisateur ou mot de passe incorrect."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': UserSerializer(user).data,
        })


# ============================================================
#  DÉCONNEXION
# ============================================================
class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # ⚠️ On protège contre un request.auth None
        if request.auth:
            request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ============================================================
#  UTILISATEUR COURANT
# ============================================================
class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UpdateProfileSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


# ============================================================
#  CHANGEMENT DE MOT DE PASSE
# ============================================================
class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'detail': 'Password updated successfully.'})


# ============================================================
#  CHANGEMENT D'EMAIL
# ============================================================
class ChangeEmailView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangeEmailSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'detail': 'Email updated successfully.'})


# ============================================================
#  SUPPRESSION DE COMPTE
# ============================================================
class DeleteAccountView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def delete(self, request):
        serializer = DeleteAccountSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)

        user = request.user
        groups = (
            Conversation.objects.select_for_update()
            .filter(
                pk__in=ConversationMember.objects.filter(
                    user=user,
                    role=ConversationMember.Role.ADMIN,
                    conversation__type=Conversation.Type.GROUP,
                ).values('conversation_id')
            )
        )
        for group in groups:
            memberships = list(
                group.memberships.select_for_update().order_by('joined_at', 'pk')
            )
            remaining_memberships = [
                membership
                for membership in memberships
                if membership.user_id != user.pk
            ]
            has_another_admin = any(
                membership.role == ConversationMember.Role.ADMIN
                for membership in remaining_memberships
            )
            if not has_another_admin:
                if remaining_memberships:
                    successor = remaining_memberships[0]
                    successor.role = ConversationMember.Role.ADMIN
                    successor.save(update_fields=('role',))

        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ============================================================
#  LISTE DES UTILISATEURS
# ============================================================
class UserListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserListSerializer

    def get_queryset(self):
        return (
            User.objects
            .exclude(pk=self.request.user.pk)
            .order_by('username')
        )
