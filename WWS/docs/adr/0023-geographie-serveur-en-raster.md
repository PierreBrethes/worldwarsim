# ADR 0023 — La géographie du serveur est un raster à la maille de la grille

**Statut :** acceptée (12/09/2026) — **précise l'[ADR 0012](0012-trajets-multimodaux-sur-grille.md)**,
dont elle étend la grille à deux questions qu'elle ne portait pas.

**Amendée le 21/10/2026 (#221, décision de Pierre) : la côte d'un port revient côté serveur.** À
0,25 u la grille ne dessine pas Malte, et la tolérance de `pointInRegion` rendait côtières 755
régions de l'intérieur (Florence, Konya). Le serveur porte donc une géométrie de l'atlas, une
seule : la côte de mer ouverte de chaque région (ni lac, ni Caspienne, ni couture de
l'antiméridien), cuite par `scripts/generate-coast.mjs` en `public/coast.json` — 1 830 régions,
134 490 points, `Int32` en base64, 1,5 Mo (522 Ko gzip) — et décodée à la première pose de port
(`convex/coast.ts`, module à part : +3,6 Mio de tas et +0,9 hors tas). Seul `constructions.ts` la
paie (8,2 Mio à l'import, le plus lourd) : `queueOf` vit dans `buildingReads.ts` pour que `view.ts`,
`replay.ts` et `dev.ts` restent à 7,1–7,2 Mio, et `spotAt` ne lit la côte que pour un port. Un port se pose à 2 km au plus de la côte de **sa** région (`onRegionCoast`,
`src/domain/coast.ts`), lue par le serveur et par le fantôme ; 13 µs par appel en moyenne, 0,34 ms
au pire (`CAN-634`). Le reste lit toujours la grille : l'embarquement, le débarquement, la visée
d'une coque, l'hôte, la couleur.
L'espion de `mesure-isolat.mjs` interdit toujours l'atlas ; `coast.json` n'en est pas.
Ce qu'on abandonne : « le serveur ne lit plus un seul polygone ». Ce que ça coûte : 5 % des points
de cette côte tombent sur une terre de la grille qu'aucune eau ouverte ne borde (estuaires,
fjords). Une coque qui rentre à un tel port s'amarre à l'eau ouverte la plus proche
(`mooringOf`, l'aimantage des extrémités d'un navire) : Hambourg à l'embouchure de l'Elbe. Au pire
l'amarrage est loin du quai — 403 km sur le Saint-Laurent (Ontario, Québec), 283 au Nunavut,
230 et 221 au Groenland, 212 au Labrador.

**Amendée le 22/10/2026 (#224, décisions de Pierre du 21/10 : « ports et vraie terre sur les
îles », « les îles isolées ouvertes comme les autres ») : la terre et la région d'un point se
lisent à la précision de l'atlas.** `coast.json` porte, en plus de la côte, les rives des lacs
et des trous de la terre (33 666 points), les anneaux des 906 régions qu'aucune cellule ne porte
(7 510 points), le pays de chaque région, et chaque arc a la terre à sa gauche : 1,96 Mo, 687 Ko
gzip en tout. Deux fonctions pures de
`src/domain/coast.ts`, lues par le serveur et par la visée : `groundOf` (la grille dit la terre
qu'elle porte ; sur une cellule de mer ou de lac, un anneau de région sans cellule, ou le côté
terre de la côte de mer ouverte — de la rive, sur un lac — la plus proche à une demi-diagonale de
cellule, disent la terre) et
`regionOf` (l'anneau, puis le raster, puis la région de cette côte). `isLandingShore` y ajoute la
plage : une cellule côtière, ou une terre de l'atlas posée dans l'eau ouverte de la grille.
`landAtPoint`, `groundAtPoint`, `coastAtPoint`, `hostAtPoint`, `hostAmongCountries`,
`regionAtPoint` et `pointInRouteRegion` les lisent : débarquement, fondation, entretien, capture,
pose, nom d'un point, détecteur de territoire, retour d'une caisse, points stratégiques
(Singapour est tenu dans SGP-4872, plus dans Johor ; les points déjà posés gardent leur région).
Restent à la cellule la route (on ne marche toujours pas vers Malte depuis la Sicile,
`NO_LAND_ROUTE`) et le disque de la couleur et du relevé, où l'île sous un avant-poste est à
distance nulle. `NOT_ON_LAND` refuse l'eau, mer ou lac, et accepte la rive que la grille noie :
Cleveland, Lausanne ; le milieu du lac Érié et la Caspienne restent de l'eau.

**La grille ne perd jamais de terre**, et c'est une décision : une troupe posée sur une cellule
de terre y reste à terre, même dans une baie que la carte dessine en eau. Son prix : 16,8 % de la
mer visible à moins de 15 km d'une côte se lit comme de la terre pour les troupes. Les détroits
sont là où la maille et l'atlas se contredisent le plus : la Marmara et les Dardanelles, Djibouti,
Suez, Panama, Gibraltar, le Gris-Nez près de FRA-5334 (1,877, 50,816).

Les lectures sont rangées par des index bâtis à la première demande, un pour les boîtes d'île et
un par rive (côte, lacs), segments à une demi-diagonale de chaque case de 0,5 u : 0,5 µs par
lecture en mer comme sur la terre, contre 60 à 95 µs et 13 µs en parcourant les 1 830 côtes et
les 906 îles. Ce qu'on abandonne : « seuls ceux qui posent un port paient la côte » — tout module
qui lit le sol la porte, 9,1 Mio à l'import au plus lourd (`dev.ts`, budget de 10), 12,3 Mio de
tas et 15,8 Mio hors tas pour un isolat qui a tout payé, index compris. Sur 28 845 points tirés
sur des cellules de mer, 99,94 % disent la terre comme l'atlas ; le cadre du serveur
(`projection.json`, au centième) décale l'atlas de 0,4 km au plus, et un point au bord d'une île
simplifiée peut tomber de l'autre côté. Le client lit `coast.json` au repos, une fois la carte
affichée, et tout de suite si un geste en a besoin ; un ordre de coque vers l'eau ouverte de la
grille attend la côte plutôt que d'être refusé.

**Amendée le 22/10/2026 (#231, décisions de Pierre du 22/10 : « 1 : ok ; 2 : hum, oui comme
la map est plate ; 3 : ok ») : le chemin du serveur est tiré droit.** Le Dijkstra à huit voisins
ne tournait que par multiples de 45° : 5 coudes en médiane, 5,4 % de plus que le plus court chemin
à tout angle. Le chemin qu'il trouve est désormais **tiré** (`pullThread`, `src/domain/routing.ts`) :
sur chaque tronçon d'un seul milieu, le fil ne garde un sommet que là où la ligne droite vers le
suivant quitterait ce milieu sur la grille (`inSight`) ; un transbordement et un pas par
l'antiméridien restent des sommets, le quai est où la recherche l'a mis. Le fil n'est jamais plus
long que le chemin : sur 339 trajets, le coût baisse de 4,3 % en médiane, 7,6 % au plus, sans
retouche de l'allure. Paris → Berlin tient en une ligne.

**Le fil est redécoupé tous les deux pas de grille** (`THREAD_PIECE_CELLS`). Le serveur lit un
segment en lon/lat (`positionAt`, `firstRegionEntry`), qui s'écarte de la droite de la grille :
non redécoupé, 7 trajets sur 294 (terre ou mer) sortaient de leur milieu ; huit pas suffisent à
les y tenir tous. Deux gardent les sommets aussi denses que l'escalier, ce que `surveyStops` et
`served` échantillonnent. `rawPoints` et `steps` sont réécrits ensemble, un pas par segment.

**Une colonne ne passe plus un bras d'eau par un coin** (`cutsCorner`) : un pas diagonal à terre
entre deux cellules qui ne sont ni terre ni canal est refusé, à la recherche comme au fil, et au
champ de distances à pied. La Sicile n'est plus reliée à pied à la Calabre ; sur l'échantillon, un
trajet à pied y perd sa route et un autre s'allonge de 2,3 %. **Une coque, elle, garde le coin** :
deux terres qui se touchent par un coin sont à cette maille le golfe de Suez, les détroits danois
et l'Égée, et la règle appliquée aux coques fermait 12 trajets maritimes sur 340 et envoyait
Alexandrie à Aden par le Cap.

**Le cap d'une force relevée se dit à la rose des vents** (8 directions, `seenSegment`), au
serveur avant la vue : le fil tiré vise droit sur sa destination, et un cap au degré la livrerait.
Les mouvements en cours gardent leurs points stockés ; aucune migration.

Coût de `computeRoute` sur l'échantillon, au meilleur de trois : 6,6 ms en médiane et 158 ms au
pire avant, 7,7 ms et 181 ms après (San Francisco → New York). Ce qu'on abandonne : Theta*, qui
trouverait des chemins un peu plus courts encore pour 60 ms en médiane et 4 s au pire.

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
- **971 régions sur 4 589 sont plus petites qu'une cellule** (les quarante-cinq régions
  maltaises, les arrondissements de capitale, et **Paris** — `FRA-5333` — où siège un quartier
  général) : aucun centre de cellule ne tombe dedans. Rien n'est forcé pour leur en donner une —
  les trente arrondissements d'une capitale tiennent dans la même cellule, et leur en attribuer
  une chacun serait inventer une géographie. Elles sont **ancrées** à la cellule de leur point,
  et un retour chargé y entre par là plutôt que par un franchissement qui n'existe pas (voir
  « L'ancrage », ci-dessous).

Aucune règle ne change. Ce qui change est la résolution à laquelle elles sont évaluées, et elle
est désormais **la même pour tout le monde** : la visée, la route, l'hôte et le relevé lisent la
même maille.

### L'ancrage — la direction région → cellules est totale (13/09/2026)

La direction **cellule → région** ne change pas : elle décide de l'hôte, de la couleur, du
franchissement, et elle lit le canal, point. C'est la direction inverse — **région → cellules** —
qui était partielle, et une région sans cellule y était un trou plutôt qu'un cas.

Un **troisième canal** est cuit : pour chaque région qu'aucune cellule ne porte, l'indice de la
cellule qui contient son **point intérieur** — le pôle d'inaccessibilité que
`generate-region-index.mjs` calcule déjà, jamais recalculé ici. Une seule fonction le lit,
`cellsOfRegion(id)` : les cellules du canal qui portent le code, ou, à défaut, la cellule
d'ancrage. Les deux cas s'excluent — une région est dans l'un ou dans l'autre, jamais dans les
deux — donc c'est une bascule et non un arbitrage. `firstRegionEntry` et `isRegionBorderCell` en
sortent toutes deux, et le repli d'égalité au flottant sur le point de la région disparaît avec
elle : deux façons de répondre à une question étaient une de trop.

**L'ancrage n'est pas une couverture.** La cellule ancrée appartient au raster à une autre région,
ou à personne. Ce qu'elle dit est *par où l'on entre*, pas *ce qui est là*, et rien de ce qui lit
le sol ne la regarde.

**Plusieurs régions ancrent la même cellule**, et c'est ce qui a révélé le défaut réel. Un but de
route était **une** région par cellule, départagée au plus petit identifiant ; ce départage
perdait des destinations dans les deux sens. Mesuré sur les 4 589 régions :

| | régions sans aucun but |
|---|---|
| avant | **646** — 588 ancrées qui s'écrasaient entre elles (971 régions pour 575 cellules d'ancrage), et **58 qui ont une cellule bien à elles** mais une seule, prise par l'ancrage d'une voisine au plus petit identifiant — Westminster en était |
| après | **0** |

Un but est donc une **liste** : le but du raster d'abord, les ancrages ensuite par identifiant
croissant, et `routeToRegions` retient le premier qu'il peut suivre. **Un ancrage s'ajoute, il
n'écrase jamais.**

Ce qui ne bouge pas : **le relevé de couloir reste métrique** (`coveredRegions`,
`src/domain/control.ts`). Il mesure des kilomètres entre les haltes d'un trajet et le point de
chaque région, il est total depuis toujours, et le passer à la cellule changerait une règle de
jeu (ADR 0020 §5) au lieu de boucher un trou.

**Correction.** Les deux textes qui donnaient Westminster (`GBR-2080`) pour une région sans
cellule étaient faux : elle en a exactement une. La capitale concernée est Paris.

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
  l'égalité octet à octet de `grid.json` : on recuit ou la CI refuse. Et, depuis l'ancrage : la
  table d'ancrage couvre **exactement** les régions absentes du canal, chaque ancrage est la
  cellule où `cellAt` fait tomber le point intérieur — la cuisson refait cette arithmétique au
  lieu de l'importer, le déshabillage de types de Node ne chargeant pas `region-raster.ts` — et
  **les 4 589 régions ont au moins un but**.

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
