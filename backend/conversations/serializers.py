from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from rest_framework import serializers

from .models import Conversation, ConversationMember
from .unread import unread_count_for


User = get_user_model()


class ConversationMemberSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = ConversationMember
        fields = ('id', 'user', 'username', 'role', 'joined_at')


class ConversationSerializer(serializers.ModelSerializer):
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    unread_count = serializers.SerializerMethodField()
    members = ConversationMemberSerializer(
        source='memberships',
        many=True,
        read_only=True,
    )

    class Meta:
        model = Conversation
        fields = (
            'id',
            'type',
            'name',
            'created_by',
            'created_at',
            'updated_at',
            'members',
            'unread_count',
        )

    def get_unread_count(self, obj):
        if hasattr(obj, 'unread_count'):
            return obj.unread_count

        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return 0
        return unread_count_for(obj, request.user)


class CreatePrivateConversationSerializer(serializers.Serializer):
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='other_user',
    )

    def validate_user_id(self, other_user):
        if other_user == self.context['request'].user:
            raise serializers.ValidationError(
                'A private conversation cannot be created with yourself.'
            )
        return other_user

    @transaction.atomic
    def create(self, validated_data):
        creator = self.context['request'].user
        other_user = validated_data['other_user']
        user_ids = (creator.pk, other_user.pk)
        existing = (
            Conversation.objects.filter(type=Conversation.Type.PRIVATE)
            .annotate(
                member_count=Count('memberships', distinct=True),
                matching_members=Count(
                    'memberships',
                    filter=Q(memberships__user_id__in=user_ids),
                    distinct=True,
                ),
            )
            .filter(member_count=2, matching_members=2)
            .first()
        )
        if existing:
            self.was_created = False
            return existing

        conversation = Conversation.objects.create(
            type=Conversation.Type.PRIVATE,
            created_by=creator,
        )
        ConversationMember.objects.bulk_create([
            ConversationMember(conversation=conversation, user=creator),
            ConversationMember(conversation=conversation, user=other_user),
        ])
        self.was_created = True
        return conversation


class CreateGroupConversationSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, allow_blank=False, trim_whitespace=True)
    member_ids = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        many=True,
        required=False,
        source='members',
    )

    def validate(self, attrs):
        members = attrs.get('members', [])
        member_ids = [member.pk for member in members]
        if len(member_ids) != len(set(member_ids)):
            raise serializers.ValidationError(
                {'member_ids': 'Duplicate users are not allowed.'}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        creator = self.context['request'].user
        members = [
            member for member in validated_data.get('members', []) if member != creator
        ]
        conversation = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            name=validated_data['name'],
            created_by=creator,
        )
        ConversationMember.objects.bulk_create([
            ConversationMember(
                conversation=conversation,
                user=creator,
                role=ConversationMember.Role.ADMIN,
            ),
            *[
                ConversationMember(
                    conversation=conversation,
                    user=member,
                    role=ConversationMember.Role.MEMBER,
                )
                for member in members
            ],
        ])
        return conversation


class AddConversationMemberSerializer(serializers.Serializer):
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='user',
    )

    def validate_user_id(self, user):
        if self.context['conversation'].memberships.filter(user=user).exists():
            raise serializers.ValidationError(
                'This user is already a member of the conversation.'
            )
        return user

    def create(self, validated_data):
        return ConversationMember.objects.create(
            conversation=self.context['conversation'],
            user=validated_data['user'],
            role=ConversationMember.Role.MEMBER,
        )
