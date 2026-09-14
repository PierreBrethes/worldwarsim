# engagement-intentionnel — les camps se voient, rien ne se bat sans ordre, le relevé survit

Suppose `releve-tronque` passé. **Remplace** `derniere-position-connue.md` (retiré de `ready/`,
son contenu est le lot C ci-dessous). Lis d'abord **l'ADR 0024** en entier
(`WWS/docs/adr/0024-engagement-intentionnel-et-forces-posees-visibles.md`), puis `CLAUDE.md`,
`CONVENTIONS.md`, les bannières de révision posées le 13/09 sur l'ADR 0008, l'ADR 0019 §3 et §6,
l'ADR 0021 §2, la fiche 04 § « Les forces posées ne se voient pas de loin »,
`WWS/docs/technique/brouillard-et-fanout.md`. Côté code : `convex/movement/detection.ts`
(`detectionBoard`, `syncSightings`, `reassessDetection`, `revealSighting`, et la rencontre en
route : `firstMobileEncounter`, `contactJobId`, lignes ~740-780), `convex/movements.ts`
(`arrive` ~655-700, `encounter` ~735), `convex/movement/arrival.ts` (`engageAt`, `standAt`,
`forgetMovement`), `convex/movement/forces.ts` (`defenceOf`, `defenceNear`), `convex/schema.ts`
(`sightings`, `lootCrateSightings` comme modèle d'un relevé de chose posée, `movements.contactJobId`),
`convex/view.ts` (`detectedArcs`, `surveyedInstallations`), `src/domain/movement-orders.ts`
(`MovementAim`, `refusalOf`, `legalMovementTypes`), `src/domain/sighting-segment.ts`,
`src/domain/player-view.ts` (`ArcView`, `surveyedInstallations`, `Detector`),
`src/data/serverView.ts`, `src/routes/plateau.tsx` (la rose, les marqueurs `installation` ~987,
`kind: 'plunder'` ~1559), `src/domain/labels.ts`, `src/map/engine/arcs.ts` (le pion et la
silhouette de domaine d'un arc adverse). Ne commit pas, ne push pas.

Trois lots, **dans l'ordre**, un rapport à la fin. Chaque lot laisse le vérifieur vert avant le
suivant. Pas de commit — Pierre commettra en trois fois sur ton rapport.

## Lot A — une force posée se voit dans la portée (ADR 0024 §1)

1. **Table `campSightings`** (nom à toi, jumelle de `sightings`) : `playerId` (l'observateur),
   `seasonId`, `stationKey` (l'identité de ce qui est vu : la pile posée à un point, ou la
   garnison d'un avant-poste / d'un bâtiment — une clé stable, le même `key` que
   `detectionBoard` fabrique pour ses `posted`), `ownerId` (jamais servi), `point`, `medium`
   (le milieu de la pile : mer si elle flotte, air jamais pour une pile posée, terre sinon),
   `since` (première vue), `until` (`null` tant qu'elle est vue ; l'instant de la perte sinon),
   `detector`, `detectorId`, `detectorRegion`, `noticeFiled`. Index `byPlayer`, `byStation`.
   Dans `GAME_TABLES`.
2. **Écriture aux événements, jamais à la lecture** : dans `reassessDetection` (il relit déjà
   tout le plateau et fabrique les `posted` et les `watchers`), pour chaque couple (observateur,
   pile posée adverse) à portée d'un de ses détecteurs — même quatre détecteurs que l'ADR 0021 §1,
   même « meilleure portée » — on **ouvre** une ligne si elle n'existe pas (ou la rouvre :
   `until = null`), on **ferme** (`until = now`) celles qui ne sont plus couvertes. Une garnison
   de bâtiment ou d'avant-poste est une pile posée comme une autre. Le fan-out est celui de
   `brouillard-et-fanout.md` : une ligne par observateur, lue sur `byPlayer` ; dis dans le rapport
   ce que la réévaluation coûte de plus (mesure dans le test, comme pour `detectedArcs`).
3. **Dépêche** `campSighted` à l'ouverture (« <détecteur> a relevé un camp inconnu — <pays> »),
   une fois par ligne, comme `movementSighted` ; texte dans `fr.journal`, `kind` dans
   `DispatchKind`. Pas de dépêche à la fermeture.
4. **Vue** : `PlayerView` gagne `camps: ReadonlyArray<{ id, point, medium, since, seenMinutesAgo
   | null, detector, detectorRegion, lastKnown: boolean }>` — position, milieu, dates,
   **rien d'autre** : ni composition, ni effectif, ni nation (test de forme, comme pour les arcs).
   `until !== null` → `lastKnown: true` (lot C dit quand elle s'efface).
5. **Carte** : un camp relevé se dessine au point avec la **silhouette de domaine** d'un arc
   adverse (jamais un sprite national), encre sourde ; délavé quand `lastKnown` ; étiquette
   « camp inconnu · relevé HH:MM » / « dernière position · il y a Xh » (`labels.ts`). Clic gauche :
   un cartouche qui dit ce qu'on sait (milieu, depuis quand, par quoi). Clic droit : **lot B**.
6. **Sol non reconnu** ne change pas (ADR 0019 §6, conservé).

Tests : `detection.test.ts` — une infanterie posée à 30 km d'une infanterie adverse posée →
chacune a un camp relevé de l'autre, aucune ne connaît l'autre comme mouvement ; à 70 km →
rien ; l'une part → la ligne de l'autre se ferme (`until`), la colonne devient un mouvement
relevé ; une garnison d'avant-poste dans la portée d'une station d'écoute est relevée ; forme de
`camps` sans `ownerId` ni composition.

## Lot B — rien ne se bat sans ordre, et l'attaque vise un relevé (ADR 0024 §3-§4)

1. **`standAt` ne cherche plus de défense** : une marche s'arrête où elle arrive, quoi qu'il y
   ait à 25 km. Supprime l'appel à `defenceOf` et la passe qui suivait ; `retainStandingDefence`
   avec.
2. **La rencontre en route disparaît** : plus de `firstMobileEncounter` dans `reassessDetection`,
   plus de `contactJobId` planifié, `movements.encounter` retiré ; le champ `contactJobId` reste
   au schéma en `v.optional`, jamais écrit, le temps d'un wipe (règle du schéma). La géométrie
   (`src/domain/interception.ts`) **reste** avec ses tests — l'intercepteur V1 la reprendra.
   `movementBehavior` (`'engage' | 'observe'`) : vérifie qui le lit encore ; s'il ne sert plus
   qu'à la rencontre, il part avec elle.
3. **`engageAt` engage la cible, et ce qui se tient à `ARRIVAL_RADIUS_KM` du point visé** —
   `defenceNear` devient l'allonge d'un ordre d'attaque et de lui seul. Une cible `region` (attaque
   sur une région) : garnisons de bâtiments **et** piles posées à `ARRIVAL_RADIUS_KM` du point
   d'arrivée, une seule lecture, le trou du 13/09 fermé. Rien trouvé → bredouille, comme
   aujourd'hui. Le pillage, le sabotage, le ramassage, le raid ne changent pas : ils visaient déjà
   un objet.
4. **La cible d'une attaque est un objet relevé.** `MovementAim` gagne `{ kind: 'camp'; campId;
   lon; lat; hostCountry }` (le camp relevé, lot A) ; `refusalOf('attack', aim)` accepte `camp`,
   `outpost`, et un `point`/`region` **seulement s'il porte une installation relevée**
   (`surveyedInstallations`) ou un objectif neutre quand ils existeront — sinon `NOTHING_TO_ATTACK`
   (code neuf, `fr.errors`). Le serveur (`movements.attack`, `aimOf`) applique la même fonction :
   la rose et le serveur sortent de `legalMovementTypes`, rien n'est grisé, la rose n'ouvre
   « attaquer » que sur un camp, une installation relevée, un avant-poste adverse. Une attaque
   peut partir de **n'importe quelle pile** du joueur, à portée ou non — c'est le relevé qui
   ouvre la cible, pas la distance.
5. **Le camp visé est une position** : `aimOf` résout `camp` en son point ; à l'arrivée,
   `engageAt` engage ce qui s'y tient à `ARRIVAL_RADIUS_KM` — si le camp est parti, bredouille
   (`columnFoundNothing`, la dépêche existante). Pas de poursuite.
6. **La riposte reste automatique** : attaqué, un camp se bat par la passe normale, initiative à
   l'attaquant (ADR 0014) — rien à écrire, vérifie seulement qu'aucun chemin ne l'a perdue.
7. **Docs** : `CLAUDE.md` § « Le combat existe » et § « La détection est passive » (les phrases
   sur le contact mobile et l'embuscade) ; la table de l'ADR 0021 §3 (une ligne de révision
   sous la table, ne la réécris pas).

Tests : `movements.test.ts` — une marche s'arrête à 10 km d'un camp adverse : aucune passe,
deux camps, chacun relève l'autre (lot A) ; deux colonnes `attack` qui se croisent : aucune
passe ; `attack` sur un point vide → `NOTHING_TO_ATTACK` ; `attack` sur un camp relevé → passe à
l'arrivée, initiative à l'attaquant, le camp riposte ; le camp est parti avant l'arrivée →
`columnFoundNothing` ; `attack` sur une région qui porte une installation relevée → engage la
pile posée à 20 km du point d'arrivée. Le scénario public de `plunder.test.ts` et les tests de
`combat` restent verts sans réécriture de leur sens — s'ils cassent, c'est qu'ils comptaient sur
un contact automatique : dis lequel.

## Lot C — la dernière position connue survit (ADR 0024 §2)

1. `sightings` gagne `frozen: v.optional({ points, legs, distanceUnits, costUnits,
   headingDegrees, closedAt })`. `forgetMovement` : `from > now` → supprimée (avec son
   `revealJobId`) ; sinon → `patch` avec `frozen = seenSegment(force, from, min(to, now))`, la ligne
   reste. Il lit le mouvement avant de le supprimer.
2. `detectedArcs` : `movement === null` sert `frozen` si `closedAt > now − LAST_KNOWN_HOURS`
   (`arrivesAt = seenTo = closedAt`, `headingAtMe` avec une distance restante nulle) ; sinon
   ignorée. `LAST_KNOWN_HOURS = 24` dans `constants.ts`, `@a-mesurer`
   (`node scripts/generate-a-mesurer.mjs`).
3. **Même délai pour les camps** : une ligne `campSightings` fermée depuis plus de
   `LAST_KNOWN_HOURS` n'est plus servie. Ménage des lignes périmées (arcs et camps) dans
   `reassessDetection`, qui touche déjà l'index — pas de travail planifié.
4. Client : `lastKnown` a `progress = 1`, `seenMinutesAgo` sur `seenTo` ; l'étiquette dit
   « dernière position · il y a Xh ».

Tests : `detection.test.ts` — une colonne vue arrive à 30 km du guetteur → arc `lastKnown` au
point d'arrivée **et** un camp relevé au même point (les deux coexistent : l'un est le souvenir du
fil, l'autre la vue du camp) ; à `+ LAST_KNOWN_HOURS + 1 min` l'arc a disparu, le camp reste tant
qu'il est couvert ; fenêtre jamais ouverte → rien ; colonne détruite en route → tronçon coupé à
l'instant de la passe.

## Ce que ce prompt ne fait pas

Pas d'intercepteur ni de poursuite (V1), pas d'agent dormant, pas d'identification (composition
toujours cachée), pas de changement aux portées ni à `ARRIVAL_RADIUS_KM`, pas de changement à la
rumeur ni aux caisses. Le prompt `objectifs-neutres` (dans `ready/`) devra viser un objectif
comme une cible d'attaque au sens du lot B — note-le dans le rapport s'il faut y toucher.

## Rapport attendu

Par lot : tests ajoutés, ce qui a cassé et pourquoi ; le coût mesuré de `reassessDetection` avant
/ après le lot A ; la liste de ce que `movementBehavior` et `interception.ts` gardent comme
lecteurs ; le `verifier` vert.
