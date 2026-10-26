# Avion de transport — airTransport.glb

L'avion de transport de chaque nation en 1940, sculpté comme une figurine de wargame peinte,
train sorti, avec sa porte latérale et sa trappe de largage. Dans « La Manchette » (stratégie,
presse illustrée de 1940), il sort de son hangar, embarque des fantassins par sa porte, charge des
caisses, et largue des paquets sous parachute en passant sans se poser.

**Nation de cette conversation : ______** — ne lis que son paragraphe dans « Par nation ».
La planche de la nation est jointe : silhouette, peinture et cocardes s'y prennent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; le nez vers +z. « Left » = l'aile gauche du
pilote, côté +x ; « right » = −x.

- **Attitude de sculpture : fuselage à l'horizontale (ligne de vol), train sorti.**
- **Origine au sol (y = 0), au milieu entre les points de contact des roues principales.**
- **La roulette de queue** pend à la hauteur qui la pose au sol quand l'avion se cabre autour de
  l'origine de son angle au sol : bas de la roulette à y = d × tan(angle).
- Envergure, longueur, hauteur : celles de la nation ; l'envergure passe la baie de 32 m.
- **Porte latérale** sur le flanc gauche (+x) du fuselage, en arrière de l'aile : 0,8 m de large
  × 1,7 m de haut, un seul battant.
- **Trappe de largage** sous le fuselage, en arrière de l'aile : 1,2 m (x) × 1,5 m (z).
- Rien sous y = 0.

## Pièces nommées

Les noms anglais existants se gardent. Chaque pièce qui bouge est un nœud à part, son origine où
elle tourne. Aucun autre nom pour une pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `fuselage` | origine du modèle | parent des autres | — |
| `prop_left`, `prop_right` (et `prop_center` pour un trimoteur) | moyeu de chaque hélice | enfants de `fuselage` ; tournent autour de z | — |
| `gear_left`, `gear_right` | articulation haute de chaque jambe | se replient autour de l'axe dit pour la nation ; train fixe : jamais | — |
| `wheel_left`, `wheel_right` | moyeu de chaque roue | enfants de leur jambe ; tournent autour de x | — |
| `tailwheel` | articulation de la roulette | fixe ou repliée vers l'arrière | — |
| `cabin_door` | **gond sur l'arête avant de la porte** | enfant de `fuselage` ; axe vertical ; s'ouvre vers l'extérieur et l'arrière de 160°, rabattue contre le flanc | 0,8 × 1,7 m |
| `bay_door` | **gond sur l'arête avant de la trappe** | enfant de `fuselage` ; axe horizontal (x) ; s'abaisse de 90° vers le bas | 1,2 × 1,5 m |
| `fond_sombre` | centre du plan | enfant de `fuselage` ; plan noir mat 0,2 m en dedans de la porte : les hommes qui montent s'y effacent | 0,8 × 1,7 m |
| `fond_sombre_soute` | centre du plan | plan noir mat 0,2 m au-dessus de la trappe | 1,2 × 1,5 m |

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_porte` | au sol, 1,5 m devant la porte ouverte (côté +x) | +x : où la file attend, où l'échelle se pose |
| `fx_parachute` | sous la trappe, 0,5 m sous le fuselage | −y : d'où tombe le paquet |
| `fx_smoke` | à l'échappement du moteur gauche | −z |

Un seul `fx_smoke`. Pas de `fx_muzzle` sauf une tourelle dorsale (Li-2) : alors un seul, à sa
bouche.

## Matériaux et texture

- Matériaux nommés par matière, une seule texture atlas de 1 024 px au plus, peinte sur canvas,
  d'après la planche ; **sans symbole de régime** (ni croix gammée sur la dérive, ni faisceau).
- `vitres` : poste de pilotage et hublots (allumés la nuit). `feux` : rouge en bout d'aile gauche
  (+x), vert en bout d'aile droite (−x), blanc à la queue. `fond_sombre` : noir mat.
- Figurine peinte, contours nets, couleurs d'époque désaturées.
- **Moins de 1 500 triangles.**

## Ce que le modèle doit permettre

- Il roule au seuil de son hangar ; la porte s'ouvre de 160° ; une file d'hommes de 2,6 m monte
  par une échelle depuis `fx_porte` et s'efface dans le noir ; la porte se referme.
- Il décolle, rentre son train ; au-dessus d'un avant-poste, la trappe s'abaisse, un paquet tombe
  sous sa corolle depuis `fx_parachute`, la trappe se referme.
- La nuit, hublots et feux de position allumés.

## Par nation

Couleurs et marquages cités ici sont indicatifs : en cas d’écart, la planche jointe fait foi.

Envergure × longueur × hauteur (m) ; angle au sol ; hélices ; train.

- **France — Dewoitine D.338** : trimoteur de ligne à aile basse, hublots en bande. 29,36 × 22,13 ×
  5,57 ; 10° ; `prop_left`, `prop_center`, `prop_right` ; train replié vers l'arrière dans les
  fuseaux ; roulette fixe. **Il passe la baie de 32 m à 1,3 m de chaque côté.**
- **Royaume-Uni — Bristol Bombay** : bimoteur à aile haute, train fixe caréné, double dérive.
  29,18 × 21,11 × 5,94 ; 11° ; `prop_left`, `prop_right` ; train fixe.
- **États-Unis — Douglas C-47 Skytrain** : bimoteur à aile basse, porte cargo à l'arrière gauche
  (la `cabin_door` est sa porte passagers). 29,11 × 19,43 × 5,18 ; 11,5° ; train replié vers
  l'avant dans les fuseaux, roues à demi saillantes ; roulette fixe.
- **URSS — Lisunov Li-2** : le DC-3 soviétique, petite tourelle dorsale. 28,81 × 19,65 × 5,15 ;
  11,5° ; comme le C-47.
- **Allemagne — Junkers Ju 52/3m** : trimoteur à aile basse épaisse, tôle ondulée, train fixe
  caréné. 29,25 × 18,90 × 4,50 ; 11° ; `prop_left`, `prop_center`, `prop_right` ; train fixe.
- **Japon — Mitsubishi Ki-57** : bimoteur de ligne à aile basse, hublots ronds. 22,6 × 16,1 × 4,86 ;
  11° ; `prop_left`, `prop_right` ; train vers l'arrière dans les fuseaux.
- **Italie — Savoia-Marchetti SM.82 Marsupiale** : trimoteur à aile médiane, gros fuselage
  ventru. 29,68 × 22,95 × 6,0 ; 11° ; `prop_left`, `prop_center`, `prop_right` ; train vers
  l'arrière dans les fuseaux.
- **Chine — Douglas DC-3 de la CNAC** : le DC-3 de ligne, métal nu. 28,96 × 19,66 × 5,16 ; 11,5° ;
  comme le C-47.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de profil, de dessus, de trois quarts
  gauche), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page : curseurs « train », « porte », « trappe ».
- 1 unité = 1 m ; envergure de la nation ± 5 % et ≤ 31,8 m ; roues principales sur y = 0 ; nez
  vers +z ; porte sur le flanc +x.
- Noms présents à l'identique : `fuselage`, les `prop*`, `gear_left`, `gear_right`, `wheel_left`,
  `wheel_right`, `tailwheel`, `cabin_door`, `bay_door`, `fond_sombre`, `fond_sombre_soute`,
  `fx_porte`, `fx_parachute`, `fx_smoke`.
- `vitres` et `feux` présents ; moins de 1 500 triangles.
