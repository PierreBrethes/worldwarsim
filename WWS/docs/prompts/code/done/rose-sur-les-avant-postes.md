# rose-sur-les-avant-postes — un point à soi se commande au clic droit, comme un mât

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0020 §6, §7 et §10 (précision du
15/09 : fondation en chantier, élévation, zéro entretien), l'ADR 0019 §1, `done/demolir-un-batiment.md`
(le modèle exact : refus unique, popin chiffrée, aucun remboursement),
`done/elever-un-avant-poste.md` (`constructions.raiseOutpost`, `outpostRaiseHold`),
`src/domain/compass-rose.ts` (`build()` → `case 'outpost'` rend `actions: []` : **le clic droit
sur un point est inerte** ; `case 'building'` est le modèle — 54a, 56a, raser ; `aim()` pour la
visée), `src/routes/-plateau/GarrisonPanel.tsx` (élévation et `respecialize` — les deux portes
actuelles), `convex/outposts.ts` (`collapseIfAbandoned` : un point se **supprime** déjà, avec
dépêche `foundationLost`), `convex/movement/forces.ts` (`specializationsServed`). Ne commit pas,
ne push pas. Un chantier, un commit.

> **Décision de Pierre, 16/09** (Registre 27) : clic droit sur un avant-poste à soi, **sans pile
> armée** → « élever », les **deux spécialités** (relais, écoute), « détruire ». **Avec une pile
> armée** → aucune des précédentes, une seule branche : « entrer en garnison ». Sur un point
> adverse, rien ne change. **1a** : détruire un point emporte les bâtiments qu'il ancre.

## La règle

**Sans pile armée**, la plate d'un point à soi porte, du nord dans le sens des aiguilles :

1. **« élever »** — la même marche que le panneau de garnison : `outpostRaiseHold` décide, le
   coût et la durée du niveau suivant se relisent dans la vue (`me.outposts`), jamais recopiés
   au picking ; au niveau 3, pas de branche ; sous désactivation, la phrase de refus (3a).
   Le panneau garde sa porte — la rose en ajoute une, elle n'en retire pas.
2. **« relais »** et **« écoute »** — deux branches, celle en cours **marquée** (le même état que
   `aria-pressed` du panneau, pas une branche grisée) ; cliquer l'autre appelle
   `movements.respecialize`. Si `specializationLocked` (un mouvement servi par ce relais), la
   branche existe et sa phrase dit pourquoi elle refuse — rien de grisé (ADR 0015).
3. **« détruire »** — dernière branche, encre rouge, popin de confirmation, **irréversible**.

**Détruire un avant-poste** (nouveau) — `outposts.dismantle({ token, seasonId, outpostId })` :

- Refus unique `outpostDismantleRefusalOf(...)` dans `src/domain/` (voisinage de
  `demolitionRefusalOf`), lu par la rose et la mutation : `NOT_YOURS`, `OUTPOST_SERVING` (un
  mouvement s'appuie sur ce relais — même lecture que `specializationsServed`), et c'est tout.
  Un chantier en cours (fondation pas encore debout, élévation en file) **ne refuse pas** : il
  est annulé selon la règle de la file (un chantier annulé, pas une démolition payée).
- **C'est un événement de couleur** — le cinquième (fonder/lever, élever, désactiver,
  réactiver, capituler) : `settleBeforeChange` avant, `settle` après, comme `standOutpost`.
  ADR 0020 §7 le dit déjà : « détruit, il la décolore définitivement ».
- **Les bâtiments ancrés à ce point tombent avec lui** (décision 1a du 16/09 — « un avant-poste
  à protéger »). L'ancrage est `buildings.outpostId`, écrit à la pose (ADR 0020 §1, révision du
  31/08) : aucune géométrie à relire. Chaque bâtiment emporté suit **la règle de la démolition**
  (`buildings.demolish`, factorise plutôt que recopie) : file annulée selon sa règle, garnison
  au sol, écrêtage d'entrepôt chiffré, aucun remboursement, dette de socle non rendue. Un
  bâtiment sans `outpostId` (posé avant le champ) se rattache par `regionId` au point qui tient
  sa région, repli assumé jusqu'au wipe.
- **La garnison** posée au point passe **au sol** (station `point`, ADR 0019 — une pile posée),
  comme la garnison d'un bâtiment rasé.
- **Aucun remboursement** (5a), ni de la fondation ni des élévations. Une dette de socle n'est
  jamais portée par un avant-poste — rien à faire pour 6a.
- Supprimer le document (`ctx.db.delete`, comme `collapseIfAbandoned`), dépêche
  `outpostDismantled` au propriétaire (hôte, niveau, bâtiments emportés s'il y en a).
- La **confirmation** dit tout en clair : le pays hôte, le niveau, la couleur perdue (le nombre
  de régions que ce point tenait **seul** — différence de deux `heldRegions`, la même lecture
  que la hachure), les bâtiments concernés, la garnison qui passe au sol, « aucun
  remboursement ». Bouton « détruire — irréversible ».

**Avec une pile armée**, sur un point à soi : la plate ne porte que **« entrer en garnison »** —
c'est une marche (`type: 'march'`, `aim.kind: 'outpost'`) étiquetée et pictogrammée comme
celle du mât (64b : `fr.compass.garrison`, pictogramme `doorway`). Ni « attaquer » ni « raid »
sur un point à soi : vérifie que `mine()` / `FRIENDLY_TARGET` les refusent déjà pour un
`outpost` à soi ; sinon c'est le refus à ajouter, dans la fonction unique, pas dans la rose.
Sur un point **adverse** avec pile armée : la plate de visée d'aujourd'hui, inchangée.

## Ce qu'il faut

- **Domaine** : `outpostDismantleRefusalOf`, une branche `raiseOutpostBranch(outpost, view)`
  (relit `outpostRaiseHold`), `specializationBranches(outpost)`, `dismantleBranch(outpost)` ;
  `build()` `case 'outpost'` les assemble **seulement si le point est à moi**
  (`view.me.outposts`), sinon le cas garde son inertie. `aim()` : `march` seul sur un point à
  soi, étiqueté garnison.
- **Serveur** : `outposts.dismantle` ; `movements.respecialize` inchangé ; `constructions.raiseOutpost`
  inchangé (la rose appelle la même mutation que le panneau).
- **Confirmation** : `DismantleCard` sur le modèle de `DemolitionCard`.
- **Textes** dans `fr.ts` ; une ligne dans la fiche `?` ; `WWS/CONTEXT.md` (« se détruit » gagne
  « — ou se démantèle par son propriétaire »).
- **`a-mesurer.md`** : rien de nouveau.

## Cas d'acceptation (tests d'abord)

1. Point niveau 1 à moi, sans pile : la rose porte élever / relais (marqué) / écoute / détruire.
2. Point niveau 3 : pas de branche « élever » ; désactivé : « élever » refuse avec la phrase 3a.
3. « écoute » sur un relais qui sert un mouvement : refus lisible ; sur un relais libre :
   `respecialize` appelé, la rose relue marque « écoute ».
4. « détruire » sur un point qui tient seul 4 régions, garnison de 2 troupes, une mine niveau 2
   et une caserne avec un lot en formation ancrées à lui : popin annonce 4 régions, les deux
   bâtiments, la garnison au sol, aucun remboursement ; après : point et bâtiments supprimés,
   lot annulé selon la file, couleur réglée avant/après (`settleBeforeChange`), 2 troupes en
   station `point` au même lon/lat, dépêche `outpostDismantled`, classement territoire et
   industrie recalculés à la prochaine édition.
5. « détruire » pendant une élévation en file : file annulée selon sa règle, point supprimé.
6. Pile armée, point à moi : une seule branche « entrer en garnison » ; « attaquer » refusé
   `FRIENDLY_TARGET` côté serveur si appelé directement.
7. Point adverse, avec et sans pile : comportement identique à aujourd'hui (test de non-régression
   sur `compassOf`).
8. Vérifieur vert.

## Hors périmètre

La démolition des bâtiments (livrée). Un « abandon » automatique hors `collapseIfAbandoned`.
Toute règle sur ce qu'un adversaire voit du démantèlement : rien — la couleur disparaît, c'est le
relevé qui le dira (§5).
