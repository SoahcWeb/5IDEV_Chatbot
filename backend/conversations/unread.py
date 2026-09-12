from django.db.models import Count, F, Q


def with_unread_count(queryset, user):
    """Annotate conversations with unread messages for the given member."""
    unread_filter = ~Q(messages__author=user) & (
        Q(memberships__last_read_at__isnull=True)
        | Q(messages__created_at__gt=F('memberships__last_read_at'))
    )
    return queryset.annotate(
        unread_count=Count(
            'messages',
            filter=unread_filter,
            distinct=True,
        )
    )


def unread_count_for(conversation, user):
    return with_unread_count(
        conversation.__class__.objects.filter(
            pk=conversation.pk,
            memberships__user=user,
        ),
        user,
    ).values_list('unread_count', flat=True).get()
