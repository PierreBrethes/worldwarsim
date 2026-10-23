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
démarrage ; « près » arrive après le plateau, prend la main sous une distance de 35 et la rend
au-dessus de 37 (`NEAR_UNDER`, `FAR_OVER` de `countries.ts`), sans image de plus. La coupe de l'antiméridien prolonge parfois la vraie côte dans le même arc : le moteur en
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

**Précisée le 23/10/2026 (#220).** Les dessins et la teinte du terrain ne lisent plus
`shapes(type)` : ils lisent le type de chaque cellule de 0,2 u dans `terrain-cells.json`, cuit
par `generate-region-types.mjs` depuis les mêmes rasters, où une cellule est montagne sur son
seul dénivelé (`cellMountain`, sans la règle des hauts plateaux). `RegionType`, la fiche d'une
région et les règles restent à la région.

**Précisée le 21/10/2026 : les grands lacs sont de l'eau** (décision de Pierre). Les 432 lacs de
Natural Earth 10m de 400 km² et plus (Constance, 459 km², le plus petit qu'il ait nommé ;
réservoirs compris, la carte est celle d'aujourd'hui) sont retirés des régions par mapshaper
(`-clip`, `-erase`), après un aimantage à 0,001° qui évite les liserés entre une rive et une
frontière. Ils restent dans la topologie, objet `lakes` : leur rive est une côte qu'on dessine
(`borders` la marque `lake`), jamais une côte où l'on amarre (Pierre : « la Caspienne est un lac,
pas de quais »).
- **La Caspienne est un lac, sans quai** (décision de Pierre du 21/10 : « la Caspienne est un lac,
  pas de quais »). Elle est de l'eau pour la carte et un trou pour la terre, jamais une côte où
  l'on amarre.
- **La grille** a un type de cellule `LAKE` : les grands lacs et tous les trous de la terre, la
  Caspienne comprise. Aucun mode ne la foule ni ne la navigue, une route qui y vise est refusée.
  Sans lui, un lac à moins d'une cellule de la côte se fondait dans la mer ouverte à 0,25 u
  (Nicaragua, IJsselmeer, Sivash). Un quai (`isCoastCell`) borde la mer ouverte (`openWaterOf`).
- **`coastal` dit ce que le serveur accepte** : une région est côtière quand un point prend un
  quai pour elle, `coastAtPoint` et `pointInRegion` (sortie dans `src/domain/region-raster.ts`,
  la même fonction pour le serveur et pour `generate-region-index.mjs`). La fiche dit
  « côtière » exactement là où le port est accepté. La tolérance de `pointInRegion` (deux
  cellules, ou 60 km du point de la région) rend côtières bien des régions intérieures (Cuneo,
  Florence, Konya) ; Malte reste sans port faute de cellule de terre. Ces défauts de maille sont
  ceux de `main`, suivis dans #221.
- **Le point d'une région qui a de la terre est sur l'une de ses cellules de terre**, et dans sa
  région : sinon une force posée là serait lue à flot.

Coût : +50 Ko gzip au loin, +97 Ko au près.

**Précisée le 21/10/2026 (#217, lot 4).** Les contours des territoires lisent l'atlas à leur
tour (`borders`, au niveau de la feuille) : le client ne lit plus `regions.json`. Le contour se
pose sur la frontière face au vide ou au non-tenu (amendement de l'ADR 0033).

**Précisée le 21/10/2026 (#218, lot 5).** `world.json`, `regions.json`, `generate-world.mjs`,
`generate-regions.mjs` et les dépendances `world-atlas`, `d3-geo-projection`, `topojson-client`
et `topojson-server` sont retirés : l'atlas est la seule source. `buildGrid` reste dans
`src/domain/routing.ts`, non comme code du client mais comme référence de cuisson de `grid.json`
(`generate-grid.mjs`, octet à octet) ; l'espion de `mesure-isolat.mjs` interdit désormais aux
modules de `convex/` d'importer l'atlas. `generate-deposits.mjs` lit les régions de l'atlas au
niveau près : son tirage de nourriture dépend de leur aire et de leur pôle, que l'ancienne
simplification ne donnait pas. Contre `main`, le recuit passe de 189 à 190 gisements : dix champs
de nourriture apparaissent, neuf disparaissent, dix-huit bougent ; `coal-DEU-3487`,
`iron-FRA-5325` (qui change de région) et `iron-RUS-2379` bougent de 13 à 14 km ; le pétrole n'a
pas bougé.

**Précisée le 21/10/2026 (#221).** `coastal` ne dit plus ce que la grille accepte mais la côte
de mer ouverte de l'atlas (`public/coast.json`, `generate-coast.mjs`, à lancer avant
`generate-region-index`) : 1 830 régions au lieu de 2 384. Florence, Cuneo et Konya ne sont plus
côtières, Malte, Singapour et les Bermudes le sont, et un port s'y pose (ADR 0023 amendée).

**Précisée le 22/10/2026 (#224).** Malte, Singapour et les atolls ont leur terre et leur région
côté serveur : `generate-coast.mjs` cuit aussi les anneaux des régions sans cellule (ADR 0023
amendée). Le refus « sur l'eau, seul un port se pose » (`NOT_ON_LAND`) lit cette terre.

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
- **Une saison en cours ne survit pas au socle** : le sol (terre, mer, lac), les points des
  régions, les gisements et la côte changent sous elle. On vide la base avant de le déployer, en
  pré-production comme en production ; il n'y a pas de migration.

## Ce qu'on abandonne

- `world.json` et `regions.json`, leurs deux simplifications, et le monde en 50m.
- `splitOutlines`, les cartes d'arêtes à clés texte, `NATURAL_EARTH_CODE`, et `buildGrid` côté
  client.
- La région de l'Antarctique (`ATA+00?`), que la carte ne dessine pas.
- Le découpage des Länder par polygon-clipping, qui déborde de sa pile sur les cent quarante
  liserés de la Bavière à pleine résolution : mapshaper découpe, chaque liseré rejoint le district
  qu'il borde le plus.
