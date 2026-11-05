# ADR 0040 — L'édition finale survit à sa saison

**Statut :** acceptée (05/11/2026). Tranchée par Pierre sur #443 (« Oui, les deux », 04/11),
précisée par la relecture à froid de #455 (05/11). **Déroge à l'[ADR 0001](0001-saison-longue-asynchrone.md)**
(une saison est jetable, vidée par le wipe) pour la seule édition finale d'une Mondiale.

## Contexte

Une saison se vide en entier : le « détruire » du fondateur (`seasons.destroy`) et le wipe de
développement (`dev:reset`) emportent sièges, éditions et journal. L'accueil ne peut donc rien
montrer d'une Mondiale jouée puis détruite, et le télégraphe s'efface déjà à la conclusion.

## Décision

1. **Une archive par Mondiale conclue**, `finalEditions`, et une ligne par compte qui l'a jouée,
   `finalEditionReaders`. Une troisième liste de tables, `ARCHIVE_TABLES` (`convex/dev.ts`), ni
   jeu ni identité : `season-partition.test.ts` tient les trois listes exhaustives.
2. **L'archive se suffit** : tout ce que la page de fin affiche, série des éditions et carte de la
   fin comprises. Elle se lie aux comptes, jamais aux places, et nomme les nations par leur clé.
3. **Le brouillard tombe dans l'édition, pas sur le plateau.** Rien de l'archive ne passe par
   `PlayerView` ; elle ne se lit que la saison conclue, et par ses seuls participants.
4. **Une chaîne de petites mutations l'écrit après la conclusion** (`convex/finalEdition.ts`) :
   les dépêches du canal général, puis l'effacement du télégraphe, le journal de chaque place,
   les passes, la carte en un maillon (le coût de `heldOver` est presque tout fixe), et
   l'archive. Son échec ne retient pas la conclusion ; un effacement de repli part une
   demi-heure après. D'ici là, la page de fin lit « en attente » et le fondateur ne peut pas
   détruire la saison (`EDITION_PENDING`) ; passé ce délai sans archive, elle lit « aucune ».

## Conséquences

- Un wipe ne vide plus toute la base : l'archive reste, comme les comptes.
- Une saison conclue avant le déploiement, ou dont la chaîne a échoué, n'a pas d'archive ; la
  page de fin garde alors l'édition ordinaire.
- Une recuisson de l'atlas (ADR 0034) ne casse pas une archive : la carte y est en paires
  région → nation, et une région inconnue se dessine neutre.

## Ce qu'on abandonne

- La saison entièrement jetable : un « détruire » ne détruit plus tout ce qu'elle a produit.
- Le télégraphe privé : il ne survit pas, même compté (seul le canal général l'est).
- La Blitz : `BlitzEnding` reste tel quel, sans archive.
