# 5IDEV Chatbot

Application de messagerie composée d'un backend Django REST Framework avec
Django Channels et d'un frontend React/Vite.

## Développement local

1. Copier `backend/.env.example` vers `backend/.env` et adapter les valeurs.
2. Installer les dépendances backend depuis `backend/requirements.txt`.
3. Exécuter les migrations puis démarrer Django depuis `backend`.
4. Exécuter `npm ci` puis `npm run dev` depuis `frontend`.

Les valeurs par défaut utilisent SQLite, un channel layer mémoire et les URL
locales. Elles sont réservées au développement.

## Validation

```text
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test

cd ../frontend
npm test
npm run lint
npm run build
```

## Production

Le mode de production est activé avec `DJANGO_ENV=production`. Il exige une
clé secrète, PostgreSQL via `DATABASE_URL` et Redis via `REDIS_URL`; aucun
repli SQLite ou mémoire n'est alors autorisé.

Consulter [docs/DEPLOYMENT_RENDER.md](docs/DEPLOYMENT_RENDER.md) pour les
services, variables et commandes Render, et
[docs/API_WEBSOCKET.md](docs/API_WEBSOCKET.md) pour les contrats REST et
WebSocket.
