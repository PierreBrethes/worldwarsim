# Hangar d'aérodrome — airfield.glb

Un hangar d'aviation militaire des années 1930 à voûte en arc surbaissé, murs de brique et
pignon de béton, fermé par quatre grands vantaux coulissants télescopiques. Dans « La Manchette »
(stratégie, presse illustrée de 1940), un aérodrome est un site : son socle porte **deux de ces
hangars côte à côte** (10 m d'écart, chacun aux dimensions ci-dessous, **à l'échelle 1**) ; chaque avion formé sort de sa baie, roule sur la cour et
décolle d'une piste dessinée devant eux, à laquelle le socle descend par une rampe.

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

Un aérodrome est un site : un seul socle porte les **deux hangars** côte à côte (ADR 0038). Chaque hangar est le hangar décrit plus haut **à l'échelle 1** : 50 × 45 m, baie 32 × 13,6 m (elle passe le transport de 29 m d'envergure), vantaux 8,1 × 13,8 m, courses de 16,3 et 8,3 m, rail de 48 m, faîte à 17 m ; **pas de réduction à 0,85** : à 0,85 la baie ne ferait que 27,2 m et le transport n'y passerait plus. 10 m entre eux. Ses portes et ses pièces nommées gardent leurs pivots, décalés de ∓30 m en x et rehaussés de 2,2 m (le dessus du socle). **Le bâtiment lui-même ne change pas.**

- **Hangar A** (côté −x, « droite ») : centré en (−30 ; 2,2 ; 0), x de −55 à −5. Il **garde tous les noms** de la section « Pièces nommées » (`porte_gauche_1`, `rail_porte`, `fond_sombre`, `fx_sortie`…), à leurs pivots, tous les x décalés de −30 m.
- **Hangar B** (côté +x, « gauche ») : centré en (+30 ; 2,2 ; 0), x de +5 à +55. Mêmes pièces mobiles, suffixées `_b` : `porte_gauche_1_b`, `porte_gauche_2_b`, `porte_droite_1_b`, `porte_droite_2_b`, `rail_porte_b`, `fond_sombre_b`, `fx_entree_b`, `fx_sortie_b`, avec les mêmes règles de pivot que leurs jumelles, tous les x décalés de +30 m. Même matériau `fond_sombre` et `vitres`. **Chaque hangar ouvre ses seuls vantaux** : les deux jeux sont indépendants.
- Un seul `hampe`, un seul `drapeau`, un seul `fx_tete_hampe` : sur le signe.

**Rehausse.** L'origine du fichier reste au milieu des deux hangars (x = 0, z = 0), au pied du socle (y = 0) ; le dessus du socle est à y = 2,2. Toute cote y des tableaux ci-dessous se lit **+2,2 m**, et toute cote x **−30 m** pour le hangar A, **+30 m** pour le hangar B : sol des hangars et seuils à 2,2, rails et pivots des vantaux à 16,2 (14 + 2,2). Vantaux du hangar A : `porte_gauche_1` (−21,9 ; 16,2 ; +23,25), `porte_gauche_2` (−13,9 ; 16,2 ; +22,9), `porte_droite_1` (−38,1 ; 16,2 ; +23,25), `porte_droite_2` (−46,1 ; 16,2 ; +22,9) ; ceux du hangar B : `porte_gauche_1_b` (+38,1 ; 16,2 ; +23,25), `porte_gauche_2_b` (+46,1 ; 16,2 ; +22,9), `porte_droite_1_b` (+21,9 ; 16,2 ; +23,25), `porte_droite_2_b` (+13,9 ; 16,2 ; +22,9). Repères : `fx_sortie` (−30 ; 2,2 ; +22,7) et `fx_sortie_b` (+30 ; 2,2 ; +22,7) ; `fx_entree` (−30 ; 2,2 ; +18,5) et `fx_entree_b` (+30 ; 2,2 ; +18,5). Seul le socle descend jusqu'à y = 0.

- `socle`, fixe : rectangle aux coins arrondis (rayon 6 m), dessus à y = 2,2 m, biseau de 0,8 m à 45° sur tout le tour. Couleur papier, à peine plus claire que la feuille (#ebe1c8, L* 90), flanc et biseau plus sombres (#bfae8a). Ici **126 × 88,9 m** : x de −63 à +63, z de −30,5 à +58,4. Il enveloppe les deux hangars : 8 m de débord sur les côtés et derrière, **35 m de cour** devant les vantaux (de la façade fermée, z = +23,4, au bord +z). Rien du site ne dépasse le socle sauf le drapeau au vent. **La piste reste hors du socle** : le jeu la pose devant son bord +z (kit `piste.glb`) et le socle y descend par la rampe `piste_rampe` du même kit, posée par le jeu ; le socle ne dessine ni piste ni rampe, et son bord +z est plein, lisere compris.
- `lisere`, fixe, matériau `lisere` à part (le jeu le teint à l'encre de la nation) : une bande de 3 m de large sur le bord du dessus du socle, 6 cm au-dessus, blanc neutre dans le GLB.
- `cour`, fixe : les sols peints sur le socle, 4 cm d'épaisseur au plus ; joints, tirets et rangs sont peints dans l'atlas, pas modelés. Valeurs proches du socle : 10 à 20 points de L* plus sombres au plus, jamais saturées. Ici : béton gris de l'aire de roulage devant les baies (z de +23,4 au bord +z), joints peints tous les 8 m, gravier entre et derrière les hangars. **Couloirs de roulage** : deux bandes de béton, une par hangar, x de −46 à −14 et de +14 à +46, de la façade au bord +z (la largeur de la baie) : lisses, sans accessoire dans aucun état. L'avion qui attend s'y range devant son hangar, nez vers la piste, et y fait son demi-tour : rien n'y dépasse du sol.
- `signe`, fixe : la tour de contrôle : fût de béton blanc de 6 × 6 m, vigie vitrée de 5 m (matériau `vitres`) en tête, rambarde, toit de tuile rouge, 24 m en tout, plantée en (+54 ; 2,2 ; +32,4), au coin avant +x, devant le flanc du hangar B et hors des couloirs. Elle dépasse le bâtiment d'au moins un quart de sa hauteur (les hangars montent à 17 m, la tour à 21,25 m au moins au-dessus du socle ; elle y est à 24 m) et le dit en silhouette noire de 40 px. Elle porte seule la couleur chaude du site (rayures rouge et blanc de la vigie, tuile), une matière désaturée, pas une couleur de jeu.
- `hampe` et `drapeau` passent sur le signe (mêmes noms, mêmes pivots : pied de la hampe, coin haut de la toile). La hampe (6 m, au lieu de 12) est plantée sur le toit de la vigie : pied en (+54 ; 26,2 ; +32,4). `fx_tete_hampe` les suit, au sommet de la hampe. Le `drapeau` est une grille de 12 × 6 quads au moins, UV u de 0 à la hampe à 1 au bout libre, v de 0 en haut, la toile seule dans son nœud (sans la hampe) : le jeu la fait onduler par u.
- `fx_rang` : repère vide sur la cour, en (0 ; 2,2 ; +25,4), au milieu du bord du rectangle côté bâtiment ; +z vers le rang. La cour laisse libre le **rectangle de 30 m** (x de −15 à +15) sur 14 m (z de +25,4 à +39,4) devant lui pour la garnison (le jeu y pose ses figurines) : entre les deux couloirs de roulage, qu'il mord d'1 m de chaque côté (rien n'y entre, ni de l'un ni de l'autre), et sans rien sur le chemin libre des `fx_sortie` à ce rectangle. Aucun accessoire ni signe n'y entre, et la cour n'y est pas plus sombre que le socle de plus de 20 points de L*.
- **Place de la manche à air** : le jeu pose le kit `manche.glb` (6 m) sur la cour, une fois par site, à l'endroit d'un disque libre de 8 m de diamètre centré en (−54 ; 2,2 ; +49,4), hors de tout couloir. Rien ne l'occupe, et aucun accessoire ne s'en approche à moins de 5 m. Le fichier ne contient toujours aucune manche.
- Accessoires par niveau et par état, chacun un groupe fixe, tous masqués sauf un par le jeu : `niveau_1` (toujours : deux bornes peintes et un petit fanal de 2 m), `niveau_2` et `niveau_3` (ils s'ajoutent), `chantier`, `ruines`. 20 à 80 triangles par objet, 150 par groupe au plus ; aucun ne ressemble à une pièce du jeu (ni soldat, ni véhicule, ni avion, ni canon, ni bateau).
  - `niveau_2` : trois fûts d'essence rouille et un abri de tôle ondulée de 6 × 4 m dans la bande de 8 m derrière les hangars (z ≈ −25), au milieu (x ≈ 0).
  - `niveau_3` : une cabane de balisage de 3 × 3 m au bord +x, derrière la tour (z ≈ 0), deux piles de pneus (sans avion) ; un petit atelier ouvert à toit de tôle de 8 × 5 m à l'arrière, côté −x. Rien dans les couloirs, dans le rang ni sur la place de la manche à air.
  - `chantier` : échafaudage sur le pignon avant et un côté de chaque hangar, une grue-mât rouge de 16 m en (0 ; 2,2 ; −20), tas de sable, madriers. Le jeu coupe le bâtiment par un plan qui monte ; l'échafaudage n'a besoin d'aucune pièce nommée.
  - `ruines` : gravats et poutres tordues au pied des hangars, pans de brique arasés à 3 m, trace de feu noircissant le béton devant les baies ; la tour reste debout.
- Budget : le bâtiment (les deux hangars ensemble) 2 500 triangles au plus ; socle, liseré, cour et signe 700 au total ; chaque groupe d'accessoires 150 ; **total sous 3 500 dans n'importe quel état**. Atlas WebP de 512² au plus : cinq cases de plus (papier du socle, gravier, béton d'aire, labours, toile de tente).
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
| `fx_sortie` | au sol, sur le seuil de la baie (0 ; 0 ; +22,7) | +z : d'où part le roulage ; le jeu y mesure la place de l'avion qui attend (queue à 2 m du rail, nez vers la piste) |
| `fx_tete_hampe` | sommet de la hampe (−28 ; 12 ; +26) | +y |

Pas de repère de piste : le jeu calcule la piste depuis `fx_sortie`.

## Matériaux et texture

- Matériaux nommés par matière (`brique`, `beton`, `tole`, `acier`, `bois`…), une seule texture
  atlas de 512 px au plus, peinte sur canvas, aucune texture externe.
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
- Les vantaux ne s'ouvrent qu'à la formation : l'avion sort, le hangar se referme, et l'avion attend **sur la cour, devant son hangar, nez vers la piste** (un second chasseur 13 m devant le premier). Un ordre part de la cour, hangar fermé ; le retour se gare par un demi-tour sur la cour.
- Le jeu pose la piste et la rampe `piste_rampe` (kit `piste.glb`) devant le bord +z du socle, au droit de chaque couloir : l'avion descend du socle par la rampe de 12 m et décolle de la piste de 170 × 30 m.
- Les vantaux se referment après le dernier avion.
- La nuit, les vitres, la lanterne et le fond de la baie s'allument ; l'avion s'y découpe.
- À la capture, le drapeau descend, celui du vainqueur monte (l'aérodrome n'a qu'un drapeau, sur son signe).

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts haute)
  et bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni lumière, ni
  caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page, un curseur qui ouvre les vantaux de 0 à 100 %, chaque hangar à part : aucun ne dépasse x = ±24,5 de l'axe de son hangar, les deux voies ne se croisent pas. Un avion de 29 m d'envergure traverse la baie ouverte.
- 1 unité = 1 m ; deux hangars de 50 × 45 m (échelle 1) à 10 m l'un de l'autre ; baie 32 × 13,6 m ; socle de 126 × 88,9 m ; le dessus du socle à y = 2,2 et le bâtiment posé dessus, rien sous y = 0 ; façade vers +z.
- Les quatre noms de vantaux (et leurs jumeaux `_b` sur le hangar B : `porte_gauche_1_b`…, `rail_porte_b`, `fond_sombre_b`, `fx_entree_b`, `fx_sortie_b`), `rail_porte`, `fond_sombre`, `hampe`, `drapeau`, `fx_sortie`,
  `fx_entree`, `fx_tete_hampe` présents à l'identique.
- Aucune manche à air dans le fichier ; `vitres` sur les vitres ; budget de 3 500 triangles par état (bâtiment ≤ 2 500).
- Le socle (dessus à y = 2,2 m, rayon de coin 6 m, biseau 0,8 m), `lisere` (matériau `lisere`), `cour`, `signe`, `fx_rang`, `niveau_1`, `niveau_2`, `niveau_3`, `chantier` et `ruines` présents, écrits à l'identique ; `hampe`, `drapeau` et `fx_tete_hampe` sur le signe, mêmes noms, mêmes pivots.
- Le bâtiment inchangé et rehaussé de 2,2 m ; la cour libre du rectangle de 30 × 14 m devant `fx_rang` et lisse dans les deux couloirs ; aucun accessoire ne ressemble à une pièce du jeu.
- Dans la page, des cases pour montrer un seul groupe (`niveau_2`, `niveau_3`, `chantier`, `ruines`) et compter les triangles de chaque état : moins de 3 500 dans tous.
