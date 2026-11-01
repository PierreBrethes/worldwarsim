# Mine de fer — mine.glb

Un carreau de mine de fer des années 1930 : un chevalement d'acier à deux molettes au-dessus du
bâtiment de recette, une annexe, un terril de minerai rougeâtre et un wagonnet sur rail. Dans
« La Manchette » (stratégie, presse illustrée de 1940), elle tire l'acier d'un gisement de fer ;
ses molettes tournent quand elle produit et s'arrêtent quand on la sabote. (La mine de charbon
est un modèle frère, `coalMine.glb`.)

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la façade de la recette regarde +z. Origine
au sol (y = 0), au centre de l'emprise. Rien sous y = 0. « Gauche » = +x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m. Rez-de-chaussée de 4 m, étage de 3,5 m,
fenêtres de 1,6 à 2 m, portes d'homme de 3,3 m. Le modèle précédent avait un chevalement de 55 m,
une porte de 9 m et des fenêtres de 3,7 m : ne pas l'imiter.

- **Emprise** : 50 m (x) × 40 m (z).
- **Recette** : 20 m (x de −10 à +10) × 16 m (z de −2 à +14), brique à chaînages de béton,
  rez-de-chaussée 4 m et un étage 3,5 m, égout à 8 m, toit à deux pans. Fenêtres 1,6 × 2 m ;
  porte d'homme 1,6 × 3,3 m ; porte de berline de 3 × 3,5 m sur le pignon +x, d'où sort le rail.
- **Chevalement** : treillis d'acier à quatre montants au-dessus de l'arrière de la recette
  (centre en x = 0, z = −2), 24 m de haut, jambe de force inclinée vers −z ; plate-forme à 22 m
  avec garde-corps. Deux molettes de Ø 4 m côte à côte (x = −1,2 et +1,2), axe horizontal le long
  de x, à 24 m. Deux câbles descendent des molettes dans la recette, deux autres vers le bâtiment
  du treuil, derrière (−z).
- **Annexe** (lampisterie, compresseur) : 12 × 10 m, à x de −24 à −12, un niveau de 4,5 m.
- **Terril** : cône de minerai rougeâtre, Ø 20 m, 9 m de haut, centré en (+16 ; 0 ; −10).
- **Rail** : voie de 0,6 m, du pignon +x de la recette (x = +10, z = +6) vers le pied du terril
  (x = +22), au sol.
- **Hampe** : 10 m au sol à x = −22, z = +16 ; drapeau de 3 × 2 m (3:2 exact).

## Le socle, la cour, le signe

Ce site est une maquette posée sur sa base de wargame (ADR 0038). Tout le site tient sur le socle ; le bâtiment, ses portes et ses pièces nommées gardent leurs mètres et leurs pivots, simplement rehaussés de 2,2 m (le dessus du socle). **Le bâtiment lui-même ne change pas.** Les x et z des tableaux qui suivent restent vrais.

**Rehausse.** L'origine du fichier reste au même (x, z), au pied du socle (y = 0) ; le dessus du socle est à y = 2,2. Toute cote y des tableaux ci-dessous se lit **+2,2 m** : un pivot ou un repère donné à y = 0 passe à 2,2. En particulier : `molette_1` (−1,2 ; 26,2 ; −2), `molette_2` (+1,2 ; 26,2 ; −2), `wagonnet` (+11 ; 2,2 ; +6), `rail` à 2,2, `fx_sortie` (+10,2 ; 2,2 ; +6), `fx_smoke` +2,2 m. Seul le socle descend jusqu'à y = 0.

- `socle`, fixe : rectangle aux coins arrondis (rayon 6 m), dessus à y = 2,2 m, biseau de 0,8 m à 45° sur tout le tour. Couleur papier, à peine plus claire que la feuille (#ebe1c8, L* 90), flanc et biseau plus sombres (#bfae8a). Ici 66 × 73 m : x de −33 à 33, z de −28 à 45. Il enveloppe la recette, l'annexe, le terril et le rail : 8 m de débord sur les côtés et derrière, 25 m devant la recette pour le carreau. Rien du site ne dépasse le socle sauf le drapeau au vent.
- `lisere`, fixe, matériau `lisere` à part (le jeu le teint à l'encre de la nation) : une bande de 3 m de large sur le bord du dessus du socle, 6 cm au-dessus, blanc neutre dans le GLB.
- `cour`, fixe : les sols peints sur le socle, 4 cm d'épaisseur au plus ; les rangs, tirets, joints et sillons sont peints dans l'atlas, pas modelés. Valeurs proches du socle : 10 à 20 points de L* plus sombres au plus, jamais saturées. Ici : mâchefer et gravier du carreau devant la recette (z de +14 à +42), traverses de la voie du rail peintes jusqu'au pied du terril ; une aire de minerai rougeâtre sous l'annexe.
- `signe`, fixe : le chevalement d'aérage : un second chevalement d'acier, fixe, de 30 m (quatre montants de treillis, pied de 5 × 5 m, jambe de force vers −z, plate-forme à 28 m, une molette fixe de Ø 3 m, sans lien avec `molette_1` et `molette_2`), couleur rouille chaude, en (−22 ; 2,2 ; +36). Il dépasse le bâtiment d'au moins un quart de sa hauteur (le bâtiment monte à 24 m, le signe à 30 m au moins au-dessus du socle) et le dit en silhouette noire de 40 px. Il porte seul la couleur chaude du site, une matière désaturée (brique, rayures, cuivre, minium), pas une couleur de jeu.
- `hampe` et `drapeau` passent sur le signe (mêmes noms, mêmes pivots : pied de la hampe, coin haut de la toile). La hampe (6 m, au lieu de 10) est plantée sur la plate-forme du chevalement d'aérage : pied en (−22 ; 30,2 ; +36). `fx_tete_hampe` les suit, au sommet de la hampe.
- `fx_rang` : repère vide sur la cour, en (0 ; 2,2 ; 18), au milieu du bord du rectangle côté bâtiment ; +z vers le rang. La cour laisse libre le rectangle de 30 m (x de −15 à 15) sur 14 m (z de 18 à 32) devant lui pour la garnison (le jeu y pose ses figurines), et le chemin libre de `fx_sortie` à ce rectangle. Aucun accessoire ni signe n'y entre, et la cour n'y est pas plus sombre que le socle de plus de 20 points de L*.
- Accessoires par niveau et par état, chacun un groupe fixe, tous masqués sauf un par le jeu : `niveau_1` (toujours : le minimum d'un site vivant, deux bornes peintes et un petit fanal de 2 m), `niveau_2` et `niveau_3` (ils s'ajoutent), `chantier`, `ruines`. 20 à 80 triangles par objet, 150 par groupe au plus ; aucun ne ressemble à une pièce du jeu (ni soldat, ni véhicule, ni avion, ni canon, ni bateau).
  - `niveau_2` : deux tas de minerai de 2,5 m de haut au bout du rail et une baraque de planches de 6 × 4 m (lampisterie) près du chevalement d'aérage.
  - `niveau_3` : un bâtiment bas du treuil de 10 × 8 m, derrière la recette (z ≈ −14), et une pile de bois de mine (poteaux de 4 m en tas).
  - `chantier` : échafaudage sur la recette, une chèvre de levage rouge de 12 m, tas de sable et de madriers. Le jeu coupe le bâtiment par un plan qui monte ; l'échafaudage ne dépasse pas le bâtiment et n'a besoin d'aucune pièce nommée.
  - `ruines` : gravats de brique au pied de la recette, murs arasés à 3 m, poutres noircies, tas de ferrailles ; le chevalement d'aérage reste debout.
- Budget : le bâtiment 2 500 triangles au plus ; socle, liseré, cour et signe 700 au total ; chaque groupe d'accessoires 150 ; **total sous 3 500 dans n'importe quel état**. Atlas WebP 512² au plus : cinq cases de plus (papier du socle, gravier, béton d'aire, labours, toile de tente).
- Contrôle : vu de haut à 45°, socle de 64 px de large, le site se reconnaît à son signe ; à 25 px, socle, liseré et signe seuls le disent encore. Le socle fait partie du modèle : ce n'est pas un « sol » à retirer à l'export.

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `molette_1` | moyeu de la molette −x (−1,2 ; 24 ; −2) | tourne autour de x (un sens) | Ø 4 m |
| `molette_2` | moyeu de la molette +x (+1,2 ; 24 ; −2) | tourne autour de x, sens opposé (une cage monte, l'autre descend) | Ø 4 m |
| `wagonnet` | centre du dessous, sur le rail, devant la porte de berline (+11 ; 0 ; +6) | translation le long de +x, **course 10 m** | 1,6 × 1,3 × 1 m |
| `wagonnet_caisse` | axe de bascule, au bord +z de la caisse | enfant de `wagonnet` ; bascule autour de x jusqu'à 110° pour vider le minerai | 1,4 × 0,8 × 0,9 m |
| `rail` | centre de la voie | fixe | 12 m |
| `hampe` | pied du mât (−22, 0, +16) | fixe | 10 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât | pend vers −y, s'étend vers +x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_smoke` | au-dessus du bâtiment du treuil (vapeur) | +y |
| `fx_sortie` | seuil de la porte de berline (+10,2 ; 0 ; +6) | +x |
| `fx_tete_hampe` | sommet de la hampe | +y |

## Matériaux et texture

- Matériaux nommés par matière (`brique`, `beton`, `acier`, `rouille`, `minerai`, `bois`…), une
  seule texture atlas de 512 px au plus, peinte sur canvas.
- `vitres` : les fenêtres.
- Figurine peinte, contours nets, couleurs d'époque désaturées (acier gris-vert, brique, minerai
  rouille). Aucun drapeau peint, aucun insigne.
- **Budget : 3 500 triangles par site**, dans n'importe quel état : 2 500 au plus pour le bâtiment, 700 pour le socle, le liseré, la cour et le signe, 150 par groupe d'accessoires (section « Le socle, la cour, le signe »).

## Ce que le modèle doit permettre

- Les deux molettes tournent en sens opposés tant que la mine produit ; sabotée, une fumée noire
  monte et elles s'arrêtent.
- Le wagonnet roule de la recette au pied du terril, bascule sa caisse, revient.
- La nuit, les fenêtres s'allument.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 50 m en x ; chevalement de 24 m ; le dessus du socle à y = 2,2 et le bâtiment posé dessus, rien sous y = 0.
- Chaque molette tourne sur son moyeu sans osciller ; tous les noms ci-dessus présents à
  l'identique (`sheave_*` disparaît) ; `vitres` sur les vitres ; budget de 3 500 triangles par état (bâtiment ≤ 2 500).
- Le socle (dessus à y = 2,2 m, rayon de coin 6 m, biseau 0,8 m), `lisere` (matériau `lisere`), `cour`, `signe`, `fx_rang`, `niveau_1`, `niveau_2`, `niveau_3`, `chantier` et `ruines` présents, écrits à l'identique ; `hampe`, `drapeau` et `fx_tete_hampe` sur le signe, mêmes noms, mêmes pivots.
- Le bâtiment inchangé et rehaussé de 2,2 m ; la cour libre du rectangle de 30 × 14 m devant `fx_rang` ; aucun accessoire ne ressemble à une pièce du jeu.
- Dans la page, des cases pour montrer un seul groupe (`niveau_2`, `niveau_3`, `chantier`, `ruines`) et compter les triangles de chaque état : moins de 3 500 dans tous.
