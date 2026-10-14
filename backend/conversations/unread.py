from django.db.models import Count, F, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce

from .models import ConversationMember


def with_unread_count(queryset, user):
    """Annote chaque conversation avec le unread_count pour `user`.

    Utilise une sous-requête pour récupérer le `last_read_at` du membre
    courant, puis compte les messages non-lus côté conversation.
    Une seule requête SQL, pas de jointure croisée.
    """
    # Sous-requête : récupère le last_read_at de l'utilisateur pour la conversation
    last_read_subquery = ConversationMember.objects.filter(
        conversation=OuterRef('pk'),
        user=user,
    ).values('last_read_at')[:1]

    # On annote avec le last_read_at
    annotated = queryset.annotate(
        user_last_read_at=Subquery(last_read_subquery),
    )

    # Filtre : messages qui ne sont pas de l'utilisateur ET postérieurs au last_read
    unread_filter = Q(messages__author=user)  # sera inversé
    unread_filter = ~Q(messages__author=user) & (
        Q(user_last_read_at__isnull=True)
        | Q(messages__created_at__gt=F('user_last_read_at'))
    )

    return annotated.annotate(
        unread_count=Count(
            'messages',
            filter=unread_filter,
            distinct=True,
        )
    )


def unread_count_for(conversation, user):
    """Compte les messages non-lus pour UNE conversation et UN utilisateur."""
    try:
        membership = ConversationMember.objects.get(
            conversation=conversation,
            user=user,
        )
    except ConversationMember.DoesNotExist:
        return 0

    qs = conversation.messages.exclude(author=user)
    if membership.last_read_at is not None:
        qs = qs.filter(created_at__gt=membership.last_read_at)
    return qs.count()


def unread_counts_for_members(conversation_id, user_ids):
    """Per-member unread counts pour une conversation (approximatif)."""
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