from django.contrib import admin

from .models import Message


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'conversation', 'author', 'created_at', 'updated_at')
    search_fields = ('content', 'author__username', 'conversation__name')
    list_select_related = ('conversation', 'author')
