# Ensemble — progression du MVP

- [x] 1. Monorepo TypeScript, contrats Zod, serveur et client connectés.
- [x] 2. Sessions invitées, hub, navigateur de rooms, invitations, lobby synchronisé.
- [x] 3. Moteur de rangement autoritaire, génération, validation des dépôts, victoire, rejouer.
- [x] 4. Drag Pointer Events, curseurs interpolés, verrous, reconnexion, nettoyage, rate limits.
- [x] 5. Interface responsive, animations, erreurs, accessibilité et réduction des mouvements.
- [x] 6. Tests métier et réseau réels, scénario navigateur à deux joueurs, typecheck, lint, build.
- [x] 7. PostgreSQL / Drizzle, migrations, conteneurs et documentation.
- [x] 9. Second jeu « Tout seul » sur la même plateforme : rooms, lobby, présence et
      invitations réutilisés tels quels, sans rien réécrire.
- [ ] 8. Déploiement public : reporté par choix. Tout est prêt côté projet (image Docker
      vérifiée, compose complet, variables documentées) ; il ne manque que la cible
      d’hébergement et ses accès. Voir docs/deployment.md.

## Vérifications passées

| Contrôle                    | Commande                              | État                              |
| --------------------------- | ------------------------------------- | --------------------------------- |
| Types                       | `npm run typecheck`                   | 3 projets, aucune erreur          |
| Lint                        | `npm run lint`                        | aucune erreur                     |
| Format                      | `npm run format:check`                | conforme                          |
| Tests métier et réseau      | `npm test`                            | 27 tests, 4 fichiers              |
| Build                       | `npm run build`                       | serveur + client                  |
| Parcours à deux navigateurs | `npm run test:e2e`                    | 2 scénarios (desktop + tactile)   |
| Persistance PostgreSQL      | `npm run test:db -w @ensemble/server` | migration, insertion, idempotence |
| Image de production         | `docker build --target server .`      | vérifiée                          |

## Suite possible

- Sons (attraper, poser, ranger) : l’architecture les prévoit, le MVP ne les inclut pas.
- Comptes, profils, statistiques et historique au-dessus des sessions invitées.
- Redis et plusieurs instances lorsque la charge le justifie (voir `docs/architecture.md`).
