# C3 — frontière après le serveur des comptes

**Préparation uniquement ; aucun parcours complet activé par C2.**
Le [rapport C2](../../../rapports/2026-09-09-comptes-c2.md) décrit les portes disponibles.

## Décision nécessaire avant activation

Les places existantes appartiennent encore à des jetons de partie. L'ancien brief monolithique
prévoyait un wipe ; cette proposition ne vaut pas autorisation d'effacement. La reprise des
places historiques doit être décidée explicitement. Une égalité de pseudo n'est jamais une
preuve de propriété. Toute stratégie de reprise devra préciser sa preuve, le traitement des
jetons perdus et la transition des sessions encore ouvertes.

## Découpage proposé pour le prochain cadrage

1. **Propriété serveur des places.** Ajouter une référence compatible aux comptes, définir
   le résolveur session + saison et l'unicité d'une place par compte/saison. Aucun champ
   obligatoire nouveau sur les joueurs existants sans backfill autorisé. Conserver les
   identités historiques tant que leur transition n'est pas décidée.
2. **Accès au jeu.** Raccorder progressivement les mutations et lectures au résolveur,
   liste des parties du compte et présence comprise. Tester explicitement session inconnue,
   absence de place, autre saison, joueur défait et brouillard propre à chaque joueur.
   Préserver les deux heures d'inscription et l'accès des participants déjà inscrits.
3. **Parcours client.** Lire `WWS/docs/design/11-brief-ui.md` avant toute surface. Connexion,
   inscription, accueil et déconnexion ; traductions centralisées. Reprendre une session
   sur un deuxième appareil. L'interface ne choisit jamais elle-même un joueur par pseudo.

Les contrats exacts et la stratégie historique appartiennent au cadrage C3. Ce document ne
prescrit ni migration, ni wipe, ni déploiement, et ne lance aucun auteur. Reprendre un créneau
explicite avec le pilote du pillage avant les prochaines écritures.
