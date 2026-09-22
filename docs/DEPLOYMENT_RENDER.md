# Déploiement futur sur Render

Ce document prépare le déploiement du projet sans créer de ressource Render. Les noms, URL et secrets ci-dessous sont des exemples génériques : aucune valeur locale ne doit être copiée en production.

## 1. Architecture cible

Le frontend React communique avec le backend Django via l'API REST et les WebSockets :

```text
Frontend React + Vite
        |
        | HTTPS (API) et WSS (temps réel)
        v
Backend Django / Django REST Framework
        |
        v
Daphne / ASGI
        |-- PostgreSQL (données persistantes)
        |-- Render Key Value, compatible Redis (Django Channels)
        `-- WebSockets (conversations et notifications)
```

WhiteNoise sert les fichiers statiques Django collectés dans `STATIC_ROOT`. Le build du frontend Vite reste séparé de celui du backend.

## 2. Services Render à créer plus tard

- un **Web Service** Python pour Django, DRF, Channels et Daphne ;
- une base **Render Postgres** ;
- une instance **Render Key Value**, compatible avec le client Redis utilisé par Channels ;
- éventuellement un **Static Site** distinct pour le frontend React/Vite.

Il n'est pas nécessaire de choisir les noms exacts avant le déploiement. Les services de données et le backend devraient être placés dans la même région lorsque Render permet ce choix, afin d'utiliser leurs URL internes et de limiter la latence.

## 3. Repository et branche

- Repository GitHub : `SoahcWeb/5IDEV_Chatbot`
- Branche de production : `main`

La branche `main` devra contenir la configuration de production validée avant de connecter le repository à Render.

## 4. Root Directory du backend

Configurer le **Root Directory** du Web Service sur :

```text
backend
```

Ce choix est confirmé par la structure du repository : `manage.py`, `requirements.txt` et le package Django `config` se trouvent tous dans `backend/`. Les commandes Render ci-dessous sont donc exécutées depuis ce répertoire.

## 5. Build Command du backend

Commande proposée :

```sh
pip install -r requirements.txt && python manage.py collectstatic --noinput
```

Elle installe les dépendances déclarées puis collecte les fichiers statiques Django dans `STATIC_ROOT`. WhiteNoise est déjà installé et configuré pour les servir. Aucun build frontend n'est nécessaire dans ce Web Service, puisque le frontend est séparé.

La migration de la base est volontairement traitée à part dans la section suivante.

## 6. Start Command du backend

Commande proposée :

```sh
daphne -b 0.0.0.0 -p $PORT config.asgi:application
```

Render fournit la variable `$PORT`. Le module `backend/config/asgi.py` expose bien `application`, et `daphne` figure dans `backend/requirements.txt`. Cette commande sert à la fois les requêtes HTTP et les connexions WebSocket via ASGI.

## 7. Migrations

La commande à exécuter après avoir relié le backend à PostgreSQL est :

```sh
python manage.py migrate
```

Ordre recommandé selon le plan choisi :

1. **Si la commande Pre-Deploy est disponible pour le Web Service**, la définir à `python manage.py migrate`. C'est l'option recommandée : Render l'exécute après le build et avant la mise en service de la nouvelle version. Elle pourra rester configurée pour les déploiements suivants.
2. **Avec un Web Service gratuit**, vérifier les fonctionnalités proposées au moment du déploiement. La documentation Render indique actuellement que la commande Pre-Deploy est réservée à certains services payants. Pour le premier déploiement gratuit, ajouter temporairement `&& python manage.py migrate` à la fin de la Build Command, puis déclencher le déploiement :

   ```sh
   pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate
   ```

3. Autre possibilité ponctuelle : lancer `python manage.py migrate` depuis une machine de confiance en utilisant l'URL **externe** de PostgreSQL. Cette méthode impose de protéger strictement l'URL et d'autoriser la connexion ; l'Internal Database URL de Render n'est pas destinée à un poste local.

Ne pas lancer les migrations avant que `DATABASE_URL` pointe vers la base de production. Après l'opération, contrôler les logs et vérifier que toutes les migrations sont appliquées.

## 8. Variables d'environnement du backend

Configurer ces variables dans l'environnement du Web Service, sans les ajouter au repository :

| Variable | Rôle | Exemple générique | Origine de la valeur |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | Signe les sessions et les données cryptographiques Django. | Une nouvelle valeur aléatoire longue, jamais affichée dans ce document. | Générée pour la production et définie manuellement comme secret dans Render. |
| `DJANGO_DEBUG` | Active ou désactive le mode debug. | `False` | Définie manuellement. Toujours `False` en production. |
| `DJANGO_ALLOWED_HOSTS` | Liste séparée par des virgules des hôtes acceptés par Django. | `example.onrender.com` | Définie manuellement lorsque l'hostname réel du backend est connu. |
| `DATABASE_URL` | Chaîne de connexion PostgreSQL lue par `dj-database-url`. | `postgresql://USER:PASSWORD@HOST:PORT/DATABASE` | Fournie par Render Postgres : utiliser l'Internal Database URL dans le Web Service. |
| `REDIS_URL` | Connexion Key Value/Redis utilisée par `channels_redis`. | `redis://USER:PASSWORD@HOST:PORT` | Fournie par Render Key Value : utiliser l'Internal Redis URL dans le Web Service. |

Les exemples ne sont pas des identifiants valides. Utiliser de préférence la fonctionnalité Render permettant de référencer une propriété d'un datastore plutôt que de recopier sa valeur lorsqu'elle est disponible.

## 9. Clé secrète de production

Créer une nouvelle `DJANGO_SECRET_KEY` spécialement pour la production :

- ne jamais réutiliser la clé locale ;
- ne jamais la committer dans Git ;
- ne jamais l'écrire dans cette documentation, une capture d'écran ou un ticket ;
- la stocker uniquement comme variable secrète dans Render et dans un gestionnaire de secrets si une sauvegarde est nécessaire.

## 10. PostgreSQL

Connexion prévue :

```text
Render Postgres
    -> Internal Database URL
    -> DATABASE_URL du Web Service
```

La configuration existante lit `DATABASE_URL`. Quand elle est définie, `dj-database-url` configure automatiquement PostgreSQL. En son absence, le projet utilise SQLite, ce qui convient au local et à la CI mais pas au déploiement Render : le système de fichiers du Web Service n'est pas un stockage durable.

Créer la base seulement au moment opportun, puis injecter son URL interne dans le backend avant les migrations.

## 11. Key Value / Redis

Connexion prévue :

```text
Render Key Value (compatible Redis)
    -> Internal Redis URL
    -> REDIS_URL du Web Service
```

La configuration existante sélectionne automatiquement `channels_redis.core.RedisChannelLayer` quand `REDIS_URL` est définie. Sans cette variable, elle utilise `InMemoryChannelLayer`, adapté au local et à la CI mais pas à plusieurs processus ou instances en production.

## 12. `ALLOWED_HOSTS`

Une fois l'URL publique du backend attribuée par Render, définir uniquement son hostname, sans protocole ni chemin :

```text
DJANGO_ALLOWED_HOSTS=<hostname Render réel>
```

Ne pas inventer cet hostname à l'avance. Si un domaine personnalisé est ajouté plus tard, l'ajouter à la liste séparée par des virgules.

## 13. HTTPS et WebSockets

Schémas à utiliser :

| Environnement | API | WebSocket |
|---|---|---|
| Développement | `http://` | `ws://` |
| Production | `https://` | `wss://` |

Le frontend de production doit donc construire les URL WebSocket avec `wss://`. Les routes actuellement exposées incluent `/ws/notifications/` et `/ws/conversations/<id>/`. Une page servie en HTTPS ne doit pas essayer d'ouvrir une connexion WebSocket non sécurisée en `ws://`.

## 14. Frontend React/Vite

Le frontend pourra être déployé séparément, par exemple comme Static Site Render :

1. utiliser `frontend` comme Root Directory ;
2. installer les dépendances puis lancer le build Vite (`npm ci && npm run build`) ;
3. publier le répertoire produit par Vite, normalement `dist` ;
4. définir, selon la convention qui sera choisie dans le code frontend, l'URL HTTPS publique de l'API backend ;
5. définir l'URL WSS publique du même backend pour les WebSockets ;
6. reconstruire le frontend après toute modification de ses variables de build.

Les noms exacts des variables frontend restent à déterminer lors de son intégration : la configuration actuelle ne définit pas encore de variable Vite dédiée à ces URL. Aucun changement frontend n'est effectué par cette procédure.

## 15. Ordre de déploiement conseillé

1. Créer Render Postgres au dernier moment afin de ne pas démarrer inutilement la période du plan gratuit.
2. Créer Render Key Value dans la région retenue.
3. Créer le Web Service backend depuis `SoahcWeb/5IDEV_Chatbot`, branche `main`, Root Directory `backend`.
4. Définir les cinq variables d'environnement et vérifier qu'aucun secret n'apparaît dans les logs.
5. Lancer le build avec la Build Command proposée.
6. Exécuter les migrations avec la méthode adaptée au plan Render retenu.
7. Tester une route API réelle sous `/api/`, par exemple l'authentification ou la liste des conversations ; `/api/` seul n'est pas actuellement une route dédiée.
8. Tester les connexions `wss://` aux routes de conversation et de notification.
9. Déployer le frontend, puis lui fournir les URL publiques HTTPS et WSS du backend.
10. Effectuer un test de bout en bout avec deux utilisateurs distincts.

## 16. Checklist avant la présentation

- [ ] Base PostgreSQL disponible et non expirée
- [ ] Backend réveillé avant la démonstration
- [ ] Frontend accessible
- [ ] Migrations appliquées
- [ ] Test de connexion utilisateur réussi
- [ ] Test de création/ouverture d'une conversation réussi
- [ ] Test d'envoi et de réception d'un message en temps réel réussi
- [ ] Test de notification réussi
- [ ] Test de `unread_count` réussi
- [ ] Test effectué dans deux navigateurs ou avec deux utilisateurs
- [ ] Connexions WebSocket en `wss://`
- [ ] Aucun secret exposé dans Git, le frontend, les logs ou les captures d'écran

## 17. Limites du plan gratuit

Les conditions Render peuvent évoluer ; les vérifier dans la [documentation officielle des instances gratuites](https://render.com/docs/free) juste avant de créer les services.

- un Web Service gratuit peut s'endormir après une période d'inactivité et subir un délai au premier réveil ; le réveiller avant la présentation ;
- une base PostgreSQL gratuite a une durée de disponibilité limitée ; ne la créer que lorsque le calendrier de présentation est fixé et prévoir la sauvegarde ou le passage à une offre adaptée ;
- une instance Key Value gratuite peut ne pas garantir la persistance des données lors d'un redémarrage ; elle doit servir au transport temps réel, pas comme source de vérité métier ;
- les fonctionnalités accessibles, notamment la commande Pre-Deploy, doivent être revérifiées selon le type de service et le plan choisis.

Références à consulter au moment du déploiement : [déploiements et commande Pre-Deploy](https://render.com/docs/deploys), [déploiement Django](https://render.com/docs/deploy-django) et [Render Key Value](https://render.com/docs/key-value).

## 18. Contrôle final le jour du déploiement

Avant la présentation :

1. relire les conditions du plan Render en vigueur ;
2. confirmer les URL internes PostgreSQL et Key Value ;
3. confirmer l'hostname public et `DJANGO_ALLOWED_HOSTS` ;
4. contrôler les logs du build, des migrations et du démarrage Daphne ;
5. exécuter toute la checklist avec deux utilisateurs ;
6. conserver un plan de repli si un service gratuit met du temps à se réveiller.
