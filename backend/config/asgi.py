"""
ASGI config for config project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import OriginValidator
from django.conf import settings
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

django_asgi_application = get_asgi_application()

from messaging.middleware import TokenAuthMiddlewareStack
from messaging.routing import websocket_urlpatterns


application = ProtocolTypeRouter({
    'http': django_asgi_application,
    'websocket': OriginValidator(
        TokenAuthMiddlewareStack(
            URLRouter(websocket_urlpatterns),
        ),
        settings.WEBSOCKET_ALLOWED_ORIGINS,
    ),
})
