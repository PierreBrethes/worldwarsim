# demolir-un-batiment — raser un bâtiment à soi, depuis la rose, avec confirmation

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0015 (une bâtisse par région, rien
de grisé), l'ADR 0020 §6 et §10, `src/domain/movement-orders.ts` (une fonction pour la rose et
le serveur) et `convex/constructions.ts`. Ne commit pas, ne push pas. Indépendant des lots
avant-poste. Un chantier, un commit.

> **Décisions du 15/09 (rapport Discord, ligne 11) : 5a et 6a acquises** — aucun remboursement,
> la dette de socle ne revient pas. Seul le QG ne se rase pas.

## La demande (Pierre, 15/09)

Pouvoir **détruire volontairement** un de ses bâtiments : clic droit sur le bâtiment, la rose
propose « raser », une popin de confirmation, c'est fait. La raison d'être n'est pas dite mais
elle est évidente : **une bâtisse par région** (ADR 0015). Sans démolition, une région est
figée au premier choix pour toute la saison — une mine posée là où on voudrait aujourd'hui une
caserne est une erreur sans retour.

## La règle

Un joueur peut raser un bâtiment **à lui**, debout ou en cours d'élévation, **sauf le quartier
général** (question 39, destruction du QG = révision de « jamais éliminé » — pas ici). Raser :
supprime le bâtiment, annule tout chantier en file sur lui (remboursé selon la règle de la
file — c'est un chantier annulé, pas une démolition payée), libère la région et l'emplacement
du site, renvoie la garnison éventuelle **au sol de la région** (une pile posée, ADR 0019 — un
bâtiment de projection rasé ne détruit pas ses troupes), et ne rend **rien** de l'alliage payé
(5a : ce qui est bâti est dépensé ; un remboursement ferait de la démolition un stockage de
ressources à l'abri du pillage). Une dette de socle acquittée par ce bâtiment **ne revient
pas** (6a : le socle est un don de lancement, fait une fois). Une caserne qui forme : le lot
en cours est annulé et remboursé, comme une annulation ordinaire. L'entrepôt : raser réduit
les plafonds — le stock au-dessus est **écrêté**, la confirmation le dit en chiffres.

## Ce qu'il faut

- **Domaine** : `demolitionRefusalOf(view, building)` dans `movement-orders.ts` (ou
  `construction.ts`, au voisinage le plus naturel), lue par la rose et par la mutation :
  `HQ_NEVER_DEMOLISHED`, `NOT_YOURS`, `ALREADY_QUEUED` si une démolition est déjà en cours.
  Rien de grisé : la branche existe ou la phrase dit pourquoi.
- **Serveur** : `buildings.demolish({ token, seasonId, buildingId })`. Séquence : refus →
  annuler la file sur ce bâtiment (remboursement de la file) → poser la garnison au sol →
  écrêter si entrepôt → supprimer → dépêche `buildingDemolished` au propriétaire. Un bâtiment
  producteur rasé ne touche pas la couleur (§6 : la couleur vient des avant-postes, jamais des
  bâtiments) — donc **pas** de `settleBeforeChange`, mais un `settle` du joueur avant l'écrêtage
  d'un entrepôt, sinon les heures d'avant sont écrêtées avec.
- **Rose** : sur un bâtiment `mien`, une branche « raser » en dernière position, encre rouge ;
  sur le QG, pas de branche (rien de grisé — la rose du QG garde ce qu'elle a).
- **Confirmation** : la popin dit ce qui est perdu, en clair — le bâtiment et son niveau, le
  chantier annulé et son remboursement, la garnison qui passe au sol, l'écrêtage en chiffres
  pour un entrepôt, « aucun remboursement ». Bouton « raser — irréversible », même style que
  « envoyer — irréversible ».
- **Textes** dans `fr.ts` ; une ligne dans la fiche `?`.
- **Classement** : l'alliage d'un bâtiment rasé sort du score industrie à la prochaine édition
  (`standings.ts` lit ce qui est debout — vérifier que c'est déjà le cas, test).

## Cas d'acceptation

1. Mine niveau 2 à moi, clic droit → « raser » → popin → confirmé : bâtiment supprimé, région
   libre (`REGION_TAKEN` ne la refuse plus), emplacement du site rendu, aucun crédit d'alliage.
2. Caserne avec garnison et un lot en formation : garnison posée au sol de la région, lot
   annulé et remboursé selon la file, dépêche.
3. Entrepôt niveau 1 avec stock au-dessus du plafond sans lui : la popin annonce l'écrêtage
   exact ; après, le stock est écrêté au nouveau plafond, les heures d'avant réglées.
4. QG : aucune branche « raser » ; la mutation refuse `HQ_NEVER_DEMOLISHED`.
5. Bâtiment adverse relevé : pas de branche « raser » (la rose adverse garde piller / saboter).
6. Bâtiment de socle rasé : `foundationOwed` ne le redemande pas (6a).
7. Vérifieur vert.

## Hors périmètre

Démolir un avant-poste (abandon) : autre question — il porte la couleur, c'est un événement
de couleur et une décision de design. Démolir sous désactivation : autorisé, rien de spécial.
