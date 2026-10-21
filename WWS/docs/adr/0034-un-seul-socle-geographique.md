# ADR 0034 — Un seul socle géographique

**Statut :** acceptée (21/10/2026, #213, lot 1 du socle #209). Le générateur, le module et les
fichiers sont livrés ; le moteur, le serveur et les grilles s'y branchent aux lots 2 à 5.

**Précisée le 21/10/2026 (#214, lot 2).** `grid.json`, `region-index.json`, `region-grid.json`,
`projection.json` et `europe-sheet.json` sortent de l'atlas au niveau « près », par
`generate-grid`, `generate-region-index`, `generate-region-grid` et `generate-europe-sheet`, dans
cet ordre, après `generate-atlas` ; `generate-world` ne les enchaîne plus. La maille reste de
0,25 u. La région d'une cellule est celle de `regionAt` au centre (le test l'échantillonne),
son hôte le pays de cette région ; la côte d'une région est un arc dont l'autre côté est la mer.
Une région plus petite qu'une cellule n'a pas de cellule : elle est ancrée. Les quatre portes de Calais, Gibraltar, Ormuz et
Bab-el-Mandeb ne servent plus à rien sur la côte 10 m ; elles sont gardées (aucune ne coupe de
terre), leur retrait est une décision à part.

**Précisée le 21/10/2026 (#215, lot 3a).** La terre, la côte, l'encre des pays et le lavis côtier
du moteur lisent l'atlas par `src/map/engine/atlas-geometry.ts`. Le niveau « loin » sert au
démarrage ; « près » arrive après le plateau et se dessine sous `REGIONS_GONE_DISTANCE`, sans image
de plus. La coupe de l'antiméridien prolonge parfois la vraie côte dans le même arc : le moteur en
retire les segments dont les deux bouts sont à moins de 0,01 u du bord de la feuille, pas l'arc
entier. Le lavis suit les anneaux de la terre fusionnée, les plus longs d'abord.

**Précisée le 21/10/2026 (#216, lot 3b).** Les traits gris (deux régions d'un même pays), le
survol, la sélection et les hachures de suspension lisent l'atlas, au niveau « près » dès qu'il
est là : la couche n'est visible que sous `REGIONS_GONE_DISTANCE`. Une région s'ancre au point de
`region-index.json`, celui où le serveur pose ce qui s'y bâtit. Le terrain lit `shapes(type)` :
un massif est une forme, et son bord les arcs entre deux types. `region-types.json` est classé
sur les formes de l'atlas (`generate-region-types.mjs`) ; `deposits.json` est recuit sur la grille
des régions de l'atlas, chaque gisement dans la cellule de sa région. Seuls les contours lisent
encore `regions.json` (#217).

## Contexte

La carte lit deux géographies cuites séparément :

- `world.json` : les pays, Natural Earth 50m (world-atlas), projetés anneau par anneau ;
- `regions.json` : les régions admin-1, Natural Earth 10m simplifié à 6 %, arrondi au centième,
  les districts allemands découpés après coup.

Deux sources, deux simplifications : la côte, l'encre des pays et le trait gris des régions ne
tombent jamais au même endroit. L'enquête de #209 mesure l'écart à NE 10m brut à 0,85 km en
moyenne (4,4 km au pire) sur France–Allemagne et 3,4 km (36 km) sur la côte bretonne. Chaque couche
recoud ses traits par des cartes d'arêtes à clés texte (`splitOutlines`, `contourLines`) : 307 ms
à chaque changement de couleur sur un processeur divisé par quatre.

## Décision

1. **Une source, une topologie.** `scripts/generate-atlas.mjs` lit Natural Earth 10m admin-1
   v5.1.2 et le VG2500 du BKG, épinglés par SHA-256. Les trois Länder découpés le sont en
   lon/lat, sur le contour Natural Earth. Toutes les régions forment une seule topologie à arcs
   partagés : une frontière est un arc, dessiné une fois, des deux côtés à la fois.
2. **mapshaper `-clean`** construit cette topologie. topojson-server seul laisse 25 arcs revendiqués
   deux fois du même côté (des recouvrements de la source) ; mapshaper n'en laisse aucun, ni trou.
3. **Une projection, puis la simplification.** Chaque arc est projeté en Natural Earth 1
   (400 × 208 u), puis pesé par Visvalingam sur la feuille. Deux niveaux gardent les mêmes arcs et
   les mêmes objets : **près** (30 % des points) et **loin** (6 %). Quantification au millième
   d'unité (~110 m). Chaque niveau se répare jusqu'à ce que rien ne reste à réparer :
   - une région dont la simplification aplatit tous les anneaux retrouve entier le plus grand
     (les Maldives, le Vatican, Macao) : **chaque région a une forme, aux deux niveaux** ;
   - là où deux rives se croisent, les points entre elles reviennent ;
   - là où il n'y a plus rien à rendre, l'arrondi a replié deux arcs l'un sur l'autre (ou la
     source se croise, quelques îlots des Maldives) : le point du pli s'en va.

   Aucun arc n'en croise un autre, à aucun niveau. Un quantum de 0,002 u au loin gagnerait
   31 Ko gzip, mais le Vatican n'y a plus de forme.
4. **Deux fichiers** : `public/atlas.json` (TopoJSON, objets et arcs « loin »), lu au démarrage ;
   `public/atlas-near.json` (arcs « près », dans le même ordre, avec leur quantum), lu après le
   plateau.
5. **Un module pur**, `src/domain/atlas.ts`, lit les deux : `decodeAtlas`, puis
   `borders(differ, detail)` (les arcs dont un prédicat sépare les deux côtés), `shapes(key,
   detail)` (les régions d'une même clé fusionnées, trous compris) et `regionAt`. Chaque couche
   de la carte devient un prédicat : la côte sépare la terre de la mer, l'encre deux pays, le
   gris deux régions, le contour deux territoires.
6. **Les `regionId` restent les `adm1_code`** de Natural Earth : stables tant que la version est
   épinglée. Le générateur affiche le diff des ids contre l'atlas précédent, et un test vérifie
   que chaque id écrit en dur (capitales, gisements) existe.

## Conséquences

- Écart à NE 10m brut, près : 0,22 km en moyenne (1,6 au pire) sur France–Allemagne, 0,39 km
  (5,6) sur la côte bretonne. Loin : 1,05 (6,0) et 3,3 (28), le niveau d'aujourd'hui.
- Poids : `atlas.json` 501 Ko gzip, `atlas-near.json` 865 Ko gzip, contre 1 083 Ko pour
  `world.json` et `regions.json` aujourd'hui. Décodage et tracés : 12 ms au démarrage, 34 ms avec
  le près, une fusion de pays en 13 à 18 ms (Node, M-series).
- Les tests de données tiennent : chaque région a une forme, aucun côté d'arc n'a deux régions,
  aucun arc n'est croisé, et la terre
  n'a que deux trous, tous deux dans la source (la Caspienne, et le champ de glace de Patagonie
  que le Chili et l'Argentine n'ont jamais partagé).
- Lots suivants (#209) : les grilles du serveur cuites depuis l'atlas, maille de 0,25 u
  inchangée (ADR 0023) ; terre, côte, encre et bascule près/loin ; régions, survol, étiquettes et
  terrain ; contour centré (ADR 0033) ; puis le code mort.
- Les arcs le long de l'antiméridien (Tchoukotka, Fidji) n'ont personne de l'autre côté : un
  prédicat « terre contre mer » les compte comme côte. Le moteur les écarte au lot 3.

## Ce qu'on abandonne

- `world.json` et `regions.json`, leurs deux simplifications, et le monde en 50m.
- `splitOutlines`, les cartes d'arêtes à clés texte, `NATURAL_EARTH_CODE`, et `buildGrid` côté
  client.
- La région de l'Antarctique (`ATA+00?`), que la carte ne dessine pas.
- Le découpage des Länder par polygon-clipping, qui déborde de sa pile sur les cent quarante
  liserés de la Bavière à pleine résolution : mapshaper découpe, chaque liseré rejoint le district
  qu'il borde le plus.
