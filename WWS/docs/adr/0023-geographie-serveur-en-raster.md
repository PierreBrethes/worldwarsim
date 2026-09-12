# ADR 0023 — La géographie du serveur est un raster à la maille de la grille

**Statut :** acceptée (12/09/2026) — **précise l'[ADR 0012](0012-trajets-multimodaux-sur-grille.md)**,
dont elle étend la grille à deux questions qu'elle ne portait pas.

## Contexte

La production recyclait l'isolat Convex en boucle — `TooMuchMemoryCarryOver("~64 MiB", "99 MiB")`
— et chaque appel qui suivait repartait à froid. La cause n'était pas un calcul mais deux
`import` : un `import` s'évalue au **chargement du module**, pas au premier appel, et ce qu'il
retient l'est pour la vie de l'isolat.

Mesuré (`node --expose-gc scripts/mesure-isolat.mjs`, 12/09/2026) :

| poste | tas retenu |
|---|---|
| `public/world.json` (polygones de 196 pays) | 11,5 Mio |
| `public/regions.json` (4 589 contours admin-1) | 22,6 Mio |
| `public/region-index.json` | 1,7 Mio |
| préparation des contours (`buildIndex`, à la demande) | 11,7 Mio |

Soit **35,9 Mio au seul import de `convex/messages.ts`** — un module qui ne parle que du
télégraphe, et qui payait la géographie parce qu'il partage un graphe d'import avec elle. Les
mémoïsations paresseuses déjà en place (`buildIndex`, `decodeGrid`) ne changent rien à cela :
elles retardent le *calcul*, jamais le chargement de l'asset.

Ce que le serveur demandait vraiment à ces trois mégaoctets de polygones : la région admin-1 sous
un point, le pays sous un point, le premier franchissement d'une frontière sur une route, et les
cellules d'un ensemble de régions. Quatre questions, toutes posées sur des points que Dijkstra
parcourt déjà à la maille de `grid.json`.

## Décision

**La géographie du serveur est cuite en raster, à la maille exacte de la grille de routage**
(1600 × 832, pas de 0,25 unité projetée ≈ 25 km à l'équateur), et le serveur ne lit plus un seul
polygone.

- `scripts/generate-region-grid.mjs` cuit `public/region-grid.json` : deux canaux par cellule —
  la région admin-1 et le pays hôte — calculés **au centre de la cellule avec les fonctions
  polygonales elles-mêmes**, `regionAtPlanePoint` et `countryAtPlanePoint`. Plages comme
  `grid.json`, 402 Ko, décodé en deux `Uint16Array` **hors tas** à la première demande de
  l'isolat.
- `public/projection.json` porte le cadre seul (`sphere`, `outline`), ce qui reste de
  `world.json` côté serveur : 4 Ko.
- **Une cellule, un indice** : les deux rasters partagent la maille, donc les buts rendus par
  `goalCellsForRegions` sont directement les cellules que Dijkstra visite, sans conversion.
- Le front continue de lire `world.json` et `regions.json` : il dessine, il a besoin des traits.

Mesuré après (même commande) : **3,1 Mio à l'import de `convex/messages.ts`**, 5,7 Mio pour le
module le plus lourd, 5,0 Mio de tas retenu par un isolat qui a tout payé (contre 48,7) plus
6,4 Mio de tampons hors tas.

### Ce que la maille coûte, nommément

**Le franchissement est exact à la cellule, et la cellule est le modèle.** Une frontière n'est
plus une ligne au flottant près : c'est le bord des cellules qui la bordent. Deux points d'une
même cellule ne peuvent plus être de deux côtés d'une frontière — c'est une perte, et elle est
mesurée :

- Sur six points frontaliers de contrôle (`convex/routes.test.ts`), quatre gardent leur réponse
  et **deux passent au voisin** : Aix-la-Chapelle (5 km de la Belgique) et Kehl (1 km du Rhin).
  Les deux lignes sont écrites dans la suite plutôt que retirées : le jour où la maille se
  resserre, elles tombent et disent ce qui a été regagné.
- Une bande côtière plus étroite qu'une demi-cellule cesse d'être « de la terre pour le polygone
  et de l'eau pour la grille » : les deux lectures n'en font plus qu'une. C'est une **convergence**
  — le *mouvement fantôme* du 09/09 venait précisément de leur désaccord.
- **971 régions sur 4 589 sont plus petites qu'une cellule** (arrondissements de capitale,
  Westminster où siège un quartier général) : aucun centre de cellule ne tombe dedans. Rien n'est
  forcé pour leur en donner une — les trente arrondissements d'une capitale tiennent dans la même
  cellule, et leur en attribuer une chacun serait inventer une géographie. Elles restent visées
  **par leur point**, qui est la seule adresse qu'elles aient jamais eue, et un retour chargé y
  entre par ce point plutôt que par un franchissement qui n'existe pas.

Aucune règle ne change. Ce qui change est la résolution à laquelle elles sont évaluées, et elle
est désormais **la même pour tout le monde** : la visée, la route, l'hôte et le relevé lisent la
même maille.

### Garde-fous

Trois, tous dans `npm run verifier`, donc dans la CI :

- **Le budget** : `node --expose-gc scripts/mesure-isolat.mjs` pèse chaque module de `convex/` à
  l'import, dans un processus neuf, et échoue au-dessus de **10 Mio**.
- **L'espion** : le même script refuse tout import de `public/regions.json` ou `public/world.json`
  depuis `convex/`. C'est la seule façon de repasser au-dessus du budget, et ce serait une
  frontière de plus que celle du raster.
- **L'égalité cuisson/calcul** : sur un échantillon fixe de deux mille cellules, le raster et le
  polygone doivent dire la même région et le même pays (`convex/invariants.test.ts`), plus
  l'identité de maille avec `grid.json` et le chrono de décodage sous 50 ms. Même esprit que
  l'égalité octet à octet de `grid.json` : on recuit ou la CI refuse.

## Conséquences

- `convex/regionGeometry.ts` ne prépare plus rien : il décode et il lit. `src/domain/region-raster.ts`
  porte la lecture pure (cellule, région, hôte, franchissement, buts), testable sans Convex.
- `countryAmong` disparaît avec son dernier appelant ; `countryAt` reste la référence dont le
  canal hôte est cuit, et le front peut encore s'en servir.
- `generate-world.mjs` chaîne la cuisson du raster comme il chaîne déjà celle de la grille : un
  monde régénéré ne peut pas laisser une géographie périmée derrière lui.
- La cuisson coûte quinze secondes, hors ligne, une fois. Elle n'est pas dans le chemin du joueur.

## Ce qu'on abandonne

La frontière exacte au point flottant côté serveur, et avec elle l'idée qu'un jeu de carte à
l'échelle du monde décide au kilomètre. Le remède, s'il en faut un, est une maille plus fine —
un doublement de résolution coûte quatre fois l'asset et se mesure avec le même script — jamais
le retour des polygones dans l'isolat.
