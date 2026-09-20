# API REST et WebSockets

## 1. Présentation générale

Le backend expose une API REST construite avec Django REST Framework et deux canaux WebSocket construits avec Django Channels :

- l'API REST gère les comptes, les conversations, leurs membres, les messages et le marquage comme lu ;
- l'authentification REST utilise un token DRF dans l'en-tête HTTP `Authorization` ;
- le WebSocket d'une conversation permet d'envoyer un message, de recevoir les nouveaux messages en temps réel et de marquer la conversation comme lue ;
- le WebSocket global de notifications informe un utilisateur des messages envoyés par d'autres membres et transmet le compteur de non-lus de la conversation concernée.

Toutes les routes REST sont authentifiées par défaut, sauf l'inscription et la connexion. Les exemples ci-dessous utilisent uniquement des identifiants et tokens fictifs.

## 2. URL de base

En développement local :

```text
http://localhost:8000
```

Les chemins REST indiqués dans ce document sont relatifs à cette URL. Les WebSockets locaux utilisent `ws://localhost:8000`.

## 3. Authentification

### En-tête REST

Après l'inscription ou la connexion, envoyer le token sur chaque route protégée :

```http
Authorization: Token abc123example
Content-Type: application/json
```

Un token absent, invalide ou supprimé lors de la déconnexion produit une réponse `401 Unauthorized` sur une route protégée.

### Format d'un utilisateur

Les endpoints d'authentification renvoient un utilisateur sous cette forme :

```json
{
  "id": 1,
  "username": "alice",
  "email": "alice@example.test",
  "first_name": "Alice",
  "last_name": "Example",
  "created_at": "2026-01-15T10:30:00Z"
}
```

Les dates sont sérialisées par Django REST Framework. Le mot de passe n'est jamais renvoyé.

### Inscription

`POST /api/auth/register/` — authentification non requise.

Corps :

```json
{
  "username": "alice",
  "email": "alice@example.test",
  "password": "ExamplePassword123!",
  "password_confirm": "ExamplePassword123!"
}
```

Réponse `201 Created` :

```json
{
  "token": "abc123example",
  "user": {
    "id": 1,
    "username": "alice",
    "email": "alice@example.test",
    "first_name": "",
    "last_name": "",
    "created_at": "2026-01-15T10:30:00Z"
  }
}
```

Codes observables :

| Code | Signification |
| --- | --- |
| `201` | Utilisateur créé et token renvoyé. |
| `400` | Données invalides : champs manquants, email déjà utilisé, mots de passe différents ou mot de passe refusé par les validateurs Django. |

### Connexion

`POST /api/auth/login/` — authentification non requise.

Corps :

```json
{
  "username": "alice",
  "password": "ExamplePassword123!"
}
```

Réponse `200 OK` : même structure `{ "token": ..., "user": ... }` que l'inscription. Le token existant de l'utilisateur est réutilisé s'il existe déjà.

| Code | Signification |
| --- | --- |
| `200` | Identifiants valides. |
| `400` | `username` ou `password` absent ; la réponse contient `{"detail":"Username and password are required."}`. |
| `401` | Identifiants invalides ; la réponse contient `{"detail":"Invalid username or password."}`. |

### Utilisateur courant

`GET /api/auth/me/` — token requis.

Le corps de la requête est vide. La réponse `200 OK` contient directement l'objet utilisateur décrit plus haut.

| Code | Signification |
| --- | --- |
| `200` | Utilisateur authentifié renvoyé. |
| `401` | Token absent ou invalide. |

### Déconnexion

`POST /api/auth/logout/` — token requis.

Le corps est vide. La réponse `204 No Content` n'a pas de corps et le token utilisé est supprimé.

| Code | Signification |
| --- | --- |
| `204` | Déconnexion effectuée. |
| `401` | Token absent ou invalide. |

## 4. Conversations

Toutes les routes de cette section exigent l'en-tête `Authorization: Token abc123example`.

### Format d'une conversation

```json
{
  "id": 12,
  "type": "group",
  "name": "Projet",
  "created_by": 1,
  "created_at": "2026-01-15T10:30:00Z",
  "updated_at": "2026-01-15T10:45:00Z",
  "members": [
    {
      "id": 21,
      "user": 1,
      "username": "alice",
      "role": "admin",
      "joined_at": "2026-01-15T10:30:00Z"
    },
    {
      "id": 22,
      "user": 2,
      "username": "bob",
      "role": "member",
      "joined_at": "2026-01-15T10:30:00Z"
    }
  ],
  "unread_count": 0
}
```

`type` vaut `private` ou `group`. Les rôles de membre valent `member` ou `admin`. À la création d'un groupe, son créateur devient `admin` et les autres utilisateurs deviennent `member`. Une conversation privée crée deux membres avec le rôle par défaut `member`.

`unread_count` compte, pour l'utilisateur authentifié, les messages des autres auteurs créés après son dernier marquage comme lu. Ses propres messages ne sont pas comptés.

### Liste des conversations

`GET /api/conversations/`

Corps vide. Réponse `200 OK` : tableau non paginé de conversations auxquelles appartient l'utilisateur, triées par `updated_at` décroissant, avec membres et `unread_count`.

```json
[
  {
    "id": 12,
    "type": "group",
    "name": "Projet",
    "created_by": 1,
    "created_at": "2026-01-15T10:30:00Z",
    "updated_at": "2026-01-15T10:45:00Z",
    "members": [],
    "unread_count": 2
  }
]
```

Codes : `200` si la liste est accessible, `401` sans token valide.

### Détail d'une conversation

`GET /api/conversations/<conversation_id>/`

Corps vide. Réponse `200 OK` : une conversation au format ci-dessus.

| Code | Signification |
| --- | --- |
| `200` | Conversation renvoyée. |
| `401` | Token absent ou invalide. |
| `404` | Conversation inexistante ou utilisateur non membre. |

### Création ou récupération d'une conversation privée

`POST /api/conversations/private/`

```json
{
  "user_id": 2
}
```

La réponse contient une conversation complète. Si aucune conversation privée n'existe déjà entre les deux utilisateurs, elle est créée et le code est `201 Created`. Si la paire existe déjà, elle est réutilisée et le code est `200 OK`.

| Code | Signification |
| --- | --- |
| `200` | Conversation privée existante renvoyée. |
| `201` | Conversation privée créée. |
| `400` | Utilisateur inconnu, champ invalide ou tentative de conversation avec soi-même. |
| `401` | Token absent ou invalide. |

### Création d'un groupe

`POST /api/conversations/group/`

```json
{
  "name": "Projet",
  "member_ids": [2, 3]
}
```

`member_ids` est facultatif. Le créateur est ajouté automatiquement, même s'il apparaît dans la liste. Les doublons dans `member_ids` sont refusés. La réponse `201 Created` est la conversation complète.

| Code | Signification |
| --- | --- |
| `201` | Groupe créé. |
| `400` | Nom vide, utilisateur inconnu, identifiants dupliqués ou données invalides. |
| `401` | Token absent ou invalide. |

### Ajouter un membre

`POST /api/conversations/<conversation_id>/members/`

Réservé à un membre ayant le rôle `admin` dans un groupe.

```json
{
  "user_id": 4
}
```

La réponse `201 Created` contient la conversation complète mise à jour.

| Code | Signification |
| --- | --- |
| `201` | Membre ajouté. |
| `400` | Conversation privée, utilisateur déjà membre, utilisateur inconnu ou données invalides. |
| `401` | Token absent ou invalide. |
| `403` | Utilisateur membre mais non administrateur. |
| `404` | Conversation inexistante ou utilisateur non membre. |

### Retirer un membre

`DELETE /api/conversations/<conversation_id>/members/<user_id>/`

Réservé à un administrateur d'un groupe. La réponse `204 No Content` n'a pas de corps. Le dernier administrateur d'un groupe ne peut pas être retiré.

| Code | Signification |
| --- | --- |
| `204` | Membre retiré. |
| `400` | Conversation privée ou tentative de retirer le dernier administrateur. |
| `401` | Token absent ou invalide. |
| `403` | Utilisateur membre mais non administrateur. |
| `404` | Conversation, appartenance de l'appelant ou membre ciblé introuvable. |

Il n'existe actuellement aucun endpoint pour changer explicitement le rôle d'un membre.

### Marquer une conversation comme lue

`POST /api/conversations/<conversation_id>/read/`

Le corps est vide. Le serveur enregistre l'instant de lecture dans l'appartenance de l'utilisateur.

Réponse `200 OK` :

```json
{
  "conversation": 12,
  "unread_count": 0
}
```

Codes : `200` pour un membre, `401` sans token valide, `404` si l'utilisateur n'est pas membre ou si la conversation n'existe pas.

Il n'existe pas d'endpoint séparé pour le compteur : celui-ci est fourni par la liste et le détail des conversations, puis par les notifications WebSocket.

## 5. Messages REST

### Format d'un message

```json
{
  "id": 35,
  "conversation": 12,
  "author": 1,
  "username": "alice",
  "content": "Bonjour !",
  "created_at": "2026-01-15T10:45:00Z",
  "updated_at": "2026-01-15T10:45:00Z"
}
```

L'auteur et la conversation sont déterminés par le serveur ; ils ne sont pas modifiables par le client.

### Lister les messages

`GET /api/conversations/<conversation_id>/messages/` — réservé aux membres de la conversation.

Paramètres de requête :

| Paramètre | Description |
| --- | --- |
| `page` | Numéro de page. |
| `page_size` | Taille de page, `20` par défaut et `100` au maximum. |

Les messages sont classés du plus ancien au plus récent (`created_at`, puis `id`). Réponse `200 OK` paginée :

```json
{
  "count": 21,
  "next": "http://localhost:8000/api/conversations/12/messages/?page=2",
  "previous": null,
  "results": [
    {
      "id": 35,
      "conversation": 12,
      "author": 1,
      "username": "alice",
      "content": "Bonjour !",
      "created_at": "2026-01-15T10:45:00Z",
      "updated_at": "2026-01-15T10:45:00Z"
    }
  ]
}
```

Codes : `200`, `401` sans token valide, `404` pour une conversation inexistante ou dont l'utilisateur n'est pas membre.

### Envoyer un message par REST

`POST /api/conversations/<conversation_id>/messages/` — réservé aux membres.

```json
{
  "content": "Bonjour !"
}
```

Le contenu est débarrassé de ses espaces de début et de fin et ne peut pas être vide. La réponse `201 Created` est le message complet.

Codes : `201`, `400` si le contenu est absent/vide/invalide, `401` sans token valide, `404` si la conversation est inaccessible.

> L'implémentation REST enregistre le message, mais ne publie pas elle-même d'événement Channels. Pour obtenir `message.created` et `notification.message` en temps réel, le client doit envoyer le message avec le WebSocket de conversation décrit ci-dessous.

### Consulter, modifier ou supprimer un message

| Méthode et URL | Permission | Succès |
| --- | --- | --- |
| `GET /api/messages/<message_id>/` | Tout membre de la conversation | `200`, message complet |
| `PATCH /api/messages/<message_id>/` | Auteur uniquement | `200`, message mis à jour |
| `DELETE /api/messages/<message_id>/` | Auteur uniquement | `204`, corps vide |

Corps d'une modification :

```json
{
  "content": "Contenu corrigé"
}
```

Codes communs : `400` pour un contenu vide/invalide, `401` sans token valide, `403` lorsqu'un membre autre que l'auteur tente une modification ou suppression, `404` si le message est inexistant ou extérieur aux conversations de l'utilisateur. La méthode `PUT` n'est pas autorisée.

## 6. WebSocket d'une conversation

### Connexion et authentification

Route locale exacte :

```text
ws://localhost:8000/ws/conversations/<conversation_id>/?token=abc123example
```

Le token DRF est lu depuis le paramètre de requête `token`. La connexion est acceptée uniquement si le token est valide et si l'utilisateur appartient à la conversation.

| Code de fermeture à la connexion | Cause |
| --- | --- |
| `4401` | Token absent ou invalide. |
| `4403` | Utilisateur authentifié mais non membre. |
| `4404` | Conversation inexistante. |

### Envoyer un message

Client vers serveur :

```json
{
  "type": "message.send",
  "content": "Bonjour !"
}
```

Le serveur fixe l'auteur depuis le token et la conversation depuis l'URL. Les éventuels champs `author` ou `conversation` fournis par le client sont ignorés.

Serveur vers tous les sockets connectés à cette conversation, y compris celui de l'expéditeur :

```json
{
  "type": "message.created",
  "message": {
    "id": 35,
    "conversation": 12,
    "author": 1,
    "username": "alice",
    "content": "Bonjour !",
    "created_at": "2026-01-15T10:45:00Z",
    "updated_at": "2026-01-15T10:45:00Z"
  }
}
```

### Marquer comme lu

Client vers serveur :

```json
{
  "type": "conversation.read"
}
```

Réponse envoyée uniquement au socket demandeur :

```json
{
  "type": "conversation.read",
  "conversation": 12,
  "unread_count": 0
}
```

### Erreurs applicatives

Les erreurs après connexion conservent le socket ouvert et suivent ce format :

```json
{
  "type": "error",
  "code": "invalid_message",
  "detail": "Message content cannot be empty."
}
```

| `code` | Situation |
| --- | --- |
| `invalid_payload` | Trame non JSON, valeur JSON autre qu'un objet, ou `content` non textuel. |
| `unsupported_event` | `type` différent de `message.send` et `conversation.read`. |
| `invalid_message` | Contenu refusé par le serializer, notamment vide après suppression des espaces. |
| `forbidden` | L'appartenance n'existe plus au moment de traiter `conversation.read`. |

Aucun événement de présence, d'écriture en cours, de modification ou de suppression de message n'est implémenté.

## 7. WebSocket global des notifications

Route locale exacte :

```text
ws://localhost:8000/ws/notifications/?token=abc123example
```

Le token DRF est obligatoire. Un token absent ou invalide ferme la connexion avec le code `4401`. Ce WebSocket est actuellement serveur vers client uniquement : les données envoyées par le client sont ignorées.

Lorsqu'un message est créé par `message.send`, chaque autre membre de la conversation connecté à son WebSocket global reçoit :

```json
{
  "type": "notification.message",
  "conversation": 12,
  "message": {
    "id": 35,
    "conversation": 12,
    "author": 1,
    "username": "alice",
    "content": "Bonjour !",
    "created_at": "2026-01-15T10:45:00Z",
    "updated_at": "2026-01-15T10:45:00Z"
  },
  "unread_count": 3
}
```

`unread_count` est le compteur de la conversation indiquée pour le destinataire. L'expéditeur ne reçoit pas cette notification globale. Chaque destinataire reçoit son propre compteur, calculé selon son dernier marquage comme lu.

## 8. Exemple de scénario complet

1. A appelle `POST /api/auth/login/` et récupère un token fictif ; B fait de même.
2. A appelle `POST /api/conversations/private/` avec `{"user_id": 2}`. La conversation est créée (`201`) ou réutilisée (`200`).
3. A et B ouvrent chacun `ws://localhost:8000/ws/conversations/12/?token=<leur_token>`.
4. B ouvre aussi `ws://localhost:8000/ws/notifications/?token=<token_de_B>`.
5. A envoie sur le WebSocket de conversation `{"type":"message.send","content":"Bonjour !"}`.
6. Tous les sockets connectés à la conversation, dont ceux de A et B, reçoivent `message.created` avec le message complet.
7. Le WebSocket global de B reçoit `notification.message` avec `conversation`, `message` et le nouveau `unread_count`. A ne reçoit pas sa propre notification globale.
8. Quand B ouvre effectivement la conversation, il envoie `{"type":"conversation.read"}` sur son WebSocket de conversation, ou appelle `POST /api/conversations/12/read/`.
9. B reçoit une confirmation indiquant `"unread_count": 0`. Les prochains appels à la liste ou au détail de la conversation renvoient également le compteur mis à jour.

## 9. Sécurité

- Ne jamais afficher, journaliser ou partager de vrais tokens dans la documentation, les captures d'écran ou le code frontend.
- Ne jamais versionner un fichier `.env`.
- Utiliser `https://` pour l'API REST en production.
- Utiliser `wss://` pour les WebSockets en production : les tokens sont actuellement placés dans la query string et peuvent sinon être exposés dans des journaux intermédiaires.
- L'origine WebSocket est contrôlée par `AllowedHostsOriginValidator`; ce document n'ajoute aucune hypothèse sur les hôtes de production autorisés.

## 10. Limites actuelles du contrat documentable

- Aucun endpoint ne permet de changer le rôle d'un membre.
- Aucun endpoint REST distinct ne renvoie uniquement le compteur global de non-lus ; les compteurs sont associés aux conversations.
- Le WebSocket global n'accepte aucun événement client utile pour le moment.
- Le code ne définit pas d'événements temps réel pour la présence, la saisie, la modification ou la suppression de messages.
- La création d'un message par REST ne déclenche pas les événements WebSocket présents dans le consumer.
- Aucun format métier personnalisé n'est défini pour certaines erreurs DRF génériques (champ requis, type incorrect, méthode non autorisée) ; leur enveloppe suit donc le comportement standard de Django REST Framework.
