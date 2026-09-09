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
Les coordonnées sont calculées depuis le rectangle du plateau, jamais depuis la fenêtre, et ce
rectangle est mis en cache : le lire à chaque déplacement du pointeur forçait un recalcul de mise
en page de tous les objets. Les positions rangées sont calculées par le serveur dans le bac
correspondant.

Les bacs ne sont plus une rangée fixe : ils sont tirés au hasard le long des quatre bords, donc
ils font partie de l'état de la manche diffusé par le serveur (`SortingState.bins`) au lieu d'être
recalculés par chaque client. Un candidat est rejeté s'il chevauche un bac déjà posé, y compris
sur un autre bord — deux bords se rencontrent dans un coin. Si les tirages échouent, le bord est
balayé de bout en bout, puis les autres bords : une manche ne peut jamais échouer à se disposer.

Les objets sont répartis par échantillonnage stratifié : une cellule par objet, avec une secousse
bornée à l'intérieur d'une boîte de sécurité. Le résultat paraît désordonné tout en garantissant
un écart minimal entre voisins. Cet écart n'est pas cosmétique : la demi-hauteur d'un objet vaut
0,78 fois sa largeur, donc un écart de 0,9 largeur garantit que **le centre d'un objet n'est
jamais recouvert par un voisin**, et donc qu'il reste saisissable. La taille des cellules part de
l'écart idéal et diminue jusqu'à ce qu'assez de cellules tombent hors des bacs. Une bouteille a au plus un propriétaire,
un jeton de drag unique et un bail de 3 secondes, renouvelé par mouvement/heartbeat. Le jeton
empêche un vieux paquet d’un drag précédent de modifier un nouveau drag du même joueur.
Un sweep expire les verrous et les présences. Annulation, perte de focus et déconnexion libèrent
les prises. Une prise optimiste est visuelle seulement ; un refus serveur restaure la position.

## Nombre d'objets et performance

La limite de 300 objets est mesurée, pas devinée. Le protocole : bundle de production servi par
`vite preview`, CPU bridé via CDP, un objet tenu et le pointeur promené sur le plateau, puis
mesure des intervalles entre images.

| Objets | CPU x1            | CPU x4            | CPU x6               |
| -----: | ----------------- | ----------------- | -------------------- |
|    200 | 60 fps            | 60 fps            | 60 fps, 9 % > 32 ms  |
|    300 | 60 fps, p95 17 ms | 60 fps, p95 50 ms | 60 fps, 13 % > 32 ms |
|    400 | 60 fps            | 60 fps            | **44 % > 32 ms**     |

La rupture se situe entre 300 et 400 sur une machine lente, d'où le plafond à 300 : la médiane
reste à 60 fps même bridée six fois, avec de la marge pour le trafic d'une table pleine.

Trois corrections ont rendu ce plafond possible, et la mesure a été nécessaire pour les trouver :

- La boucle d'animation cherchait chaque objet dans un tableau, **à l'intérieur** de la boucle sur
  tous les objets : un coût en O(n²) par image. Un index par identifiant a fait passer 450 objets
  de 15 à 60 images par seconde.
- Chaque image réécrivait quatre propriétés DOM par objet, même immobile. Les valeurs écrites sont
  désormais mémorisées et l'écriture est sautée si rien n'a changé.
- L'horloge de la partie était dans le composant du plateau : son tic reconstruisait chaque
  seconde les éléments des centaines d'objets. Elle est isolée dans son propre composant.

`will-change: transform` a été retiré des objets : sur un plateau chargé, il promouvait des
centaines de couches de composition et coûtait bien plus qu'il ne rapportait.

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
