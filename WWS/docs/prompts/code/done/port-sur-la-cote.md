# port-sur-la-cote — le port se pose à un point de côte choisi (71b · 73a)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, puis l'ADR 0013 (révision du 04/09) et
l'ADR 0015 § « une bâtisse par région ». Ne commit pas, ne push pas. Suppose `entrer-en-garnison`
livré. Un chantier, un commit.

## Le constat

Un bâtiment n'a pas de point : il *est* le centroïde de sa région (`regionFacts(regionId).point`,
lu à onze endroits — `upkeep.ts:160`, `arrival.ts:295`, `detection.ts:247`, `view.ts:66`…). Un port
posé sur Hokkaido est donc à l'intérieur des terres, et le navire qui en part commence par une
jambe terrestre. Décisions du 04/09 : **le port, et lui seul, se pose à un point de côte choisi
par le joueur** (71b restreinte) ; **le geste part de la rose de la région** (73a). « Une bâtisse
par région » ne bouge pas.

## 1. Serveur

- `buildings.point?: LON_LAT` — optionnel, écrit **pour le port seulement** ; absent partout
  ailleurs (pas de rétro-remplissage : un port existant sans point reste au centroïde jusqu'au
  wipe, leçon du 27/08).
- **Une seule fonction `pointOfBuilding(building)`** (`convex/regions.ts` ou `sites.ts`) :
  `building.point ?? regionFacts(building.regionId).point`. Les onze lectures passent par elle —
  `grep -rn "regionFacts(building.regionId)" convex` ne doit plus rendre que des lectures de
  nom, de gisement ou de pays, jamais un point. Le client reçoit le point servi (`view.ts`), il
  ne le recalcule pas.
- `constructions.start` accepte `point?` ; refusé sauf `building === 'port'`
  (`POINT_FOR_PORT_ONLY`). Pour un port, le point est **obligatoire** (`PORT_NEEDS_A_COAST_POINT`)
  et validé : la cellule de la grille de routage (`buildGrid`, `LAND`) est de terre **et** a une
  voisine de mer — nouvelle fonction `isCoastCell` dans `src/domain/routing.ts`, lue aussi par
  le client ; le pays du point (`hostAtPoint`) est celui de la région. L'appartenance du point
  à la *région* n'est pas vérifiable serveur (les polygones de régions ne sont pas bundlés — 312
  kB, refus du 01/09) : le client la garantit, et le commentaire le dit avec la conséquence
  (« un client tordu range mal son port, il n'en gagne pas un second : `regionId` tient la
  bâtisse par région »).
- La fondation (`owedFreely`) n'est jamais un port : rien à faire là.

## 2. Client — le mode de pose

- Rose de la région → « Bâtir ici » → `ConstructionPanel` → choisir **port** n'appelle plus
  `start` : il entre en **mode de pose** (`placing: { regionId, building: 'port' }` dans
  `plateau.tsx`, cousin de la visée : même priorité sur les clics, Échap le quitte, la rose ne
  s'ouvre pas pendant).
- Un **fantôme** du port (sprite `port-40.png`, encre atténuée) suit la souris et **s'aimante**
  sur la cellule de côte la plus proche *appartenant à la région* (point-dans-polygone client,
  déjà utilisé par le survol des régions). Hors de toute côte de la région : le fantôme reste
  sur la dernière côte valide et le curseur le dit (curseur « refus » existant).
- Carte de survol : nom de la région, coût et durée du port (les mêmes que `ConstructionPanel`
  affiche), et la phrase `fr.placing.hint` (« choisissez le point de côte — Échap pour renoncer »).
- Clic → `constructions.start({ building: 'port', regionId, point })` ; le chantier part avec son
  point et le mât se dessine là dès la file. Le sprite du port en place se dessine sur
  `building.point` servi.
- Aucun autre bâtiment n'entre en mode de pose : `ConstructionPanel` garde son clic direct.

## Cas d'acceptation

1. Rose sur une région côtière → port → le fantôme apparaît, glisse le long de la côte de cette
   région seulement, refuse l'intérieur ; Échap rend la carte intacte, rien n'est enfilé.
2. Clic sur la côte → le chantier est en file avec `point` ; `me.buildings[i].point` est servi ;
   le mât et le sprite sont au point choisi, pas au centroïde.
3. `constructions.start` avec un `point` sur une mine → `POINT_FOR_PORT_ONLY` ; un port sans point
   → `PORT_NEEDS_A_COAST_POINT` ; un port sur une cellule intérieure → refus ; sur une cellule de
   côte d'un autre pays → refus.
4. Un cargo formé dans ce port part **sans jambe terrestre** : sa route commence en mer (test sur
   `computeRoute` depuis `pointOfBuilding`).
5. Une infanterie « entre en garnison » dans ce port : elle marche jusqu'au point choisi.
6. Un port d'avant-wipe sans `point` continue de se lire au centroïde, partout.
7. Une région non côtière ne propose pas le port (déjà vrai — le cas le verrouille).

`npm run verifier` vert. Un commit, message qui décrit le chantier entier.
