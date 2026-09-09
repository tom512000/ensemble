# Déployer Ensemble

## Déploiement Docker sur un serveur

Le déploiement fourni comprend PostgreSQL, un job de migrations, le serveur Node et Nginx
pour les fichiers React et le proxy WebSocket. Aucun fournisseur n’est requis.

1. Installer Docker sur le serveur cible et y copier le dépôt ou son checkout Git.
2. Créer le `.env` de production, choisir un mot de passe PostgreSQL, et configurer
   CLIENT_ORIGIN avec l’origine HTTPS publique exacte.
3. Mettre un reverse proxy TLS devant le port 8085 (certificat du domaine).
   Le navigateur doit accéder à l’application par HTTPS pour le presse-papiers et crypto.randomUUID.
4. Lancer `docker compose up --build -d`. Le backend attend le succès des migrations.
5. Vérifier `/api/health`, `/api/ready`, puis une partie depuis deux appareils.
6. Configurer une sauvegarde PostgreSQL et la supervision des erreurs / readiness.

Ne pas exposer PostgreSQL publiquement. Le compose le lie à 127.0.0.1 pour le développement
et les opérations locales. Les mots de passe de démonstration doivent être remplacés.
Le Dockerfile exécute Node et Nginx sans utilisateur root.

Le Nginx interne écrase X-Forwarded-For. TRUST_PROXY ne doit être activé que lorsque le backend
n’est accessible qu’au travers de ce proxy maîtrisé. Pour plusieurs proxys, configurer explicitement
les sauts / sous-réseaux autorisés dans Fastify plutôt que faire confiance à un en-tête public.

La première compilation Docker peut télécharger des images et dépendances. En production, figer
les images à leurs digests dans la chaîne de livraison après validation et prévoir leurs mises à jour.

## Frontend et backend séparés

Frontend statique :

- commande : `npm ci && npm run build`
- répertoire publié : `apps/web/dist`
- définir VITE_API_URL et VITE_WS_URL sur l’origine HTTPS du serveur Node avant la compilation ;
- renvoyer `index.html` pour les routes React, notamment /games/sorting/rooms/ABC234.

Serveur :

- conteneur cible `server` du Dockerfile, ou `node apps/server/dist/index.js` après compilation ;
- définir NODE_ENV=production, DATABASE_URL, CLIENT_ORIGIN, HOST et PORT ;
- exécuter `node apps/server/dist/db/migrate.js` en job de pré-déploiement ;
- utiliser un service acceptant les connexions WebSocket persistantes ;
- garder **une instance** pour ce MVP ; éviter la mise en veille automatique durant les parties.

Base :

- PostgreSQL 17 ou compatible ;
- activer les exigences TLS du fournisseur dans DATABASE_URL ;
- ne pas désactiver la validation des certificats pour contourner un problème ;
- sauvegarder les résultats, tester la restauration, appliquer les migrations avant le code dépendant.

## Exploitation

Le snapshot de reconnexion rétablit les changements ratés pendant une coupure réseau.
Il ne rétablit pas une partie perdue après un redémarrage du serveur. Annoncer les maintenances,
et laisser finir les parties avant un remplacement d’instance si nécessaire.

Surveiller : statut /api/ready, connexions actives, rooms en mémoire, latence, CPU, mémoire,
messages de saturation et erreurs PostgreSQL. Le MVP n’affiche pas de mesures inventées :
les tests vérifient la synchronisation, mais ne constituent pas un benchmark de charge.

Le cache de déduplication conserve les 128 dernières commandes d’une session. L’UI refait au plus
une tentative avec le même requestId. Les opérations ne restent pas en attente dans un buffer
Socket.IO hors connexion. Les événements de mouvement sont volontairement jetables.

Le frontend de développement peut être visité depuis un autre appareil du réseau avec
`http://IP_LOCALE:5175`, mais ajouter cette origine dans CLIENT_ORIGIN et préférer HTTPS
pour disposer des APIs navigateur sécurisées. Pour valider deux appareils sans config réseau,
utiliser directement l’origine HTTPS du déploiement.

## Dépendances et avis de sécurité

`npm audit --omit=dev` ne signale **aucune vulnérabilité** : c'est le périmètre réellement livré,
car l'étape `server` du Dockerfile installe avec `npm ci --omit=dev`.

`npm audit` complet signale en revanche quatre avis de gravité modérée sur un esbuild ancien
(GHSA-67mh-4wv8-2f99). Sa chaîne est uniquement de développement :

```text
drizzle-kit (devDependency) → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild 0.18.20
```

L'avis concerne le **serveur de développement** d'esbuild, qu'aucune commande du projet ne démarre :
`@esbuild-kit/core-utils` ne sert qu'à transpiler `drizzle.config.ts`. Les quatre paquets sont
marqués `dev` dans `package-lock.json` et sont donc absents de l'image de production.
`drizzle-orm`, l'ORM réellement exécuté, n'est pas concerné.

`npm audit fix --force` **ne doit pas être utilisé** : il rétrograderait `drizzle-kit` de 0.31 à 0.18,
une régression majeure pour corriger un avis inatteignable. `@esbuild-kit/core-utils` épingle
`esbuild ~0.18.20`, donc un `overrides` ciblé y imposerait une version majeure incompatible.
L'`overrides` du dépôt relève l'esbuild de premier niveau (celui de Vite et Vitest, le seul qui
puisse réellement exposer un serveur de développement) en 0.28.

À revoir lorsque `drizzle-kit` abandonnera `@esbuild-kit` au profit de `tsx`, dont il dépend déjà.

## Scripts du serveur

Le workflow `deploy-prod.yml` ouvre une session SSH **sans commande** : la clé de déploiement
porte une commande forcée côté serveur (`command="/usr/local/bin/deploy-ensemble"` dans
`authorized_keys`). C'est une bonne pratique — la clé ne peut rien faire d'autre — mais elle a une
conséquence : le script de déploiement vit sur le serveur et n'est visible ni dans le dépôt, ni
dans une revue de code. S'il appelle un outil absent, le déploiement échoue avec un code 127
(`command not found`) alors que la construction des images a parfaitement réussi.

`infra/backup-ensemble` est versionné ici pour cette raison. Il est appelé par `deploy-ensemble`
avant la migration. Installation, puis vérification à blanc :

```sh
sudo install -m 755 infra/backup-ensemble /usr/local/bin/backup-ensemble
sudo ENSEMBLE_DIR=/opt/ensemble /usr/local/bin/backup-ensemble
```

| Variable     | Rôle                                | Défaut                  |
| ------------ | ----------------------------------- | ----------------------- |
| ENSEMBLE_DIR | Répertoire contenant `compose.yaml` | `/opt/ensemble`         |
| BACKUP_DIR   | Destination des sauvegardes         | `/var/backups/ensemble` |
| BACKUP_KEEP  | Nombre de sauvegardes conservées    | `14`                    |

Le script écrit d'abord un fichier `.part` puis le renomme, afin qu'une sauvegarde interrompue ne
puisse jamais passer pour une sauvegarde valide. Un dump vide ou un `pg_dump` en échec arrête le
déploiement **avant** la migration. Au tout premier déploiement, quand aucun conteneur de base
n'existe encore, il n'y a rien à protéger : le script le signale et rend la main.

Une sauvegarde n'a de valeur qu'une fois restaurée. À tester au moins une fois :

```sh
gunzip -c /var/backups/ensemble/ensemble-AAAAMMJJ-HHMMSS.sql.gz \
  | docker compose exec -T db psql -U ensemble -d ensemble
```

`deploy-ensemble` gagnerait à rejoindre `infra/` pour la même raison.
