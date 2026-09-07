# production-reliee — un bâtiment ne produit que relié (ADR 0020 §6)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0020 §1-§3 et §6-§7,
`src/domain/control.ts` (`heldRegions`, `coveredRegions`), `convex/control.ts` (`heldOf`),
`convex/resources.ts` (`extractionSites`, `extractionRates`, `chainsOf`, `storageCaps`),
`src/domain/economy.ts` (`settleStocks`), `convex/view.ts` (`economyOf`, `me.regions[].site`),
`src/routes/-plateau/EconomyWindow.tsx` (la place réservée « production reliée », colonne QG),
`src/domain/next-actions.ts`. Ne commit pas, ne push pas. Un chantier, un commit, message en
français qui décrit le chantier entier.

## La règle

Un bâtiment **ne produit que si sa région porte la couleur de son propriétaire** (ADR 0020 §6) —
c'est `heldRegions` qui dit la couleur, rien d'autre : le sol national est toujours relié, une
région d'avant-poste l'est si l'avant-poste la tient (et un avant-poste tient toujours sa propre
région, révision du 04/09), une région tenue par un adversaire plus proche ne l'est pas, un
avant-poste désactivé décolore (§7) donc **coupe**. « Produire » = extraire (`extractionSites`)
**et** convertir (`chainsOf` : fonderie, arsenal, intendance). Ne produisent pas et ne sont donc
pas concernés : le stockage (`storageCaps`), les bâtiments de projection, le QG, les cantonnements.

## Ce qui change

1. **Domaine pur** — `src/domain/economy.ts` : `isLinked(building, held: ReadonlyMap<regionId,
   ownerId>, ownerId) → boolean`, et `extractionSites` / `chainsOf` prennent `held` en paramètre
   et rendent `perHour = 0` / état `unlinked` pour un site non relié. **Une seule lecture de la
   couleur** : la fonction qui sert `control.held` (`heldOf` → `heldRegions`) est celle
   qu'`economyOf` appelle — jamais une seconde table, jamais un champ `linked` stocké.
2. **Règlement** — `settleStocks` intègre la coupure **à la date où elle se produit** : la couleur
   ne change qu'aux événements (fondation, désactivation, destruction d'avant-poste — les mêmes
   que `memoire-de-la-carte`), donc à chacun de ces événements le serveur règle les stocks du
   propriétaire touché **avant** de changer la couleur (comme un `settle` avant toute écriture
   aujourd'hui). Pas de cron, pas de recalcul rétroactif.
3. **Vue** — `me.regions[].site` et l'Économie servent l'état `unlinked` (nouvel état de site :
   tampon **« hors réseau »**, un état, pas une action — `fr.stamps`). La place réservée dans la
   colonne QG de l'Économie reçoit **une ligne** : « n sites hors réseau » (0 → la ligne est
   absente, pas grisée). Dans la filière, la colonne d'un site hors réseau porte ce tampon **en
   priorité** sur « à sec » (ordre : hors réseau > à sec > tourne) — un site coupé n'est pas à
   sec, il est coupé.
4. **« À faire maintenant »** : une ligne « n sites hors réseau » qui recentre sur le premier
   (`next-actions.ts`), même grammaire que `idleBarracks`.
5. **Dépêche** `productionCut` (gravité critique, encre rouge — c'est une alarme au même titre
   qu'un avant-poste désactivé) pour le propriétaire, posée à l'événement qui coupe, texte :
   « n sites hors réseau — <pays> ». Et `productionRestored` (notable) quand la couleur revient.
   Jamais pour l'adversaire : il lit la carte.
6. **Titre du panneau de terre** (trouvaille du 01/09) : `GroundPanel.tsx:79` titre « Pays
   neutre » sur mon propre pays — ajoute la branche `fr.selectedCountry.myTitle` = « mon
   territoire » (la clé `fr.compass.myTerritory` existe pour la rose ; deux clés, deux
   emplacements, même chaîne).

## Ce que ce prompt ne fait pas

Aucune règle de blocage (ADR 0020 §8), aucun coût d'entretien nouveau, aucun changement du
recrutement (une caserne hors réseau forme toujours — elle ne produit pas, elle instruit ; à
rouvrir si le test dit le contraire). Le simulateur d'ouverture n'est pas touché (il n'a pas de
carte) — une ligne dans `WWS/simulation/README.md` le dit.

## Cas d'acceptation (tests d'abord — 53a)

1. Étant donné une mine sur le sol national, `perHour` inchangé (sol national toujours relié).
2. Étant donné une mine sur la région d'un avant-poste de niveau 1 à moi, elle produit ; **le
   même avant-poste désactivé par un raid**, elle rend 0 dès l'heure de la désactivation, et le
   stock réglé à cette date est exact au centième (test à deux dates).
3. Étant donné une région couverte par mon avant-poste et par un avant-poste adverse plus
   proche, mon extracteur y est hors réseau ; l'adversaire fonde plus près → dépêche
   `productionCut` chez moi, aucune chez lui.
4. Une fonderie hors réseau ne convertit pas : `chainsOf` la sert `unlinked`, la commande d'un
   lot d'arsenal hors réseau est refusée (`SITE_UNLINKED`, nouvelle erreur, libellé fr).
5. `economyOf` et `control.held` sur le même état donnent la même liste de régions tenues (test
   qui appelle les deux et compare).
6. Observateur : le tampon se lit, aucune action.
7. `GroundPanel` titre « mon territoire » sur mon pays, « Pays neutre » sur un pays sans
   siège, « <nation> » sur un adversaire — inchangé pour ces deux-là.
8. Budget : `view-budget.test.ts` ne bouge pas (la couleur est déjà calculée par `held`).

`npm run verifier` vert. Mets à jour `CLAUDE.md` (un paragraphe), `WWS/CONTEXT.md` (« relié »
entre au vocabulaire), `RESTE-A-CODER.md` (6 et 13 livrés).
