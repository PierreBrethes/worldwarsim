# arrivee-retenue — la colonne retenue à la frontière ne repart pas en arrière

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/docs/design/07-friction-sociale.md` (§ Plage de repos),
`src/domain/rest-window.ts` (`windowExit`), `convex/movement/rest.ts` (`restHold`),
`convex/movements.ts` (`arrive`, ligne ~620 : le `patch` d'`arrivesAt` et la notice
`movementStalled`), `convex/view.ts` (ligne ~735 : `departedAt`, `arrivesAt`, `holdUntil`),
`src/data/serverView.ts` (`asArc`), `src/domain/player-view.ts` (`borderWait`, ligne ~89),
`src/map/engine/arcs.ts` (`paceOf`, et la reprise de `progress` depuis `carried`, ligne ~134),
`src/domain/labels.ts` (la ligne `countdown` de l'arc à soi, ~533), `src/map/RouteScale.tsx`
(`totalDuration`), `convex/movements.test.ts` (« the rest window holds an arrival at the
border »). Ne commit pas, ne push pas. Un chantier, un commit.

## Ce qui s'est passé en prod

Une colonne « attaquer » atteint le sol national adverse à 01:13, pendant la plage de repos de
l'hôte. Le serveur fait ce que la fiche 07 demande : `arrive` repousse `arrivesAt` à la sortie de
la plage et replanifie. Mais la carte redessine aussitôt le pion **à 5 % du trajet**, avec
« 06:42:10 » de marche, comme si la colonne repartait de la caserne. Le joueur l'a lu comme une
erreur de datation.

## La cause

`arrive` patche `arrivesAt` sans laisser de trace de la retenue. À la lecture suivante,
`view.ts` recalcule `holdUntil = restHold(…, movement.arrivesAt)` avec le **nouvel** `arrivesAt`,
qui tombe exactement à la sortie de la plage — `insideWindow` y répond faux, donc `holdUntil`
redevient `null`. `asArc` n'a plus que `departedAt` et un `arrivesAt` repoussé de sept heures :
`progress` retombe, `minutesLeft` remonte, `paceOf` remet le pion en marche. Le serveur a
raison, la vue a perdu l'information qui distingue « retenue à la frontière » de « en route ».

## Ce qui change

1. **Le serveur garde la trace de la retenue.** Un champ optionnel `heldAt: v.number()` sur
   `movements` (schéma + validateur), écrit par `arrive` dans le même `patch` que `arrivesAt`
   (`{ arrivesAt: held, heldAt: now }`). Rien d'autre ne l'écrit ; un retour ou une résolution
   l'ignore. Dans `view.ts`, l'arc à soi sert `heldAt: movement.heldAt ?? null`, et `holdUntil`
   devient `movement.heldAt !== undefined ? movement.arrivesAt : await restHold(…)` — on ne
   recalcule pas une retenue déjà actée.
   Test `convex/movements.test.ts`, dans le `describe` existant : après la première passe de
   `arrive` pendant la plage, `heldAt` est posé et `viewOf(seat).movements[0].holdUntil` vaut
   `arrivesAt` ; après la sortie de la plage, le mouvement a disparu comme aujourd'hui.
2. **La règle de position est pure et testée.** Une fonction dans `src/domain/` (fichier à toi,
   `arc-timing.ts` par exemple) :
   `arcTiming({ departedAt, arrivesAt, heldAt, holdUntil }, now) → { minutesLeft, progress, borderWait }`.
   Retenue (`heldAt !== null`) : `progress = 1`, `minutesLeft = 0`,
   `borderWait = { resolutionInMinutes: (arrivesAt − now) / 60 000 }`. Sinon : ce que `asArc`
   calcule aujourd'hui, à l'identique. `asArc` l'appelle et ne calcule plus rien lui-même. Tests :
   les deux branches, plus une colonne en route dont `holdUntil` est déjà connu (elle marche
   encore, `borderWait` est posé, `progress < 1`).
3. **Le pion s'arrête au bout du fil.** `paceOf` rend déjà 0 quand `progress >= 1`. Mais
   `arcs.ts` reprend `carried.get(arc.id)` avant `arc.progress` : un pion porté à 0,98 par la
   boucle resterait planté à 0,98 avec une allure nulle. Quand la vue sert `progress === 1`,
   c'est 1 qui l'emporte sur la valeur portée.
4. **L'étiquette dit la retenue.** Dans `labels.ts`, la ligne `countdown` de l'arc à soi est
   remplacée, quand `borderWait !== null && minutesLeft === 0`, par une ligne `mention`
   « arrivée retenue · résolution à HH:MM » (clé `fr.labels`, heure par `asLocalTime` comme
   `plunderPresence`). Quand la colonne marche encore vers une plage connue
   (`borderWait !== null && minutesLeft > 0`), le compte à rebours reste et une ligne `mention`
   « retenue à la frontière jusqu'à HH:MM » s'ajoute dessous. Test dans `labels.test.ts` : les
   deux cas.
5. **`RouteScale`** : `totalDuration` renvoie `left` quand `progress >= 1`, soit 0 pour une
   colonne retenue — l'échelle montrerait un trajet de zéro minute. Retenue → la répartition
   seule, comme un arc figé (le commentaire au-dessus dit déjà que c'est la bonne réponse).

## Ce que ce prompt ne fait pas

Pas de changement à `windowExit` ni à la plage elle-même (le fuseau de la plage est une
question à part, tranchée ailleurs). Pas de changement à l'aperçu (`MovementPreview`,
`restBite`) : il annonce déjà la retenue avant l'envoi. Pas de sens d'`arrivesAt` modifié
ailleurs que par la trace `heldAt`. Vocabulaire : *mouvement*, *passe de résolution*, *arrivée
retenue* — jamais tick ni temps réel.

## Rapport attendu

Les tests ajoutés et ce qu'ils fixent ; si `heldAt` a dû être lu ailleurs que dans `view.ts`,
où et pourquoi ; le `verifier` vert.
