# Architecture d’Ensemble

```text
React / Vite (apps/web)
  ├── plateforme : session, navigation, rooms, lobby, connexion
  └── jeu sorting : plateau, Pointer Events, animation par requestAnimationFrame
             │ HTTP + Socket.IO ; contrats Zod (packages/shared)
Fastify (apps/server)
  ├── plateforme : sessions, RoomManager, permissions, transport, rate limits
  ├── GameDefinition → moteur sorting autoritaire
  └── ResultRepository → Drizzle → PostgreSQL (parties terminées)
```

## Décisions

Un seul processus serveur possède les rooms actives. Npm workspaces garde les outils simples.
React gère les pages et les changements durables ; les déplacements utilisent des refs et des
transformations CSS dans une boucle requestAnimationFrame. CSS et SVG locaux composent l’identité
visuelle, sans bibliothèque de drag ni assets externes. Drizzle conserve un schéma SQL explicite.

## Données et protocole

Une session invitée possède un identifiant public, un pseudo validé et un jeton secret aléatoire
distinct de l’identifiant. Le jeton est conservé en sessionStorage (une identité par onglet).
Une room possède UUID, code de six caractères, gameId, hostId, statut, dates, paramètres et membres.
Une seule room par session. Une seule connexion active par session : une seconde remplace la première.
Les membres déconnectés gardent leur place 30 secondes ; les verrous sont libérés immédiatement.
L’hôte est transféré à un membre connecté après départ ou expiration. Une room vide est supprimée.

`command` est une union discriminée Zod : room:create/join/leave/update/sync, game:start/restart,
bottle:grab/release/cancel. Chaque commande comporte un requestId UUID, un accusé de réception,
un cache de déduplication borné et une validation serveur. `motion` transporte cursor:move et
bottle:move avec un numéro de séquence ; les événements sont volatils et limités à 25 Hz par flux
côté client. Le serveur applique aussi des budgets distincts pour commandes et mouvements.
`room:state` synchronise lobby / transitions ; `bottle:state` ne transmet que la bouteille modifiée.
`motion` sortant ne transporte que les identifiants et coordonnées nécessaires.
`rooms:list` actualise le navigateur de rooms. La reconnexion demande un snapshot complet :
aucune dépendance à la livraison des messages perdus pendant la coupure.

## Coordonnées et verrous

Le monde logique est normalisé [0,1] × [0,1], affiché dans un plateau au ratio fixe 12:7.
Les coordonnées sont calculées depuis le rectangle du plateau, jamais depuis la fenêtre.
Les zones de dépôt sont définies dans shared et revérifiées sur le serveur. Les positions rangées
sont calculées par le serveur dans le bac correspondant. Une bouteille a au plus un propriétaire,
un jeton de drag unique et un bail de 3 secondes, renouvelé par mouvement/heartbeat. Le jeton
empêche un vieux paquet d’un drag précédent de modifier un nouveau drag du même joueur.
Un sweep expire les verrous et les présences. Annulation, perte de focus et déconnexion libèrent
les prises. Une prise optimiste est visuelle seulement ; un refus serveur restaure la position.

## Persistance et évolution

PostgreSQL conserve les résultats, paramètres, dates et contributions des joueurs. Ni curseurs ni
positions intermédiaires n’y sont écrits. Une file bornée réessaie les écritures échouées et les
INSERT sont idempotents par identifiant de manche. La disponibilité de la DB est exposée par readiness.
Les parties actives et les sessions sont perdues au redémarrage du processus (limite explicite du MVP).
Avant plusieurs instances : ajouter une autorité unique par room (routage/sharding), stockage des
sessions et snapshots dans Redis, puis adapter Socket.IO pour pub/sub. Un adapter seul ne partage
pas le moteur en mémoire. Les interfaces de jeu et de persistance restent séparées du transport.

## Références

- https://socket.io/docs/v4/delivery-guarantees/
- https://socket.io/docs/v4/client-offline-behavior/
- https://orm.drizzle.team/docs/get-started-postgresql
- https://vite.dev/guide/
