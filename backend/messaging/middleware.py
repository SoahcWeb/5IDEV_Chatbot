from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework.authtoken.models import Token


@database_sync_to_async
def user_for_token(token_key):
    if not token_key:
        return AnonymousUser()

    try:
        return Token.objects.select_related('user').get(key=token_key).user
    except Token.DoesNotExist:
        return AnonymousUser()


class TokenAuthMiddleware:
    """Authenticate WebSockets with a DRF token from the query string."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        query_params = parse_qs(
            scope.get('query_string', b'').decode('utf-8', errors='ignore'),
            keep_blank_values=True,
        )
        token_values = query_params.get('token', [])
        token_key = token_values[0] if token_values else None

        scope = dict(scope)
        scope['user'] = await user_for_token(token_key)
        return await self.inner(scope, receive, send)


def TokenAuthMiddlewareStack(inner):
    # Production must use WSS: proxy logs can expose query-string tokens.
    # A secure cookie or short-lived WebSocket ticket is preferable long term.
    return TokenAuthMiddleware(inner)
