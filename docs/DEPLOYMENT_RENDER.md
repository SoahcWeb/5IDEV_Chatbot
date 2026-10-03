# Déploiement sur Render

Ce guide décrit la configuration à appliquer. Il ne crée aucun service Render
et ne contient aucun secret réel.

## Architecture et services

Créer quatre services, idéalement dans la même région :

1. un **Web Service** Python pour Django, DRF, Channels et Daphne ;
2. une base **Render Postgres** ;
3. une instance **Render Key Value** compatible Redis ;
4. un **Static Site** pour le frontend React/Vite.

PostgreSQL est la source de vérité persistante. Key Value sert uniquement de
channel layer à Django Channels.

## Paramètres présents dans le dépôt

Le dépôt fournit déjà :

- l'application ASGI `config.asgi:application` pour HTTP et WebSocket ;
- Daphne, `channels_redis`, `psycopg`, `dj-database-url` et WhiteNoise ;
- `STATIC_ROOT` et le stockage statique WhiteNoise avec manifeste compressé ;
- la lecture de toutes les variables décrites ci-dessous ;
- `DJANGO_ENV=production`, qui interdit `DEBUG=True` et exige la clé secrète,
  PostgreSQL et Redis au lieu des replis locaux SQLite et mémoire ;
- les variables Vite `VITE_API_URL` et `VITE_WS_URL`.

Le dépôt ne contient pas de `render.yaml`. Les services, leurs domaines, leurs
variables, leurs commandes et l'auto-deploy doivent donc être configurés dans
Render.

## Backend : Web Service

Repository : `SoahcWeb/5IDEV_Chatbot`

Branche de production : `main`

Root Directory :

```text
backend
```

Build Command :

```sh
pip install -r requirements.txt && python manage.py collectstatic --noinput
```

Pre-Deploy Command recommandée :

```sh
python manage.py migrate
```

Start Command :

```sh
daphne -b 0.0.0.0 -p $PORT config.asgi:application
```

Render fournit `$PORT`. La Pre-Deploy Command est préférable, car elle applique
les migrations après un build réussi et avant la mise en service de la nouvelle
version. Si le plan choisi ne la propose pas, appliquer ponctuellement les
migrations depuis un environnement de confiance connecté à PostgreSQL. En
dernier recours, elles peuvent être ajoutées à la Build Command :

```sh
pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate
```

Ne jamais exécuter les migrations avant que `DATABASE_URL` pointe vers la base
de production.

## Variables du backend à configurer dans Render

Toutes ces variables appartiennent à l'environnement du Web Service. Elles ne
doivent pas être ajoutées au dépôt.

| Variable | Valeur attendue |
|---|---|
| `DJANGO_ENV` | `production` |
| `DJANGO_SECRET_KEY` | Nouvelle valeur longue et aléatoire stockée comme secret |
| `DJANGO_DEBUG` | `False` |
| `DJANGO_ALLOWED_HOSTS` | Hostname du backend, sans schéma ni chemin |
| `CORS_ALLOWED_ORIGINS` | Origine HTTPS exacte du frontend |
| `CSRF_TRUSTED_ORIGINS` | Origine HTTPS exacte du frontend |
| `WEBSOCKET_ALLOWED_ORIGINS` | Origine HTTPS exacte du frontend |
| `DATABASE_URL` | Internal Database URL de Render Postgres |
| `REDIS_URL` | Internal Redis URL de Render Key Value |
| `DJANGO_SECURE_SSL_REDIRECT` | `True` |
| `DJANGO_SECURE_HSTS_SECONDS` | `0` au premier déploiement |

Les listes d'hôtes ou d'origines acceptent plusieurs valeurs séparées par des
virgules. `DJANGO_ALLOWED_HOSTS` ne contient que des hostnames. Les trois
variables d'origine contiennent le schéma `https://`.

`DEMO_USER_PASSWORD` n'est utile que si la commande de création des comptes de
démonstration est volontairement exécutée. Elle n'est pas requise par le
service normal.

### HTTPS et HSTS

Render termine TLS et transmet le protocole d'origine. Django fait confiance à
`X-Forwarded-Proto` via `SECURE_PROXY_SSL_HEADER`, ce qui évite une boucle quand
`SECURE_SSL_REDIRECT=True`. En mode production, la redirection HTTPS est activée
par défaut et peut aussi être explicitée dans Render.

HSTS reste initialement à `0`. Après validation du domaine, de HTTPS et de tous
les sous-domaines concernés, augmenter progressivement
`DJANGO_SECURE_HSTS_SECONDS`. Le réglage active alors `includeSubDomains`, mais
pas le preload. HSTS ne doit pas être activé à la légère, car les navigateurs le
mémorisent et une mauvaise configuration peut rendre le site inaccessible.

## PostgreSQL et Redis

Relier les propriétés internes des datastores au Web Service :

```text
Render Postgres Internal Database URL -> DATABASE_URL
Render Key Value Internal Redis URL   -> REDIS_URL
```

Quand `DJANGO_ENV=production`, l'absence de l'une de ces variables arrête le
backend avec une erreur de configuration explicite. En développement, leur
absence conserve volontairement SQLite et `InMemoryChannelLayer`.

## Frontend : Static Site

Root Directory :

```text
frontend
```

Build Command :

```sh
npm ci && npm run build
```

Publish Directory :

```text
dist
```

Un Static Site n'a pas de Start Command.

Variables de build à configurer dans Render :

```env
VITE_API_URL=https://<hostname-backend>/api
VITE_WS_URL=wss://<hostname-backend>
```

Ces valeurs sont intégrées au bundle lors du build. Toute modification exige un
nouveau déploiement du frontend. Sans elles, le code utilise ses valeurs locales
`localhost`, qui ne conviennent pas en production.

Si React Router doit servir une route directement depuis le Static Site,
configurer une règle de rewrite Render de `/*` vers `/index.html`.

## Auto-deploy et CI

Le workflow GitHub Actions teste les pushes et pull requests visant `main`, mais
il ne déploie rien. Dans chaque service Render, connecter `main` et activer
l'auto-deploy seulement lorsque cette politique est souhaitée. Cette option est
un paramètre Render, pas un paramètre actuellement versionné dans le dépôt.

## Ordre recommandé

1. Fusionner dans `main` une version dont les validations backend et frontend
   passent.
2. Créer PostgreSQL et Key Value dans la région retenue.
3. Créer le Web Service backend et renseigner toutes ses variables.
4. Construire le backend, appliquer les migrations, puis démarrer Daphne.
5. Tester une route API en HTTPS et les sockets de conversation et notification
   en WSS.
6. Créer le Static Site avec les deux variables Vite et la règle de rewrite.
7. Tester inscription/connexion, conversations, messages, notifications et
   compteurs avec deux utilisateurs.
8. Activer l'auto-deploy depuis `main` si souhaité.
9. Après validation complète de HTTPS, décider d'une montée progressive de la
   durée HSTS.

## Checklist avant mise en service

- [ ] `DJANGO_ENV=production` et `DJANGO_DEBUG=False`
- [ ] Nouvelle clé secrète configurée sans apparaître dans les logs
- [ ] URL internes PostgreSQL et Redis reliées
- [ ] Migrations appliquées
- [ ] `collectstatic` réussi
- [ ] Hostname backend et origines frontend exacts
- [ ] API HTTPS et WebSockets WSS testés
- [ ] Variables Vite présentes au moment du build
- [ ] Rewrite SPA configuré
- [ ] Test de bout en bout avec deux utilisateurs
- [ ] Politique d'auto-deploy vérifiée
