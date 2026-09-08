from rest_framework import serializers

from .models import Message


class MessageSerializer(serializers.ModelSerializer):
    author = serializers.PrimaryKeyRelatedField(read_only=True)
    username = serializers.CharField(source='author.username', read_only=True)

    class Meta:
        model = Message
        fields = (
            'id',
            'conversation',
            'author',
            'username',
            'content',
            'created_at',
            'updated_at',
        )
        read_only_fields = (
            'id',
            'conversation',
            'author',
            'username',
            'created_at',
            'updated_at',
        )

    def validate_content(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Message content cannot be empty.')
        return value


class CreateMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ('id', 'content')
        read_only_fields = ('id',)

    def validate_content(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Message content cannot be empty.')
        return value
