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

## Le socle, la cour, le signe

Ce site est une maquette posée sur sa base de wargame (ADR 0038). Tout le site tient sur le socle ; le bâtiment, ses portes et ses pièces nommées gardent leurs mètres et leurs pivots, simplement rehaussés de 2,2 m (le dessus du socle). **Le bâtiment lui-même ne change pas.** Les x et z des tableaux qui suivent restent vrais.

**Rehausse.** L'origine du fichier reste au même (x, z), au pied du socle (y = 0) ; le dessus du socle est à y = 2,2. Toute cote y des tableaux ci-dessous se lit **+2,2 m** : un pivot ou un repère donné à y = 0 passe à 2,2. En particulier : sol du hangar, seuils et `fx_sortie` (0 ; 2,2 ; +22,7), `fx_entree` (0 ; 2,2 ; +18,5), rail et vantaux à +2,2 m (rail à 16,2 m, pivots des vantaux à y = 16,2). Seul le socle descend jusqu'à y = 0.

- `socle`, fixe : rectangle aux coins arrondis (rayon 6 m), dessus à y = 2,2 m, biseau de 0,8 m à 45° sur tout le tour. Couleur papier, à peine plus claire que la feuille (#ebe1c8, L* 90), flanc et biseau plus sombres (#bfae8a). Ici 80 × 80 m : x de −40 à 40, z de −32 à 48. Un seul hangar sur le socle (le jeu en pose deux : l'écart entre sites se lit sur les boîtes des socles, jamais sur le hangar). Les 80 m de la maquette validée laissent 15 m de chaque côté et 25 m devant les vantaux : c'est la cour de roulage. Rien du site ne dépasse le socle sauf le drapeau au vent.
- `lisere`, fixe, matériau `lisere` à part (le jeu le teint à l'encre de la nation) : une bande de 3 m de large sur le bord du dessus du socle, 6 cm au-dessus, blanc neutre dans le GLB.
- `cour`, fixe : les sols peints sur le socle, 4 cm d'épaisseur au plus ; les rangs, tirets, joints et sillons sont peints dans l'atlas, pas modelés. Valeurs proches du socle : 10 à 20 points de L* plus sombres au plus, jamais saturées. Ici : béton gris de l'aire de roulage, joints peints tous les 8 m, devant la baie (z de +23 à +46) ; un couloir de roulage de 32 m de large (x de −16 à +16) et lisse, sans accessoire dans aucun état.
- `signe`, fixe : la tour de contrôle : fût de béton blanc de 6 × 6 m, vigie vitrée de 5 m (matériau `vitres`) en tête, rambarde, 24 m en tout, plantée en (+31 ; 2,2 ; +8), contre le flanc +x du hangar mais hors de ses vantaux ; une échelle de coupée et un toit de tuile rouge à la vigie. Il dépasse le bâtiment d'au moins un quart de sa hauteur (le bâtiment monte à 17 m, le signe à 22 m au moins au-dessus du socle) et le dit en silhouette noire de 40 px. Il porte seul la couleur chaude du site, une matière désaturée (brique, rayures, cuivre, minium), pas une couleur de jeu.
- `hampe` et `drapeau` passent sur le signe (mêmes noms, mêmes pivots : pied de la hampe, coin haut de la toile). La hampe (6 m, au lieu de 12) est plantée sur le toit de la vigie : pied en (+31 ; 26,2 ; +8). `fx_tete_hampe` les suit, au sommet de la hampe.
- `fx_rang` : repère vide sur la cour, en (-22 ; 2,2 ; 26), au milieu du bord du rectangle côté bâtiment ; +z vers le rang. La cour laisse libre le rectangle de 30 m (x de −37 à −7) sur 14 m (z de 26 à 40) devant lui pour la garnison (le jeu y pose ses figurines), et le chemin libre de `fx_sortie` à ce rectangle. Aucun accessoire ni signe n'y entre, et la cour n'y est pas plus sombre que le socle de plus de 20 points de L*.
- **Place de la manche à air** : le jeu pose le kit `manche.glb` (6 m) sur la cour, à l'endroit de ce disque libre de 8 m de diamètre, centré en (+26 ; 2,2 ; +36), hors du couloir de roulage. Rien ne l'occupe, et aucun accessoire ne s'en approche à moins de 5 m, vers −z, d'où la manche flotte. Le fichier ne contient toujours aucune manche.
- **La piste reste hors du socle** : le jeu la pose devant son bord +z (kit `piste.glb`), dans l'axe de `fx_sortie`. Le socle ne dessine aucune piste.
- Accessoires par niveau et par état, chacun un groupe fixe, tous masqués sauf un par le jeu : `niveau_1` (toujours : le minimum d'un site vivant, deux bornes peintes et un petit fanal de 2 m), `niveau_2` et `niveau_3` (ils s'ajoutent), `chantier`, `ruines`. 20 à 80 triangles par objet, 150 par groupe au plus ; aucun ne ressemble à une pièce du jeu (ni soldat, ni véhicule, ni avion, ni canon, ni bateau).
  - `niveau_2` : trois fûts d'essence rouille et un abri de tôle ondulée de 6 × 4 m le long du bord arrière (z ≈ −28).
  - `niveau_3` : un mât de vent et une cabane de balisage de 3 × 3 m au bord +x, deux piles de pneus (sans avion) ; un petit atelier ouvert à toit de tôle de 8 × 5 m à l'arrière gauche.
  - `chantier` : échafaudage sur le pignon avant et un côté du hangar, une grue-mât rouge de 16 m en (−30 ; 2,2 ; +8), tas de sable, madriers. Le jeu coupe le bâtiment par un plan qui monte ; l'échafaudage ne dépasse pas le bâtiment et n'a besoin d'aucune pièce nommée.
  - `ruines` : gravats et poutres tordues au pied du hangar, pans de brique arasés à 3 m, trace de feu noircissant le béton devant la baie.
- Budget : le bâtiment 2 500 triangles au plus ; socle, liseré, cour et signe 700 au total ; chaque groupe d'accessoires 150 ; **total sous 3 500 dans n'importe quel état**. Atlas WebP (512² visé, 1 024 au plus) : cinq cases de plus (papier du socle, gravier, béton d'aire, labours, toile de tente).
- Contrôle : vu de haut à 45°, socle de 64 px de large, le site se reconnaît à son signe ; à 25 px, socle, liseré et signe seuls le disent encore. Le socle fait partie du modèle : ce n'est pas un « sol » à retirer à l'export.

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
- **Budget : 3 500 triangles par site**, dans n'importe quel état : 2 500 au plus pour le bâtiment, 700 pour le socle, le liseré, la cour et le signe, 150 par groupe d'accessoires (section « Le socle, la cour, le signe »).

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
- 1 unité = 1 m ; emprise 50 × 45 m ; baie 32 × 13,6 m ; le dessus du socle à y = 2,2 et le bâtiment posé dessus, rien sous y = 0 ; façade vers +z.
- Les quatre noms de vantaux, `rail_porte`, `fond_sombre`, `hampe`, `drapeau`, `fx_sortie`,
  `fx_entree`, `fx_tete_hampe` présents à l'identique.
- Aucune manche à air dans le fichier ; `vitres` sur les vitres ; budget de 3 500 triangles par état (bâtiment ≤ 2 500).
- Le socle (dessus à y = 2,2 m, rayon de coin 6 m, biseau 0,8 m), `lisere` (matériau `lisere`), `cour`, `signe`, `fx_rang`, `niveau_1`, `niveau_2`, `niveau_3`, `chantier` et `ruines` présents, écrits à l'identique ; `hampe`, `drapeau` et `fx_tete_hampe` sur le signe, mêmes noms, mêmes pivots.
- Le bâtiment inchangé et rehaussé de 2,2 m ; la cour libre du rectangle de 30 × 14 m devant `fx_rang` ; aucun accessoire ne ressemble à une pièce du jeu.
- Dans la page, des cases pour montrer un seul groupe (`niveau_2`, `niveau_3`, `chantier`, `ruines`) et compter les triangles de chaque état : moins de 3 500 dans tous.
