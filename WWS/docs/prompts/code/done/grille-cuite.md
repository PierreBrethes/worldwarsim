# grille-cuite — une query ne rasterise pas le monde

Lis `CLAUDE.md`, `CONVENTIONS.md`, `convex/routes.ts` (`grid ??= buildGrid(world)` dans
`routeBetween`, `routeToRegions`, `coastAtPoint`, `landAtPoint`), `convex/view.ts` lignes ~160-170
(`hostAtPoint`, `landAtPoint`, `coastAtPoint` **appelés par `playerView`** pour chaque pile posée
sur un point — `afloat`, `coastal`), `src/domain/routing.ts` (`buildGrid`, `fillLand`,
`SEA_GATES`, `RouteGrid` : `cells: Uint8Array(1600 × 832)` + `edges: Int32Array`),
`scripts/generate-world.mjs` (le générateur de `public/world.json`), `convex/regionGeometry.ts`
(le commentaire du 11/09 : « 41 ms à chaud, plusieurs secondes à froid, sans JIT »),
`convex/view-budget.test.ts`, `convex/invariants.test.ts`. Ne commit pas, ne push pas.

## Constat

En prod, à plusieurs joueurs, `view:playerView` tombe **par intermittence** sur « Function
execution timed out (maximum duration: 1s) » — l'écran « veuillez réessayer », et le second essai
passe souvent. Le suspect n° 1 est dans `view.ts` : la vue lit `afloat` / `coastal` **sur la grille
de routage** (décision du 04/09 : « coastal est lu sur la grille, jamais stocké, comme afloat »),
et la grille se construit à la première demande **de l'isolat** — `buildGrid(world)` rasterise les
polygones de pays sur 1,33 M de cellules. « 31 ms » était mesuré à chaud sur une machine de dev ;
à froid sur le VPS, sans JIT, c'est le même ordre de grandeur que les contours du 11/09 : des
secondes. Une query a **1 s**. Chaque isolat neuf paie la grille dans la première query qui la
demande — d'où « des fois ». La même bombe est sous `movements.preview` (query) et sous les
mutations de mouvement, avec le même budget.

Avant de coder, **confirmer** : dans le tableau de bord Convex du VPS (port 6791, Logs, filtre
`view:playerView`), les appels en échec sont-ils les premiers après une pause, et les suivants
rapides ? Si `playerView` est lent **à chaque** appel, c'est le volume lu (relevés, caisses,
charges groupées), pas la grille — dire lequel dans le rapport et s'arrêter pour un autre brief.

## Ce qui change

1. **La grille devient un asset, plus un calcul.** `scripts/generate-world.mjs` (ou un
   `generate-grid.mjs` à côté, lancé par la même commande) produit `public/grid.json` depuis
   `buildGrid(world)` — `step`, `width`, `height`, `cells` **encodées en plages** (RLE : la terre
   et la mer sont des aplats, le fichier doit rester sous ~200 Ko), `edges` recalculées au
   chargement (une passe sur les cellules) ou cuites aussi. Le script importe `src/domain/routing.ts`
   par `tsx`, comme les autres générateurs s'il y en a un qui le fait déjà ; sinon dis comment.
2. **`routes.ts` décode, ne construit plus.** `grid ??= decodeGrid(gridAsset, world)` : décoder
   des plages dans un `Uint8Array` prend quelques millisecondes à froid. `buildGrid` reste dans
   `src/domain/routing.ts` — c'est la référence, et le client (`isCoastCell` du fantôme de port)
   continue de l'appeler ou passe à l'asset, au choix, sans obligation dans ce lot.
3. **Trois garde-fous.**
   - `decodeGrid(asset) ≡ buildGrid(world)` : égalité byte à byte de `cells` et `edges` dans le
     vérifieur — une grille cuite périmée (un `SEA_GATES` changé, un `world.json` regénéré) casse
     la CI avant de mentir en prod. Même esprit que le miroir du simulateur.
   - **Aucune query ne rasterise** : dans `view-budget.test.ts`, un espion sur `buildGrid`
     pendant `viewOf` et `movements.preview` — zéro appel.
   - Le chrono : `decodeGrid` sous 50 ms dans le test d'invariant, mesuré, imprimé.
4. `CLAUDE.md` § trajets : « grille construite une fois par isolat, 31 ms » devient « grille cuite
   par `generate-world.mjs`, décodée à la première demande » ; `CONVENTIONS.md`, la règle déjà
   écrite le 11/09 gagne son troisième terme : *un module de `convex/` porte un nom sans tiret,
   ne travaille pas à l'import, et ne calcule pas dans une query ce qu'un script peut cuire*.

## Ce que ce prompt ne fait pas

Aucun changement au routage lui-même (Dijkstra, coûts, portes), ni aux règles `afloat` /
`coastal` (la décision du 04/09 tient : lu sur la grille, jamais stocké — la grille est juste
moins chère à avoir). Pas de découpage de `playerView` : si le tableau de bord montre du volume,
c'est un autre brief.

## Cas d'acceptation

1. `public/grid.json` existe, sous 200 Ko, régénéré par la commande documentée.
2. Le test d'égalité échoue si l'on modifie une cellule de l'asset (vérifié, puis rétabli).
3. L'espion sur `buildGrid` : zéro appel dans `viewOf` et `preview` ; les tests de routage
   (`routes.test.ts`, `movements.test.ts`) repassent tels quels sur la grille décodée.
4. `npm run verifier` vert — et, chez Pierre, plus aucun « timed out » sur `playerView` dans le
   tableau de bord sur une journée de jeu à plusieurs.

Un commit, message en français : `fix(routage): la grille est cuite par le générateur et décodée
à la demande — une query n'a qu'une seconde, la rasterisation à froid la dépassait`.
