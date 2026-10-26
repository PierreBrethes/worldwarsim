# Hangar d'aérodrome — airfield.glb

Un hangar d'aviation militaire des années 1930 à voûte en arc surbaissé, murs de brique et
pignon de béton, fermé par quatre grands vantaux coulissants télescopiques. Dans « La Manchette »
(stratégie, presse illustrée de 1940), le jeu pose ce hangar **deux fois côte à côte** (10 m
d'écart) pour faire un aérodrome ; chaque avion formé sort de sa baie, roule et décolle d'une piste
dessinée devant eux.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la façade (la baie) regarde +z. Origine au
sol (y = 0), au centre de l'emprise du hangar. Rien sous y = 0. « Gauche » = côté +x (la gauche de
qui sort du hangar), « droite » = côté −x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m ; une porte d'homme fait 3,3 m de haut, une
fenêtre 1,6 à 2 m. Le modèle précédent avait des fenêtres de 5 m et une baie de 17 m : ne pas
l'imiter.

- **Emprise** : 50 m (x) × 45 m (z), x de −25 à +25, z de −22,5 à +22,5. Sol du hangar de
  plain-pied (y = 0) : un avion roule dehors sans marche.
- **Murs latéraux** (le long de z) : brique, 10 m de haut, contreforts tous les 7,5 m, une rangée
  de fenêtres industrielles de 3 m × 2 m (carreaux de 0,5 m), appui à 6 m.
- **Voûte** : arc surbaissé de 50 m de portée, naissance à 10 m sur les murs latéraux, faîte à
  17 m ; couverture de tôle grise à côtes, bande faîtière vitrée de 3 m de large.
- **Façade (pignon avant, z = +22,5)** : béton, pilastres de rive ; au-dessus de la baie, un
  tympan avec une bande vitrée de 2 m de haut.
- **Baie** : 32 m de large × 13,6 m de haut, centrée (x de −16 à +16) ; elle passe un avion de
  29 m d'envergure avec 1,5 m de chaque côté. Linteau jusqu'à 14,2 m, sous l'arc de la voûte.
- **Vantaux** : quatre, de 8,1 × 13,8 m chacun, 0,3 m d'épaisseur, pendus à un **rail double**
  (`rail_porte`) de 48 m posé sur toute la façade à 14 m de haut : voie arrière à z = +22,9, voie
  avant à z = +23,25. Fermés, ils couvrent la baie : de x = 0 à ±8,1 les vantaux du milieu (voie
  avant), de ±8 à ±16,1 ceux du bord (voie arrière). Ouverts, ils se rangent devant le mur,
  empilés de ±16,3 à ±24,4, sans dépasser la façade.
- **Porte d'homme** fixe sur le mur latéral −x, près de l'avant : 1,6 × 3,3 m.
- **Hampe** : mât de 12 m au sol à x = −28, z = +26 (hors de l'emprise, côté droit de la baie) ;
  drapeau de 3 × 2 m (3:2 exact).
- **Lanterne** au-dessus du milieu de la baie, à 14,6 m.
- **Pas de manche à air** : elle est devenue un modèle à part, posé une fois par aérodrome.

## Pièces nommées

Chaque pièce qui bouge est un nœud à part, son origine où elle glisse. Aucun autre nom pour une
pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `rail_porte` | centre du rail | fixe ; deux voies à 0,35 m l'une de l'autre, galets visibles | 48 m |
| `porte_gauche_1` | haut du vantail, à son bout +x, sur l'axe de la voie avant (x = +8,1 ; y = 14 ; z = +23,25) | translation le long de +x, **course 16,3 m** ; part le premier | 8,1 × 13,8 × 0,3 m |
| `porte_gauche_2` | haut du vantail, bout +x, voie arrière (x = +16,1 ; y = 14 ; z = +22,9) | translation +x, **course 8,3 m**, entraîné à mi-course du premier | 8,1 × 13,8 × 0,3 m |
| `porte_droite_1` | haut du vantail, bout −x, voie avant (x = −8,1 ; y = 14 ; z = +23,25) | translation −x, course 16,3 m | 8,1 × 13,8 × 0,3 m |
| `porte_droite_2` | haut du vantail, bout −x, voie arrière (x = −16,1 ; y = 14 ; z = +22,9) | translation −x, course 8,3 m | 8,1 × 13,8 × 0,3 m |
| `fond_sombre` | centre du plan | fixe ; plan noir mat dans la baie, 0,2 m derrière la façade | 32 × 13,6 m |
| `hampe` | pied du mât (−28, 0, +26) | fixe | Ø 0,15 m, 12 m |
| `drapeau` | en haut de la hampe, coin haut de la toile côté mât (−28 ; 11,8 ; +26) | pend vers −y, s'étend vers +x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 quads |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile (u depuis la hampe,
v de bas en haut) : le jeu y peint le drapeau du teneur.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_entree` | dans le hangar, 4 m derrière la baie (0 ; 0 ; +18,5) | +z |
| `fx_sortie` | au sol, sur le seuil de la baie (0 ; 0 ; +22,7) | +z : d'où part le roulage |
| `fx_tete_hampe` | sommet de la hampe (−28 ; 12 ; +26) | +y |

Pas de repère de piste : le jeu calcule la piste depuis `fx_sortie`.

## Matériaux et texture

- Matériaux nommés par matière (`brique`, `beton`, `tole`, `acier`, `bois`…), une seule texture
  atlas de 1 024 px au plus, peinte sur canvas, aucune texture externe.
- `vitres` : les fenêtres, la bande faîtière, le tympan vitré et la lanterne.
- `fond_sombre` : matériau à part, noir mat (le jeu le fait rougeoyer la nuit).
- Figurine peinte, contours nets, couleurs d'époque désaturées (brique rouge sourde, béton gris
  chaud, tôle gris-vert, vantaux gris acier à traverses). Aucun insigne, aucun drapeau peint.
- Lisible de haut à 30° sous la verticale, de 20 à 400 px à l'écran : la baie et ses vantaux
  d'abord.
- **Moins de 3 500 triangles.**

## Ce que le modèle doit permettre

- Le vantail du milieu glisse de 16,3 m sur la voie avant et entraîne celui du bord à mi-course,
  qui glisse de 8,3 m sur la voie arrière : les deux se rangent devant le mur, la baie s'ouvre en
  grand sur 32 m.
- Un avion de 11 à 29 m d'envergure naît dans le noir de `fond_sombre`, nez à la baie, et roule
  dehors par `fx_sortie` ; à l'atterrissage il rentre d'un quart de tour et s'efface dans le noir.
- Les vantaux se referment après le dernier avion.
- La nuit, les vitres, la lanterne et le fond de la baie s'allument ; l'avion s'y découpe.
- À la capture, le drapeau descend, celui du vainqueur monte (le jeu cache la hampe du second
  hangar d'un même aérodrome).

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts haute)
  et bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni lumière, ni
  caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page, un curseur qui ouvre les vantaux de 0 à 100 % : aucun ne dépasse x = ±24,5, les
  deux voies ne se croisent pas.
- 1 unité = 1 m ; emprise 50 × 45 m ; baie 32 × 13,6 m ; rien sous y = 0 ; façade vers +z.
- Les quatre noms de vantaux, `rail_porte`, `fond_sombre`, `hampe`, `drapeau`, `fx_sortie`,
  `fx_entree`, `fx_tete_hampe` présents à l'identique.
- Aucune manche à air dans le fichier ; `vitres` sur les vitres ; moins de 3 500 triangles.
