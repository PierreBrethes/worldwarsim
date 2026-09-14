# derniere-position-connue — un relevé survit à l'arrivée de la colonne

Suppose `releve-tronque` passé. Lis `CLAUDE.md`, `CONVENTIONS.md`, l'ADR 0005 (§ Conséquences :
« un arc détecté puis perdu de vue doit rester affiché comme dernière position connue, pas
disparaître »), `WWS/docs/design/04-information.md` (règle 2 et la révision du 13/09),
`convex/movement/arrival.ts` (`forgetMovement`, ligne ~53 : il efface le mouvement **et ses
`sightings`**), `convex/movements.ts` (les trois appels de `forgetMovement`, ~710 et ~820),
`convex/schema.ts` (`sightings`), `convex/view.ts` (`detectedArcs` : `if (movement === null)
continue`), `src/domain/sighting-segment.ts` (`seenSegment`), `src/data/serverView.ts`
(`asDetectedArc`, état `lastKnown`), `WWS/docs/technique/brouillard-et-fanout.md`. Ne commit
pas, ne push pas. Un chantier, un commit.

## Ce qui s'est passé en prod

Deux joueurs marchent chacun une colonne « quasiment au même endroit », à plus de
`ARRIVAL_RADIUS_KM` (25 km) l'une de l'autre mais chacune dans la portée de détection de l'autre
(60 km). Chacun a vu l'autre arriver — puis plus rien : deux camps posés, aveugles.

La règle 2 (une force posée ne se voit pas de loin) explique la moitié. L'autre moitié est un
bug contre l'ADR 0005 : à l'arrivée, `forgetMovement` supprime le mouvement **et toutes ses
lignes `sightings`**, donc la dernière position connue disparaît exactement au moment où elle
compte — le bout du tronçon vu *est* le camp adverse. Le commentaire du code le dit à l'envers
(« a sighting left behind is an arc the map is asked to draw from nothing ») : c'était vrai tant
que l'arc se dessinait depuis le mouvement ; depuis `releve-tronque`, le tronçon est une valeur
que la ligne peut porter elle-même.

## La règle

**Une fenêtre de relevé qui s'est ouverte laisse une dernière position connue, quoi qu'il
arrive à la colonne** — arrivée, retour, déroute, destruction. Le tronçon est figé dans la ligne
`sightings` au moment où le mouvement disparaît ; une fenêtre jamais ouverte s'efface comme
aujourd'hui. Une dernière position connue s'efface après `LAST_KNOWN_HOURS` (24, `@a-mesurer`,
décision 1a du 13/09) — le brouillard rend l'information périmée, il ne la rend pas éternelle, et
un joueur qui marche vingt fois ne doit pas laisser vingt fantômes sur le plateau d'en face.

## Ce qui change

1. **Schéma** — `sightings` gagne un champ optionnel `frozen: v.optional(v.object({ points,
   legs, distanceUnits, costUnits, headingDegrees, closedAt }))` (mêmes validateurs que le
   mouvement pour `points`/`legs`). Optionnel, aucune migration : une ligne sans `frozen` est un
   relevé dont le mouvement existe encore.
2. **`forgetMovement`** — pour chaque ligne du mouvement : `from > now` → supprimée (comme
   aujourd'hui, avec l'annulation du `revealJobId`) ; sinon → `patch` avec `frozen =
   seenSegment(force, from, min(to, now))` + `closedAt = min(to, now)`, la ligne reste. Il lit le
   mouvement **avant** de le supprimer (il le fait déjà pour `contactJobId`).
3. **`detectedArcs`** — `movement === null` n'est plus un `continue` : si `frozen` existe et
   `closedAt > now − LAST_KNOWN_HOURS`, l'arc est servi depuis `frozen` (mêmes champs que le
   tronçon vivant ; `arrivesAt = closedAt`, `seenTo = closedAt` ; `headingAtMe` par la règle 5 avec
   une distance restante nulle — donc vrai seulement si le camp est sur mon sol ou dans le rayon
   d'un de mes avant-postes). Sans `frozen` (ligne d'avant ce jour) ou périmée → ignorée.
4. **Ménage** — les lignes `frozen` périmées sont supprimées à l'occasion : dans `forgetMovement`
   (l'observateur concerné) ou dans `reassessDetection` — choisis le point qui touche déjà
   l'index `byPlayer`, pas un travail planifié de plus. Pas de cron.
5. **Client** — `asDetectedArc` traite déjà `now > seenTo` en `lastKnown` ; vérifie que
   `seenMinutesAgo` lit `seenTo` et que `progress = 1` (pion au bout du tronçon, décision 4a).
   L'étiquette `lastKnown` doit dire « dernière position · il y a Xh » — vérifie ce que
   `labels.ts` en fait aujourd'hui, ajoute la ligne si elle manque.
6. **Docs** — une ligne dans `brouillard-et-fanout.md` (la lecture reste sur l'index du joueur,
   les lignes figées ne joignent plus rien) ; `CLAUDE.md` § « La détection est passive » :
   « une fenêtre déjà vue devient la dernière position connue » gagne « — et le reste après
   l'arrivée, `LAST_KNOWN_HOURS` ». `LAST_KNOWN_HOURS` entre au registre `@a-mesurer`
   (`node scripts/generate-a-mesurer.mjs`).

## Tests

`convex/detection.test.ts` : une colonne vue par une troupe posée arrive à 30 km d'elle → après
l'arrivée, `viewOf(observateur).detected` a un arc `lastKnown` dont le bout est le point
d'arrivée, et le mouvement n'existe plus ; à `now + LAST_KNOWN_HOURS + 1 min` il a disparu ; une
fenêtre jamais ouverte (colonne détruite avant) ne laisse rien ; une colonne détruite en route
laisse un tronçon coupé à l'instant de la passe. `src/domain/labels.test.ts` : l'étiquette
`lastKnown`.

## Ce que ce prompt ne fait pas

Pas de détection des forces posées (règle 2, décision 3a), pas de changement à
`ARRIVAL_RADIUS_KM` (ADR 0019 §1 — la question des deux rayons, 25 et 60, est ouverte à part),
pas de relevé d'une force posée par l'arrivée d'une colonne hors du rayon d'arrivée.

## Rapport attendu

Les tests ajoutés ; où le ménage a été posé et pourquoi là ; le `verifier` vert.
