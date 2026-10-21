# ADR 0034 — Un seul socle géographique

**Statut :** acceptée (21/10/2026, #213, lot 1 du socle #209). Le générateur, le module et les
fichiers sont livrés ; le moteur, le serveur et les grilles s'y branchent aux lots 2 à 5.

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
   d'unité (~110 m). Là où deux rives se croisent après simplification, les points entre elles
   reviennent ; là où l'arrondi replie deux arcs l'un sur l'autre à leur jonction, le point du
   pli s'en va. Aucun arc n'en croise un autre, à aucun niveau.
4. **Deux fichiers** : `public/atlas.json` (TopoJSON, objets et arcs « loin »), lu au démarrage ;
   `public/atlas-near.json` (arcs « près », dans le même ordre), lu après le plateau.
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
- Poids : `atlas.json` 493 Ko gzip, `atlas-near.json` 864 Ko gzip, contre 1 083 Ko pour
  `world.json` et `regions.json` aujourd'hui. Décodage et tracés : 12 ms au démarrage, 34 ms avec
  le près, une fusion de pays en 13 à 18 ms (Node, M-series).
- Les tests de données tiennent : aucun côté d'arc à deux régions, aucun arc croisé, et la terre
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
