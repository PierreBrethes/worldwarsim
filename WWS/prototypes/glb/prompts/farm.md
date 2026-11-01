# Ferme — farm.glb

Une ferme française des années 1930 : un logis de moellons à un étage, une grange de bois à
grande porte, un silo et une éolienne de pompage à pales multiples. Dans « La Manchette »
(stratégie, presse illustrée de 1940), elle exploite des terres ; son éolienne tourne quand elle
produit et s'arrête quand on la sabote.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la façade du logis regarde +z. Origine au sol
(y = 0), au centre de l'emprise. Rien sous y = 0. « Gauche » = +x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m. Rez-de-chaussée de 4 m, étage de 3,5 m,
fenêtres de 1,6 m de haut, porte d'homme de 3,2 m, marche de 0,2 m.

- **Emprise** : 40 m (x) × 28 m (z).
- **Logis** : 17 m (x) × 10 m (z), à gauche de la cour (x de +3 à +20), façade à z = +8 ;
  rez-de-chaussée 4 m (une marche de 0,2 m), un étage de 3,5 m, égout à 7,7 m, toit de tuiles à
  40°, une souche de cheminée. Fenêtres 1,2 × 1,6 m à volets, allège 0,9 m ; porte de 1,4 × 3,2 m.
- **Grange** : 20 m (x de −20 à 0) × 24 m (z), bardage de planches sur soubassement de pierre,
  égout à 6 m, toit à 45°, faîtage à ≈ 14 m. Grande porte charretière de 4,5 × 5 m à deux battants
  (fixes), une porte d'homme.
- **Silo** : cylindre de Ø 5 m, 12 m de haut, toit conique, accolé au pignon arrière de la grange.
- **Éolienne de pompage** : pylône en treillis de 12 m dans la cour (x = +2, z = −8), roue de
  Ø 4 m à 18 pales, gouvernail-girouette ; un abreuvoir à son pied.
- **Hampe** : 10 m au sol à x = +22, z = +12 ; drapeau de 3 × 2 m (3:2 exact).

## Le socle, la cour, le signe

Ce site est une maquette posée sur sa base de wargame (ADR 0038). Tout le site tient sur le socle ; le bâtiment, ses portes et ses pièces nommées gardent leurs mètres et leurs pivots, simplement rehaussés de 2,2 m (le dessus du socle). **Le bâtiment lui-même ne change pas.** Les x et z des tableaux qui suivent restent vrais.

**Rehausse.** L'origine du fichier reste au même (x, z), au pied du socle (y = 0) ; le dessus du socle est à y = 2,2. Toute cote y des tableaux ci-dessous se lit **+2,2 m** : un pivot ou un repère donné à y = 0 passe à 2,2. En particulier : `eolienne_tete` pivote à y = 14,2, `fx_smoke` +2,2 m, marche du logis à 2,4 m, grande porte de la grange à 2,2 m. Seul le socle descend jusqu'à y = 0.

- `socle`, fixe : rectangle aux coins arrondis (rayon 6 m), dessus à y = 2,2 m, biseau de 0,8 m à 45° sur tout le tour. Couleur papier, à peine plus claire que la feuille (#ebe1c8, L* 90), flanc et biseau plus sombres (#bfae8a). Ici 64 × 62 m : x de −32 à 32, z de −22 à 40. Les 64 × 62 m de la maquette validée : 12 m de débord sur les côtés (la ferme est basse), 8 m derrière, 26 m devant le logis pour la cour de ferme. Rien du site ne dépasse le socle sauf le drapeau au vent.
- `lisere`, fixe, matériau `lisere` à part (le jeu le teint à l'encre de la nation) : une bande de 3 m de large sur le bord du dessus du socle, 6 cm au-dessus, blanc neutre dans le GLB.
- `cour`, fixe : les sols peints sur le socle, 4 cm d'épaisseur au plus ; les rangs, tirets, joints et sillons sont peints dans l'atlas, pas modelés. Valeurs proches du socle : 10 à 20 points de L* plus sombres au plus, jamais saturées. Ici : terre battue et gravier de la cour de ferme devant le logis et la grange (z de +14 à +38) ; quatre rangs de labours peints sur le bord arrière et le côté −x (sillons dans l'atlas, pas modelés) ; un abreuvoir de pierre contre l'éolienne (déjà au bâtiment).
- `signe`, fixe : le silo de brique à dôme : cylindre de brique rouge sourde de Ø 6 m et 22 m, cerclé de bandes d'acier tous les 3 m, dôme de zinc, échelle à crinoline, en (+27 ; 2,2 ; −2). Ce n'est pas le silo de 12 m accolé à la grange, qui reste au bâtiment. Il dépasse le bâtiment d'au moins un quart de sa hauteur (le bâtiment monte à 14 m, le signe à 18 m au moins au-dessus du socle) et le dit en silhouette noire de 40 px. Il porte seul la couleur chaude du site, une matière désaturée (brique, rayures, cuivre, minium), pas une couleur de jeu.
- `hampe` et `drapeau` passent sur le signe (mêmes noms, mêmes pivots : pied de la hampe, coin haut de la toile). La hampe (6 m, au lieu de 10) est plantée au sommet du dôme : pied en (+27 ; 24,2 ; −2). `fx_tete_hampe` les suit, au sommet de la hampe.
- `fx_rang` : repère vide sur la cour, en (-2 ; 2,2 ; 20), au milieu du bord du rectangle côté bâtiment ; +z vers le rang. La cour laisse libre le rectangle de 30 m (x de −17 à 13) sur 14 m (z de 20 à 34) devant lui pour la garnison (le jeu y pose ses figurines), et le chemin libre de `fx_sortie` à ce rectangle. Aucun accessoire ni signe n'y entre, et la cour n'y est pas plus sombre que le socle de plus de 20 points de L*.
- Accessoires par niveau et par état, chacun un groupe fixe, tous masqués sauf un par le jeu : `niveau_1` (toujours : le minimum d'un site vivant, deux bornes peintes et un petit fanal de 2 m), `niveau_2` et `niveau_3` (ils s'ajoutent), `chantier`, `ruines`. 20 à 80 triangles par objet, 150 par groupe au plus ; aucun ne ressemble à une pièce du jeu (ni soldat, ni véhicule, ni avion, ni canon, ni bateau).
  - `niveau_2` : une meule de foin de 4 m de haut et une charrette à bras (deux roues, brancards) près de la grange, en (−26 ; 2,2 ; +14) ; un poulailler de planches de 4 × 3 m.
  - `niveau_3` : un second abri à toit de chaume de 12 × 6 m le long du bord arrière, une pile de tonneaux et un petit verger de quatre pommiers de 5 m en (−22 ; 2,2 ; +30), hors du rang.
  - `chantier` : échafaudage sur la façade du logis et le pignon de la grange, une grue-mât rouge de 16 m, tas de sable et de moellons, madriers. Le jeu coupe le bâtiment par un plan qui monte ; l'échafaudage ne dépasse pas le bâtiment et n'a besoin d'aucune pièce nommée.
  - `ruines` : gravats et poutres noircies, murs du logis et de la grange arasés à 3 m, silo accolé ébréché à 4 m, trace de feu dans la cour.
- Budget : le bâtiment 2 500 triangles au plus ; socle, liseré, cour et signe 700 au total ; chaque groupe d'accessoires 150 ; **total sous 3 500 dans n'importe quel état**. Atlas WebP (512² visé, 1 024 au plus) : cinq cases de plus (papier du socle, gravier, béton d'aire, labours, toile de tente).
- Contrôle : vu de haut à 45°, socle de 64 px de large, le site se reconnaît à son signe ; à 25 px, socle, liseré et signe seuls le disent encore. Le socle fait partie du modèle : ce n'est pas un « sol » à retirer à l'export.

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `eolienne_tete` | sur l'axe du pylône, au sommet (+2 ; 12 ; −8) | axe vertical : la tête s'oriente au vent (roue et gouvernail) | 6 m de long |
| `eolienne_roue` | moyeu de la roue | enfant de `eolienne_tete` ; tourne autour de son axe (z local), s'arrête au sabotage | Ø 4 m |
| `hampe` | pied du mât (+22, 0, +12) | fixe | 10 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât | pend vers −y, s'étend vers −x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_smoke` | au sommet de la souche du logis | +y |
| `fx_tete_hampe` | sommet de la hampe | +y |

## Matériaux et texture

- Matériaux nommés par matière (`moellon`, `tuile`, `planches`, `zinc`, `fer`…), une seule texture
  atlas de 1 024 px au plus, peinte sur canvas.
- `vitres` : les fenêtres du logis.
- Figurine peinte, contours nets, couleurs d'époque désaturées (moellon blond, tuile brune, bois
  gris). Aucun drapeau peint, aucun insigne.
- **Budget : 3 500 triangles par site**, dans n'importe quel état : 2 500 au plus pour le bâtiment, 700 pour le socle, le liseré, la cour et le signe, 150 par groupe d'accessoires (section « Le socle, la cour, le signe »).

## Ce que le modèle doit permettre

- La roue de l'éolienne tourne tant que la ferme produit, sa tête suit le vent ; sabotée, une
  fumée noire monte et la roue s'arrête.
- La fumée du foyer sort par `fx_smoke`.
- La nuit, les fenêtres du logis s'allument.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 40 m en x ; porte de 3,2 m ; le dessus du socle à y = 2,2 et le bâtiment posé dessus, rien sous y = 0.
- La roue tourne sur son moyeu sans osciller ; tous les noms ci-dessus présents à l'identique ;
  `vitres` sur les vitres ; budget de 3 500 triangles par état (bâtiment ≤ 2 500).
- Le socle (dessus à y = 2,2 m, rayon de coin 6 m, biseau 0,8 m), `lisere` (matériau `lisere`), `cour`, `signe`, `fx_rang`, `niveau_1`, `niveau_2`, `niveau_3`, `chantier` et `ruines` présents, écrits à l'identique ; `hampe`, `drapeau` et `fx_tete_hampe` sur le signe, mêmes noms, mêmes pivots.
- Le bâtiment inchangé et rehaussé de 2,2 m ; la cour libre du rectangle de 30 × 14 m devant `fx_rang` ; aucun accessoire ne ressemble à une pièce du jeu.
- Dans la page, des cases pour montrer un seul groupe (`niveau_2`, `niveau_3`, `chantier`, `ruines`) et compter les triangles de chaque état : moins de 3 500 dans tous.
