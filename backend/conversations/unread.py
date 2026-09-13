from django.db.models import Count, F, Q

from .models import ConversationMember


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


def unread_counts_for_members(conversation_id, user_ids):
    """Return per-member unread counts for one conversation in one query."""
    unread_filter = ~Q(conversation__messages__author_id=F('user_id')) & (
        Q(last_read_at__isnull=True)
        | Q(conversation__messages__created_at__gt=F('last_read_at'))
    )
    memberships = ConversationMember.objects.filter(
        conversation_id=conversation_id,
        user_id__in=user_ids,
    ).annotate(
        unread_count=Count(
            'conversation__messages',
            filter=unread_filter,
            distinct=True,
        )
    )
    return {
        membership.user_id: membership.unread_count
        for membership in memberships
    }
