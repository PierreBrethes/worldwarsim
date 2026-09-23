# 45-marqueurs-wipe — `git grep -n '@wipe' -- src convex` rend l'inventaire de ce que le prochain wipe retire

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 41.

**À lire :** chaque commentaire de l'inventaire ci-dessous, en entier ; `convex/constants.ts` ~289
(le format `@a-mesurer`, modèle du marqueur) ; le marqueur posé par 41 dans
`convex/validators.test.ts` ; la section `## Schéma Convex` de `CLAUDE.md`.

## Pourquoi

Une vingtaine de choses « partent au prochain wipe ». On ne les repère que par des tournures libres,
en français comme en anglais : « le temps d'un wipe », « jusqu'au wipe », « next wipe »,
« Legacy — plus jamais écrit ». `git grep -niE "wipe|legacy" -- src convex ':!*.test.ts'` rend 52
lignes, qui mêlent ce qui part et le wipe comme événement (`dev.ts`, `seasons.ts`). Le wipe est
manuel : un oubli laisse une branche lue, donc invisible à knip. Le vérificateur de l'audit a tranché
pour un marqueur, sans script ni test.

## Ce qui change

Commentaires seulement. La prose reste, et chaque commentaire concerné gagne une dernière ligne
`@wipe <sujet> — <ce qu'on retire>`, comme `@a-mesurer` ; dans un commentaire `//`, c'est
`// @wipe …`. Un même sujet porte partout le même mot, pour que `git grep '@wipe decoy'` regroupe.
1. **Ce que le commentaire dit partir**, vérifié le 23/09 :
   - `convex/schema.ts` : `seasons.format` ~71-77 ; `seasons.winnerId`/`concludedAt` optionnels
     ~85-96 (« the wipe that follows the first real skirmish ») ; `players.doctrine` ~153-159 ;
     `buildings.outpostId` absent ~281-286 ; `outposts.regionId` absent ~643-647 ;
     `engagements.strikes` ~738-744.
   - `convex/validators.ts` : les trois dépêches `decoy*` ~338-342 ; `'decoy'` de `MOVEMENT_TYPE`
     ~574-578 ; `'riposte'` de `STRIKE` ~680-683 (« legacy, comme decoy ») ; « the legacy array »
     ~677 (`engagements.strikes`).
   - `convex/view.ts` : `notDecoyMovement` et `notDecoyNotice` ~1043-1048, le filtre ~749-752.
   - `convex/movements.ts` : `encounter` ~762, `intercept` ~777. `if (type === 'decoy') return
     null;` ~439 n'a pas de commentaire : lui en donner un d'une ligne, le marqueur.
   - `convex/regions.ts` : les replis de `pointOfBuilding` ~76-78 et de `regionOfOutpost` ~118-119,
     `NEAREST_OF`/`nearestRegionOf` ~133-139 ; `convex/outposts.ts` ~147-149 ; `convex/press.ts`
     ~179-181 ; `convex/sites.ts` ~153-157.
   - `src/domain/` : `combat.ts` ~115 (`'riposte'`) ; `ids.ts` ~47-50, `movement-orders.ts`
     ~266-268 et `player-view.ts` ~754-757 (`decoy`).
   - Tests : `convex/control.test.ts` ~250-251. Le marqueur de 41 s'aligne sur ce format.
2. **La même tolérance, sous un autre mot.** Un commentaire qui décrit un sujet déjà marqué prend le
   même marqueur. Pour les trouver : `git grep -niE "avant le champ|before (this|the field)|predate|pre-S6a"
   -- src convex`. Exemple vérifié : `schema.ts` ~267 (`buildings.point`, repli de
   `pointOfBuilding`). « D'avant le champ » ne vise pas toujours le même champ : lire chaque
   occurrence.
3. **Les champs de la rencontre en route** (`schema.ts` ~455-466) : `contactJobId`, `contactWithId`,
   `contactAt`, `contactInitiatorId`, `encounteredMovementIds`. Au 23/09, aucun module ne les lit ni
   ne les écrit hors du schéma (seul `convex/detection.test.ts` ~569 vérifie `contactJobId` absent),
   et `movements.ts` ~765 le dit « plus écrit » : ils partent avec `encounter`. Revérifier chacun
   par `git grep -w` avant de le marquer ; sinon, le signaler sans marquer.
4. `CLAUDE.md`, `## Schéma Convex`, une ligne : « Avant un wipe, `git grep -n '@wipe' -- src convex`
   donne la liste de ce qu'on retire. » Les chemins écartent les prompts, qui citent le marqueur.
   Si 25 est passé, le budget tient : `wc -m < CLAUDE.md` ≤ 8 000.

## Ce que ce prompt ne fait pas

Rien n'est retiré, et aucun départ n'est décidé. Ce que les commentaires ne disent pas partir reste
**sans marqueur** et va au rapport :
- `depot` et `costKey` (`constants.ts` ~87 et ~109, `buildings.ts` ~17), `recall` (`ids.ts`
  ~40-45) ;
- `players.enteredWarAt` absent (`schema.ts` ~196-201) ;
- `movements.plunder`/`loot`/`lootDelivery` absents (~466-476, `plunder.ts` ~313 et ~371) ;
- `buildings.disabledUntil` (~292), `engagements.reducedDefender` (~733), `regionSightings`
  (~1018-1020), les champs de détection « predate » (~457, ~887).
`src/domain/control.ts` ~132 (« stable jusqu'au wipe », les encres de siège) ne désigne rien qui
parte. Pas de script ni de test ; la compatibilité d'un déploiement est à 43-44, le wipe à 59,
CONVENTIONS à 68.

## Cas d'acceptation (tests d'abord)

Rien à tester en code ; les preuves sont des commandes.
1. Commentaires seulement : `git diff -U0 -- src convex | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)'
   | grep -vE '^[+-]\s*(\*|//|/\*)'` ne rend rien.
2. Un script jetable du scratchpad (non commité) prend chaque ligne de `git grep -niE "prochain
   wipe|temps d'un wipe|jusqu'au wipe|next wipe|with the (next )?wipe|plus jamais écrit" -- src
   convex` (26 aujourd'hui) et vérifie que son bloc de commentaire porte un `@wipe`. La seule
   exception attendue est `control.ts` ~132.
3. `git grep -h '@wipe' -- src convex | sed 's/.*@wipe //' | cut -d' ' -f1 | sort | uniq -c` rend
   l'inventaire par sujet (`decoy`, `riposte`, `seasons.format`, `encounter`…).

## Vérifications

`npm run verifier` : vert, alors que seuls des commentaires ont changé.

## Rapport attendu

Format commun (README de la série), plus : l'inventaire du cas 3 et la liste `fichier:ligne
sujet` ; les occurrences du point 2, marquées ou écartées avec leur raison ; **À trancher** : pour
chaque candidat de « Ce que ce prompt ne fait pas », part-il au prochain wipe ? Une recommandation
par ligne.
