# Arsenal — arsenal.glb

Une manufacture de munitions des années 1930 : une longue halle de brique à sheds, un pavillon de
bureaux à un étage en tête, une haute cheminée d'usine et un quai d'expédition. Dans « La
Manchette » (stratégie, presse illustrée de 1940), il transforme charbon et acier en munitions ;
il fume quand il produit et s'arrête quand on le sabote.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la façade du pavillon et le quai regardent +z.
Origine au sol (y = 0), au centre de l'emprise. Rien sous y = 0. « Gauche » = +x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m. Rez-de-chaussée de 4 m, étage de 3,5 m,
fenêtres de 1,6 à 2 m, portes d'homme de 3,3 m. Le modèle précédent avait une porte de 13 m et
des fenêtres de 9 m : ne pas l'imiter.

- **Emprise** : 80 m (x) × 36 m (z).
- **Halle de fabrication** : 64 m (x de −40 à +24) × 30 m (z), brique sur soubassement de béton,
  égout à 9 m ; toit en sheds (dents de scie) vitrés côté nord (−z), cinq dents, faîte à 13 m.
  Fenêtres industrielles en bandes de carreaux de 1,6 × 2 m, appui à 2,5 m.
- **Pavillon de bureaux** : 16 m (x de +24 à +40) × 14 m, rez-de-chaussée 4 m et un étage 3,5 m,
  toit-terrasse à acrotère à 8 m ; fenêtres 1,4 × 1,8 m ; porte d'homme de 1,6 × 3,3 m.
- **Quai d'expédition** : le long de la façade de la halle, 1,2 m de haut, 3 m de profondeur ;
  porte de quai de 4 × 4 m (seuil à 1,2 m) au milieu de la halle, à x = −8.
- **Cheminée d'usine** : brique, Ø 2,5 m à la base, 30 m de haut, à l'arrière de la halle
  (x = −30, z = −12).
- **Hampe** : 12 m au sol, à x = +36, z = +22 ; drapeau de 3 × 2 m (3:2 exact).
- Caisses de munitions et une palette sur le quai.

## Le socle, la cour, le signe

Ce site est une maquette posée sur sa base de wargame (ADR 0038). Tout le site tient sur le socle ; le bâtiment, ses portes et ses pièces nommées gardent leurs mètres et leurs pivots, simplement rehaussés de 2,2 m (le dessus du socle). **Le bâtiment lui-même ne change pas.** Les x et z des tableaux qui suivent restent vrais.

**Rehausse.** L'origine du fichier reste au même (x, z), au pied du socle (y = 0) ; le dessus du socle est à y = 2,2. Toute cote y des tableaux ci-dessous se lit **+2,2 m** : un pivot ou un repère donné à y = 0 passe à 2,2. En particulier : `porte` pivote à y = 7,5 (z = +15,2), `rail_porte` à 7,5, quai à 3,4 m, `fx_quai` (−8 ; 2,2 ; +18,5), `fx_sortie` (−8 ; 3,4 ; +15,4), `fx_smoke` (−30 ; 32,2 ; −12). Seul le socle descend jusqu'à y = 0.

- `socle`, fixe : rectangle aux coins arrondis (rayon 6 m), dessus à y = 2,2 m, biseau de 0,8 m à 45° sur tout le tour. Couleur papier, à peine plus claire que la feuille (#ebe1c8, L* 90), flanc et biseau plus sombres (#bfae8a). Ici 96 × 69 m : x de −48 à 48, z de −26 à 43. Il enveloppe la halle de 64 m, le pavillon et le quai : 8 m de débord sur les côtés et derrière, 25 m devant le quai pour la cour d'expédition. Rien du site ne dépasse le socle sauf le drapeau au vent.
- `lisere`, fixe, matériau `lisere` à part (le jeu le teint à l'encre de la nation) : une bande de 3 m de large sur le bord du dessus du socle, 6 cm au-dessus, blanc neutre dans le GLB.
- `cour`, fixe : les sols peints sur le socle, 4 cm d'épaisseur au plus ; les rangs, tirets, joints et sillons sont peints dans l'atlas, pas modelés. Valeurs proches du socle : 10 à 20 points de L* plus sombres au plus, jamais saturées. Ici : béton d'aire de la cour d'expédition devant le quai (z de +18 à +40), mâchefer sombre entre les cheminées, voie ferrée étroite peinte vers l'angle −x.
- `signe`, fixe : les deux cheminées d'usine : deux fûts de brique rouge sourde, Ø 2,4 m au pied, 38 m de haut, bagués de blanc aux deux tiers, en (+36 ; 2,2 ; +34) et (+41 ; 2,2 ; +34). Elles sont froides : seule `fx_smoke`, sur la cheminée du bâtiment, fume. Il dépasse le bâtiment d'au moins un quart de sa hauteur (le bâtiment monte à 30 m, le signe à 38 m au moins au-dessus du socle) et le dit en silhouette noire de 40 px. Il porte seul la couleur chaude du site, une matière désaturée (brique, rayures, cuivre, minium), pas une couleur de jeu.
- `hampe` et `drapeau` passent sur le signe (mêmes noms, mêmes pivots : pied de la hampe, coin haut de la toile). La hampe (6 m, au lieu de 12) est plantée à la galerie de la cheminée de gauche : pied en (+36 ; 40,2 ; +34). `fx_tete_hampe` les suit, au sommet de la hampe.
- `fx_rang` : repère vide sur la cour, en (-30 ; 2,2 ; 25), au milieu du bord du rectangle côté bâtiment ; +z vers le rang. La cour laisse libre le rectangle de 30 m (x de −45 à −15) sur 14 m (z de 25 à 39) devant lui pour la garnison (le jeu y pose ses figurines), et le chemin libre de `fx_sortie` à ce rectangle. Aucun accessoire ni signe n'y entre, et la cour n'y est pas plus sombre que le socle de plus de 20 points de L*.
- Accessoires par niveau et par état, chacun un groupe fixe, tous masqués sauf un par le jeu : `niveau_1` (toujours : le minimum d'un site vivant, deux bornes peintes et un petit fanal de 2 m), `niveau_2` et `niveau_3` (ils s'ajoutent), `chantier`, `ruines`. 20 à 80 triangles par objet, 150 par groupe au plus ; aucun ne ressemble à une pièce du jeu (ni soldat, ni véhicule, ni avion, ni canon, ni bateau).
  - `niveau_2` : une pile de rondins, trois fûts rouille et un hangar à outils de tôle de 6 × 4 m le long du bord arrière.
  - `niveau_3` : un bâtiment annexe bas (chaufferie, 10 × 8 m, toit de tôle) contre le flanc −x de la halle, et un tas de houille de 6 m de haut ; un second quai bas de 12 m.
  - `chantier` : échafaudage sur la façade du pavillon et un pan de la halle, une grue-mât rouge de 18 m, tas de sable, madriers. Le jeu coupe le bâtiment par un plan qui monte ; l'échafaudage ne dépasse pas le bâtiment et n'a besoin d'aucune pièce nommée.
  - `ruines` : gravats de brique, sheds effondrés et arasés à 3 m, poutres noircies, trace de feu sur le béton ; les cheminées du signe restent debout.
- Budget : le bâtiment 2 500 triangles au plus ; socle, liseré, cour et signe 700 au total ; chaque groupe d'accessoires 150 ; **total sous 3 500 dans n'importe quel état**. Atlas WebP 512² au plus : cinq cases de plus (papier du socle, gravier, béton d'aire, labours, toile de tente).
- Contrôle : vu de haut à 45°, socle de 64 px de large, le site se reconnaît à son signe ; à 25 px, socle, liseré et signe seuls le disent encore. Le socle fait partie du modèle : ce n'est pas un « sol » à retirer à l'export.

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `murs` | centre de la halle au sol | fixe | 64 × 9 × 30 m |
| `porte` | haut du vantail, à son bout +x, sur l'axe du rail (x = −6 ; y = 5,3 ; z = +15,2) | coulissant : translation +x, **course 4,2 m** | 4,1 × 4,1 × 0,15 m |
| `rail_porte` | centre du rail | fixe | 9 m |
| `fond_sombre` | centre du plan | fixe ; noir mat derrière la porte de quai | 4 × 4 m |
| `hampe` | pied du mât (+36, 0, +22) | fixe | 12 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât | pend vers −y, s'étend vers −x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_quai` | au sol, au pied du quai face à la porte (−8 ; 0 ; +18,5) | +z |
| `fx_sortie` | seuil de la porte de quai (−8 ; 1,2 ; +15,4) | +z |
| `fx_smoke` | au sommet de la cheminée d'usine (−30 ; 30 ; −12) : départ de la fumée de production | +y |
| `fx_tete_hampe` | sommet de la hampe | +y |

## Matériaux et texture

- Matériaux nommés par matière (`brique`, `beton`, `tole`, `fer`, `caisse_olive`…), une seule
  texture atlas de 512 px au plus, peinte sur canvas.
- `vitres` : vitrages des sheds, fenêtres, bureaux. `fond_sombre` : noir mat.
- Figurine peinte, contours nets, couleurs d'époque désaturées. Aucun drapeau peint, aucun insigne.
- **Budget : 3 500 triangles par site**, dans n'importe quel état : 2 500 au plus pour le bâtiment, 700 pour le socle, le liseré, la cour et le signe, 150 par groupe d'accessoires (section « Le socle, la cour, le signe »).

## Ce que le modèle doit permettre

- La fumée de production monte de `fx_smoke` tant que l'arsenal travaille ; sabotée, une fumée
  noire sort de la halle et la cheminée s'éteint.
- La porte de quai glisse de 4,2 m ; un camion recule à `fx_quai` et charge.
- La nuit, les sheds vitrés et les bureaux s'allument.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 80 m en x ; étages de 4 et 3,5 m ; le dessus du socle à y = 2,2 et le bâtiment posé dessus, rien sous y = 0.
- Tous les noms ci-dessus présents à l'identique ; un seul `fx_smoke` ; `vitres` sur les vitres ;
  budget de 3 500 triangles par état (bâtiment ≤ 2 500).
- Le socle (dessus à y = 2,2 m, rayon de coin 6 m, biseau 0,8 m), `lisere` (matériau `lisere`), `cour`, `signe`, `fx_rang`, `niveau_1`, `niveau_2`, `niveau_3`, `chantier` et `ruines` présents, écrits à l'identique ; `hampe`, `drapeau` et `fx_tete_hampe` sur le signe, mêmes noms, mêmes pivots.
- Le bâtiment inchangé et rehaussé de 2,2 m ; la cour libre du rectangle de 30 × 14 m devant `fx_rang` ; aucun accessoire ne ressemble à une pièce du jeu.
- Dans la page, des cases pour montrer un seul groupe (`niveau_2`, `niveau_3`, `chantier`, `ruines`) et compter les triangles de chaque état : moins de 3 500 dans tous.
