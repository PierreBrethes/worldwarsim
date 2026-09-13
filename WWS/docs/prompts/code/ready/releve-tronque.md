# releve-tronque — un relevé sert le tronçon vu et le cap, jamais la destination

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/docs/design/04-information.md` (§ « Ce que révèle un
mouvement détecté », § « Les forces posées ne se voient pas de loin »), l'ADR 0005 (dernière
position connue), l'ADR 0021 §6, `WWS/docs/technique/brouillard-et-fanout.md`,
`convex/view.ts` (`detectedArcs`, ~ligne 1004, `isAnchored`), `convex/movement/detection.ts`
(`revealSighting` ligne ~150 : la notice `movementSighted` et son `headingDegrees`),
`src/domain/interception.ts` (`positionAt`, `distanceProgressAt`, `MarchingForce`, et la
fonction qui donne le milieu à un instant — celle que le contact mobile utilise),
`src/domain/geo.ts` (`bearingDegrees`, `distanceKm`, `between` ; y a-t-il un point à distance et
cap donnés ?), `src/data/serverView.ts` (`asDetectedArc`), `src/domain/player-view.ts` (les
états `enemyDetected` et `lastKnown`), `src/map/engine/arcs.ts` (`paceOf`, ligne ~253),
`src/domain/labels.ts` (~549), `src/map/RouteScale.tsx`. Ne commit pas, ne push pas. Un
chantier, un commit.

## Décision (Pierre, 13/09/2026 — 4a)

Aujourd'hui `detectedArcs` sert **le fil entier** et **les deux extrémités déclarées** : le
premier guetteur venu apprend la destination de la colonne. La fiche 04 disait « le fil, le cap
et un horaire estimé » ; le fil entier, c'est la destination. Désormais :

**Un relevé sert le tronçon que le détecteur a vu, le cap de la colonne à sa sortie de portée, et
l'arrivée estimée. La destination et le reste du fil ne sont pas servis tant que le mouvement
n'est pas identifié** (règle 7 de la fiche 04 — aucun système ne perce encore, donc jamais pour
l'instant). Révision signalée de la fiche 04 ; l'ADR 0021 §6 en sort renforcée, pas
contredite. La règle 2 (les forces posées ne se voient pas de loin) ne bouge pas — décision 3a.

## Les règles

1. **Le tronçon vu.** Pour une ligne `sightings` `[from, to]`, le serveur sert la polyligne des
   positions de la colonne entre `from` et `to` — toute la fenêtre, y compris sa part future : le
   client la découvre en marchant (règle 4), et une fenêtre est déjà une prédiction stockée. Rien
   d'avant `from`, rien d'après `to`. `from`/`to` de l'arc deviennent les deux bouts du tronçon.
2. **Le cap** est la direction de la colonne **au dernier point vu** (les deux derniers échantillons
   du tronçon), pas `bearing(from, to)` du mouvement. La notice `movementSighted` lit le même cap.
3. **L'arrivée estimée reste** (`estimatedMinutesLeft`, la fiche 04 l'accorde) ; le milieu du
   tronçon aussi.
4. **Le pion marche le tronçon, et s'arrête à son bout** à la fermeture de la fenêtre. Après
   `seenTo`, c'est la dernière position connue : le tronçon figé, pion au bout.
5. **« Cap sur moi » devient une estimation.** Sans destination, `headingAtMe` se décide en
   prolongeant le cap depuis le dernier point vu sur la distance qu'il reste à la colonne
   (longueur du fil × part non parcourue à `seenTo`, `distanceProgressAt`), par pas d'une cellule
   de grille, et vaut vrai si un de ces points tombe sur mon sol national ou dans le rayon d'un de
   mes avant-postes (`isAnchored`, `hostAtPoint`). C'est une estimation et l'étiquette le dit
   déjà (« estimé »). Une colonne qui passe à côté de moi sans y aller n'est plus critique — c'est
   voulu.

## Ce qui change

1. **Domaine pur, testé** — `src/domain/sighting-segment.ts` (nom à toi) :
   - `seenSegment(force: MarchingForce, from: number, to: number): { points: LonLat[]; legs }` —
     échantillonne `positionAt` entre `from` et `to` (pas fixe, ~une minute de marche ou N
     échantillons, borné), insère les sommets du fil qui tombent dans l'intervalle pour ne pas
     couper un virage, et regroupe les échantillons contigus de même milieu en `legs`
     (`{ medium, distanceUnits }`), afin que `routeOf` continue de dériver le mode.
   - `headingAtExit(points): number` — cap entre les deux derniers points.
   - `pointsAhead(from: LonLat, headingDegrees: number, km: number, stepKm: number): LonLat[]`
     dans `geo.ts` s'il n'existe pas (destination le long d'un grand cercle).
   Tests : un tronçon sans sommet intérieur ; un qui traverse un virage (le sommet est dedans) ;
   un qui change de milieu au quai (deux `legs`) ; fenêtre réduite à un instant (un point, cap
   par le point précédent du fil) ; `pointsAhead` sur 0 km rend `[]`.
2. **`detectedArcs` (`view.ts`)** sert `from`, `to`, `points`, `legs`, `distanceUnits`,
   `costUnits` **du tronçon**, `headingDegrees` calculé par `headingAtExit`, `headingAtMe` par la
   règle 5, `seenFrom`/`seenTo` comme avant. `movement.to` n'est plus lu que pour l'estimation
   (`arrivesAt` reste). Test dans `view.test.ts` (ou là où `detected` est testé) : tous les points
   servis sont à moins d'un pas du fil, entre les positions à `seenFrom` et `seenTo` ; `to` servi
   ≠ `movement.to` quand la fenêtre se ferme avant l'arrivée ; `headingAtMe` vrai pour une colonne
   qui file sur mon sol, faux pour une qui passe à 300 km et vise ailleurs.
3. **`revealSighting`** : `headingDegrees` de la notice = cap à la sortie du tronçon (règle 2).
   Test existant à ajuster.
4. **Client.** `asDetectedArc` : `progress` = part du **tronçon** parcourue,
   `(min(now, seenTo) − seenFrom) / (seenTo − seenFrom)` ; nouveau champ `watchMinutesLeft`
   (`(seenTo − now) / 60 000`, 0 si passé) sur l'état `enemyDetected`. `paceOf` (`arcs.ts`) lit
   `watchMinutesLeft` pour un arc détecté — le pion doit atteindre le bout du tronçon à `seenTo`,
   pas à l'arrivée. `estimatedMinutesLeft` ne sert plus qu'au compte à rebours de l'étiquette.
   `RouteScale.totalDuration` pour un arc détecté : la répartition du tronçon seule, sans total
   (comme un arc figé). Un arc `lastKnown` : `progress = 1`, pion au bout.
5. **Docs.** Bannière de révision datée en tête de la fiche 04 § « Ce que révèle un mouvement
   détecté » (décision 4a, ce que c'était, ce que c'est, pourquoi : la destination était servie
   au premier relevé). `CLAUDE.md` § « La détection est passive » : « un fil, un cap, un horaire
   estimé » → « le tronçon vu, le cap à la sortie, un horaire estimé — jamais la destination ».
   Une ligne dans `WWS/docs/technique/brouillard-et-fanout.md` si le calcul change le coût d'une
   lecture (il ne devrait pas : c'est par ligne `sightings`, pas par mouvement).

## Ce que ce prompt ne fait pas

Pas de perceur (station d'écoute ou autre — 4c, plus tard), pas de changement à ce qui détecte
ni aux portées, pas de changement aux caisses de butin (`lootCrateSightings`) ni à la rumeur, pas
de changement à la règle 2 des forces posées. Les rangs `sightings` ne changent pas de forme.

## Rapport attendu

Les tests ajoutés ; le nombre d'échantillons servis par arc et le coût de `detectedArcs` sur une
saison à huit mouvements vus (mesure dans le test, ordre de grandeur) ; les endroits où `to`
était lu côté client et ce qu'ils lisent maintenant ; le `verifier` vert.
