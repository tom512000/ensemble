# Ensemble

Un hub de mini-jeux coopératifs en temps réel. Le premier jeu, **À sa place**, consiste à ranger
des objets en verre dans les bacs de leur couleur. Les deux navigateurs jouent contre le même état
serveur, avec des curseurs partagés et des prises exclusives.

## Stack et structure

- Node.js 24 recommandé (minimum 22.12), npm workspaces.
- React 19, Vite 7, TypeScript strict, React Router, CSS et SVG originaux.
- Fastify 5, Socket.IO 4, Zod 4.
- PostgreSQL 17, Drizzle ORM ; aucun Redis pour cette première version.

```text
apps/web/src/
  components/       Interface commune et illustrations
  pages/            Hub, navigateur de rooms, lobby et invitation
  lib/              Session invitée, réponses HTTP robustes, connexion temps réel
  games/sorting/    Plateau et moteur de rendu / interactions
apps/web/test/      Tests des réponses HTTP dégradées
apps/server/src/
  platform/         Sessions, rooms, permissions, budgets réseau
  games/            Interface GameDefinition et règles du rangement
  db/               Schéma, migrations et file de résultats
  transport.ts      Adaptation Socket.IO aux services métier
packages/shared/    Types, schémas Zod, événements, couleurs et coordonnées
e2e/                Scénarios avec deux contextes navigateur et écran tactile
infra/              Reverse proxy de production
docs/               Architecture et déploiement
```

Les décisions et limites sont détaillées dans [docs/architecture.md](docs/architecture.md).
La progression se trouve dans [TODO.md](TODO.md).

## Démarrage local

Prérequis : Node, npm et Docker Desktop en fonctionnement. Sur Windows, utilisez **npm.cmd**
si la politique PowerShell bloque npm.ps1. Aucun changement de politique système n’est nécessaire.

```sh
npm install
cp .env.example .env
docker compose up -d db
npm run db:migrate
npm run dev
```

En PowerShell, remplacer `cp` par `Copy-Item .env.example .env`, et `npm` par `npm.cmd`.
Le frontend est sur **http://localhost:5175**, le serveur sur **http://localhost:3005**,
PostgreSQL sur **localhost:55432**. Le port 55432 évite un conflit avec d’autres bases locales.

`npm run dev` compile d’abord le package partagé, puis lance ses types en watch, le serveur
avec tsx et le frontend avec Vite. Pour les lancer séparément, après `npm run build -w @ensemble/shared` :

```sh
npm run dev -w @ensemble/server
npm run dev -w @ensemble/web
```

Vite relaie `/api` et `/socket.io` au backend. Laisser les deux variables VITE vides en local.
Sans DATABASE_URL, le mode développement reste jouable, mais ne conserve pas les résultats.
En production, DATABASE_URL est obligatoire.

## Configuration

| Variable          | Usage                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| NODE_ENV          | development, test ou production                                               |
| HOST / PORT       | Adresse et port d’écoute du serveur ; 0.0.0.0 / 3005 par défaut               |
| CLIENT_ORIGIN     | Origines HTTP(S) exactes séparées par des virgules, sans slash final          |
| DATABASE_URL      | Connexion PostgreSQL ; utiliser les exigences TLS du fournisseur              |
| LOG_LEVEL         | Niveau des logs JSON : info par défaut                                        |
| TRUST_PROXY       | false par défaut ; true seulement derrière un proxy maîtrisé                  |
| MAX_ROOMS         | Limite des tables simultanées, 500 par défaut                                 |
| VITE_API_URL      | Origine de l’API quand le frontend est hébergé séparément                     |
| VITE_WS_URL       | Origine du serveur Socket.IO quand il est hébergé séparément                  |
| POSTGRES_PASSWORD | Mot de passe du PostgreSQL Docker ; remplacer ensemble_dev hors développement |

Le serveur et Vite chargent le `.env` racine. Les variables VITE sont publiques et fixées
au build : **aucun secret** dans une variable commençant par VITE. Ne pas versionner `.env`.

## Réglages d’une partie

L’hôte choisit tout à la création, puis peut encore ajuster dans le lobby :

| Réglage           | Valeurs | Effet                                                                                                                                                                                        |
| ----------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objets à ranger   | 6 à 300 | Plafond mesuré, pas deviné : voir [docs/architecture.md](docs/architecture.md). Les objets rétrécissent à mesure que le plateau se remplit, en gardant un écart qui les laisse saisissables. |
| Places à la table | 2 à 8   | Ne peut pas descendre sous le nombre de joueurs déjà présents.                                                                                                                               |
| Couleurs          | 3 à 6   | Autant de bacs que de couleurs.                                                                                                                                                              |
| Variété d’objets  | 1 à 6   | Bouteille, bocal, canette, flacon, brique, tube. La forme est décorative : seule l’étiquette dit où va l’objet.                                                                              |

Chaque manche est disposée par le serveur : les bacs sont tirés au hasard le long des quatre
bords et les objets sont éparpillés sans alignement, avec une inclinaison légère qui se redresse
dès qu’on les attrape ou qu’ils sont rangés. Deux manches ne se ressemblent donc jamais, et les
deux navigateurs voient exactement la même disposition.

## Vérifier le vrai multijoueur

1. Ouvrir le site, choisir un pseudo, créer une table : 30 objets, 4 places.
2. Copier le lien d’invitation depuis le lobby.
3. Ouvrir le lien dans un autre navigateur, profil ou fenêtre privée, avec un autre pseudo.
4. Observer les deux joueurs dans le lobby puis démarrer.
5. Déplacer une bouteille ; vérifier son mouvement et le curseur chez l’autre joueur.
6. Essayer de prendre la même bouteille : une seule prise est autorisée.
7. Rafraîchir une page pendant une prise : la bouteille se libère et le joueur revient.
8. Ranger les bouteilles ; la victoire apparaît chez tous les joueurs.

Une identité invitée est conservée en **sessionStorage**, avec un jeton secret distinct de
l’identifiant public. Un rafraîchissement conserve l’identité. Une nouvelle fenêtre privée crée
une identité indépendante. Si un navigateur duplique aussi le sessionStorage, la seconde connexion
remplace la première ; l’interface explique la situation et permet de choisir un nouveau pseudo.

Souris / trackpad / tactile : glisser-déposer. Clavier : Tab vers une bouteille, Entrée pour la prendre,
Tab vers un bac, Entrée pour la déposer. Échap annule. Les symboles complètent les couleurs.
Sur petit écran, le plateau entier reste visible ; le mode paysage rend les bouteilles plus faciles à saisir.

## Tests et qualité

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
npm run test:e2e
```

Installer Chromium une première fois si nécessaire : `npx playwright install chromium`.
Playwright démarre les serveurs si nécessaire. Le premier scénario joue une manche de 30 bouteilles
avec deux contextes isolés de tailles différentes, vérifie le curseur, le mouvement, un rafraîchissement
pendant une prise, un mauvais dépôt, la victoire partagée et le retour au lobby. Le second vérifie
l’affichage mobile et un vrai flux d’événements tactiles Chromium. Les captures sont dans `test-results/`.

La persistance PostgreSQL se vérifie séparément, avec une base de test explicite :

```sh
TEST_DATABASE_URL=postgresql://ensemble:ensemble_dev@localhost:55432/ensemble npm run test:db -w @ensemble/server
```

Ce test insère une manche, contrôle les données et l'idempotence, puis supprime sa ligne.
Il exige `TEST_DATABASE_URL` afin de ne jamais écrire dans une base réelle par mégarde.

Les tests Vitest vérifient le métier et ouvrent de vraies sockets sur un port temporaire.
Ils ne nécessitent pas PostgreSQL. Les commandes et mouvements possèdent des limites distinctes ;
les tests navigateur utilisent une cadence réaliste.

## Base de données et migrations

Le schéma versionné se trouve dans `apps/server/src/db/schema.ts`.
La table `game_results` contient un UUID de manche, la room, les réglages, les joueurs et leurs
contributions, les dates et la durée. Le secret de session n’y est jamais écrit.

```sh
npm run db:generate
npm run db:migrate
```

La première commande s’utilise après une modification du schéma ; committer la migration SQL
et ses métadonnées. La seconde applique uniquement les migrations en attente.
Les insertions sont idempotentes par UUID de manche. Une file bornée réessaie les erreurs
de persistance toutes les cinq secondes. Aucun mouvement ni curseur n’est écrit en base.

## Protocole et fluidité

- `command` : union Zod stricte de room:create/join/leave/update/sync, game:start/restart,
  bottle:grab/release/cancel. Les commandes sont acquittées et dédupliquées par requestId.
- `motion` : cursor:move ou bottle:move, volatils, avec séquences croissantes.
- `room:state` : snapshot complet lors d’une arrivée, reconnexion ou transition de room.
- `bottle:state` : uniquement la bouteille modifiée et les contributions des joueurs.
- `rooms:list` : mise à jour des tables pour les invités connectés.
- `session:ready`, `session:replaced`, `room:closed`, `app:error` : cycle de vie.

Le mouvement local est affiché immédiatement, avant l’accusé de prise. Il est envoyé après accord
du serveur. Un refus réconcilie le rendu. Les flux sont plafonnés à **25 mises à jour/s chacun** ;
un heartbeat renouvelle un drag immobile. Les autres clients interpolent par requestAnimationFrame.
React ne reçoit pas de mise à jour à chaque mouvement. Les paquets volatils ne sont pas accumulés
pendant une coupure.

Le plateau a un ratio **12:7** et utilise des coordonnées **[0,1] × [0,1]** calculées relativement
à son propre rectangle. Les bacs partagent exactement les mêmes limites entre client et serveur.
Chaque verrou possède un propriétaire, un dragId unique et un bail de trois secondes.
Déconnexion, annulation et expiration le libèrent. Une place est réservée trente secondes après
une coupure ; les autres joueurs voient ce statut. Une room vide est supprimée ; sa durée maximale
est de quatre heures. Une partie commencée accepte les reconnexions de ses membres, pas de nouveaux joueurs.

## Production

Voir [docs/deployment.md](docs/deployment.md). Le dépôt inclut un Dockerfile à plusieurs étapes,
PostgreSQL, un job de migration et un reverse proxy compatible WebSocket.

```sh
docker compose up --build -d
```

L’application conteneurisée est disponible sur **http://localhost:8085**.
Les serveurs de développement doivent être arrêtés avant ce lancement complet (le backend partage 3005).
Pour une origine locale sur 8085, ajuster CLIENT_ORIGIN dans le `.env` à
`http://localhost:8085,http://127.0.0.1:8085`.

- `GET /api/health` : processus vivant.
- `GET /api/ready` : table PostgreSQL accessible et taille de la file de résultats.
- Arrêt gracieux sur SIGINT / SIGTERM.
- Logs JSON, validation stricte, CORS, contrôle Origin WebSocket, limites HTTP / Socket.IO.

## Limites explicites du MVP

Une seule instance possède les parties et sessions en mémoire. Un redémarrage termine les parties
actives ; seuls les résultats déjà écrits restent durables. La file de réessai des résultats est
elle aussi en mémoire : une panne simultanée de la DB et du processus peut perdre les résultats
en attente. Ajouter une outbox durable si cette garantie devient nécessaire.

Pas de comptes, d’amis, de chat, de matchmaking automatique, de mode spectateur ni d’expulsion :
les erreurs du protocole sont préparées pour évoluer, mais ces fonctions ne sont pas simulées.
L’audio reste une extension future du feedback de prise / rangement / victoire. Le catalogue
marque les futurs jeux comme indisponibles.

Avant de multiplier les instances, ajouter le stockage des sessions, une autorité unique par room
et un adapter pub/sub. **Un adapter Socket.IO Redis seul ne partage pas le moteur de jeu.**

## Notes de maintenance

`npm audit --omit=dev` ne signale aucune vulnérabilité : c'est le périmètre livré. L'audit complet
signale un esbuild ancien tiré par `drizzle-kit`, un outil de développement absent de l'image de
production. Le raisonnement et la raison de ne pas lancer `npm audit fix --force` sont détaillés
dans [docs/deployment.md](docs/deployment.md).

Le paquet partagé se compile en mode incrémental. Son observateur ne réécrit donc pas `dist` au
démarrage, ce qui évite un redémarrage inutile du serveur `tsx watch` juste après `npm run dev`
et la coupure de connexion qui en découlait pendant les tests de bout en bout.
