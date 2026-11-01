# Centre de recherche — researchCenter.glb

Un pavillon de laboratoire des années 1930 en brique claire, à un étage et à toit-terrasse, flanqué
d'un atelier à sheds, avec sur le toit une coupole d'observatoire tournante d'où sort une lunette,
une cheminée de laboratoire et une antenne en treillis. Dans « La Manchette » (stratégie, presse
illustrée de 1940), il cherche les cartes de recherche ; sa coupole tourne pendant qu'il cherche.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la façade regarde +z. Origine au sol (y = 0),
au centre de l'emprise. Rien sous y = 0. « Gauche » = +x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m. Rez-de-chaussée de 4 m, étage de 3,5 m,
fenêtres de 1,6 à 2 m, porte de 3,4 m, marches de 0,2 m. Le modèle précédent avait un
rez-de-chaussée de 13 m, une porte de 9,4 m et une coupole de 19 m : ne pas l'imiter.

- **Emprise** : 50 m (x) × 30 m (z).
- **Pavillon** : 34 m (x de −25 à +9) × 16 m (z de −4 à +12). Soubassement 0,8 m,
  rez-de-chaussée 4 m, étage 3,5 m, acrotère à 9,3 m, toit-terrasse. Fenêtres hautes de
  laboratoire 1,6 × 2,0 m, allège 0,9 m, en travées régulières ; pilastres.
- **Entrée** : au milieu du pavillon (x = −8, z = +12), porte à deux battants de 2,4 × 3,4 m sous
  un petit fronton ; perron de 0,8 m à quatre marches.
- **Atelier** : 16 m (x de +9 à +25) × 14 m, un niveau de 6 m, toit en sheds vitrés.
- **Observatoire** sur le toit du pavillon, au-dessus de l'entrée : tambour cylindrique de Ø 8 m et
  3 m de haut, coupole hémisphérique de Ø 8 m, fente d'observation de 1,2 m de large fermée par un
  volet ; lunette de 4 m sur sa monture.
- **Cheminée de laboratoire** (Ø 1 m, 4 m au-dessus de la terrasse) et **antenne** en treillis de
  12 m au-dessus de l'atelier.
- **Hampe** : 10 m au sol à x = +20, z = +18 ; drapeau de 3 × 2 m (3:2 exact).

## Le socle, la cour, le signe

Ce site est une maquette posée sur sa base de wargame (ADR 0038). Tout le site tient sur le socle ; le bâtiment, ses portes et ses pièces nommées gardent leurs mètres et leurs pivots, simplement rehaussés de 2,2 m (le dessus du socle). **Le bâtiment lui-même ne change pas.** Les x et z des tableaux qui suivent restent vrais.

**Rehausse.** L'origine du fichier reste au même (x, z), au pied du socle (y = 0) ; le dessus du socle est à y = 2,2. Toute cote y des tableaux ci-dessous se lit **+2,2 m** : un pivot ou un repère donné à y = 0 passe à 2,2. En particulier : `coupole` pivote à y = 14,5 (−8), `porte_gauche` et `porte_droite` à y = 3,0, `fx_sortie` (−8 ; 3,0 ; +12,2), `fx_smoke` +2,2 m. Seul le socle descend jusqu'à y = 0.

- `socle`, fixe : rectangle aux coins arrondis (rayon 6 m), dessus à y = 2,2 m, biseau de 0,8 m à 45° sur tout le tour. Couleur papier, à peine plus claire que la feuille (#ebe1c8, L* 90), flanc et biseau plus sombres (#bfae8a). Ici 66 × 60 m : x de −33 à 33, z de −20 à 40. Il enveloppe le pavillon, l'atelier et le perron : 8 m de débord sur les côtés et derrière, 22 m devant l'entrée pour la cour. Rien du site ne dépasse le socle sauf le drapeau au vent.
- `lisere`, fixe, matériau `lisere` à part (le jeu le teint à l'encre de la nation) : une bande de 3 m de large sur le bord du dessus du socle, 6 cm au-dessus, blanc neutre dans le GLB.
- `cour`, fixe : les sols peints sur le socle, 4 cm d'épaisseur au plus ; les rangs, tirets, joints et sillons sont peints dans l'atlas, pas modelés. Valeurs proches du socle : 10 à 20 points de L* plus sombres au plus, jamais saturées. Ici : gravier fin et dalles claires devant l'entrée (z de +12 à +37), pelouse peinte en bandes régulières de chaque côté de l'allée ; cadran solaire peint au sol.
- `signe`, fixe : l'observatoire : tour cylindrique de brique blonde de Ø 7 m et 20 m, coiffée d'une coupole de cuivre patiné de Ø 8,5 m (fixe : elle ne tourne pas), 24 m en tout, en (+22 ; 2,2 ; +30). Ce n'est pas la `coupole` du toit, qui reste au bâtiment. Il dépasse le bâtiment d'au moins un quart de sa hauteur (le bâtiment monte à 16,3 m, le signe à 21 m au moins au-dessus du socle) et le dit en silhouette noire de 40 px. Il porte seul la couleur chaude du site, une matière désaturée (brique, rayures, cuivre, minium), pas une couleur de jeu.
- `hampe` et `drapeau` passent sur le signe (mêmes noms, mêmes pivots : pied de la hampe, coin haut de la toile). La hampe (6 m, au lieu de 10) est plantée au sommet de la coupole fixe : pied en (+22 ; 26,2 ; +30). `fx_tete_hampe` les suit, au sommet de la hampe.
- `fx_rang` : repère vide sur la cour, en (-2 ; 2,2 ; 18), au milieu du bord du rectangle côté bâtiment ; +z vers le rang. La cour laisse libre le rectangle de 30 m (x de −17 à 13) sur 14 m (z de 18 à 32) devant lui pour la garnison (le jeu y pose ses figurines), et le chemin libre de `fx_sortie` à ce rectangle. Aucun accessoire ni signe n'y entre, et la cour n'y est pas plus sombre que le socle de plus de 20 points de L*.
- Accessoires par niveau et par état, chacun un groupe fixe, tous masqués sauf un par le jeu : `niveau_1` (toujours : le minimum d'un site vivant, deux bornes peintes et un petit fanal de 2 m), `niveau_2` et `niveau_3` (ils s'ajoutent), `chantier`, `ruines`. 20 à 80 triangles par objet, 150 par groupe au plus ; aucun ne ressemble à une pièce du jeu (ni soldat, ni véhicule, ni avion, ni canon, ni bateau).
  - `niveau_2` : une station météo (abri blanc à persiennes sur pieds) et un second abri vitré de 5 × 4 m en (−26 ; 2,2 ; +26).
  - `niveau_3` : un bâtiment annexe bas à toit de tôle de 12 × 8 m derrière l'atelier, une antenne en treillis de 10 m et un bassin rond de 4 m de diamètre.
  - `chantier` : échafaudage sur la façade du pavillon et le pan de l'atelier, une grue-mât rouge de 16 m, tas de sable, madriers. Le jeu coupe le bâtiment par un plan qui monte ; l'échafaudage ne dépasse pas le bâtiment et n'a besoin d'aucune pièce nommée.
  - `ruines` : gravats de brique claire, murs arasés à 3 m, verre brisé en éclats peints, poutres noircies, trace de feu ; l'observatoire reste debout.
- Budget : le bâtiment 2 500 triangles au plus ; socle, liseré, cour et signe 700 au total ; chaque groupe d'accessoires 150 ; **total sous 3 500 dans n'importe quel état**. Atlas WebP (512² visé, 1 024 au plus) : cinq cases de plus (papier du socle, gravier, béton d'aire, labours, toile de tente).
- Contrôle : vu de haut à 45°, socle de 64 px de large, le site se reconnaît à son signe ; à 25 px, socle, liseré et signe seuls le disent encore. Le socle fait partie du modèle : ce n'est pas un « sol » à retirer à l'export.

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `coupole` | centre de la base de la coupole, sur l'axe du tambour (−8 ; 12,3 ; +4) | tourne autour de y, lentement, tant que la recherche avance | Ø 8 m |
| `volet_coupole` | centre de la coupole | enfant de `coupole` ; ouvre la fente en tournant autour de l'axe x de la coupole, jusqu'à 90° | 1,4 m de large |
| `lunette` | axe de hauteur de la monture | enfant de `coupole` ; se lève autour de x de 10° à 60°, dans la fente | 4 m |
| `porte_gauche` | gond, montant +x de la porte (x = −6,8 ; y = 0,8 ; z = +12) | axe vertical ; s'étend vers −x ; vers l'extérieur de +110° | 1,2 × 3,4 m |
| `porte_droite` | gond, montant −x (x = −9,2 ; y = 0,8 ; z = +12) | axe vertical ; s'étend vers +x ; vers l'extérieur de −110° | 1,2 × 3,4 m |
| `fond_sombre` | centre du plan | fixe ; noir mat, 0,3 m derrière les battants | 2,4 × 3,4 m |
| `hampe` | pied du mât (+20, 0, +18) | fixe | 10 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât | pend vers −y, s'étend vers −x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_sortie` | seuil de la porte (−8 ; 0,8 ; +12,2) | +z |
| `fx_smoke` | sommet de la cheminée de laboratoire | +y |
| `fx_tete_hampe` | sommet de la hampe | +y |

## Matériaux et texture

- Matériaux nommés par matière (`brique_claire`, `pierre`, `cuivre_coupole`, `acier`…), une seule
  texture atlas de 1 024 px au plus, peinte sur canvas.
- `vitres` : fenêtres, sheds de l'atelier. `fond_sombre` : noir mat, aussi à l'intérieur de la
  fente de la coupole.
- Figurine peinte, contours nets, couleurs d'époque désaturées (brique blonde, coupole gris-vert
  de cuivre patiné). Aucun drapeau peint, aucun insigne.
- **Budget : 3 500 triangles par site**, dans n'importe quel état : 2 500 au plus pour le bâtiment, 700 pour le socle, le liseré, la cour et le signe, 150 par groupe d'accessoires (section « Le socle, la cour, le signe »).

## Ce que le modèle doit permettre

- Pendant une recherche, la coupole tourne lentement, le volet s'ouvre et la lunette se lève.
- La nuit, les fenêtres s'allument et la fente de la coupole luit.
- Les battants s'ouvrent de 110° ; un homme sort par `fx_sortie`.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 50 m en x ; étages de 4 et 3,5 m ; coupole de 8 m ; le dessus du socle à y = 2,2 et le bâtiment posé dessus, rien sous y = 0.
- La coupole tourne sur l'axe de son tambour sans se décaler ; tous les noms ci-dessus présents à
  l'identique ; `vitres` sur les vitres ; budget de 3 500 triangles par état (bâtiment ≤ 2 500).
- Le socle (dessus à y = 2,2 m, rayon de coin 6 m, biseau 0,8 m), `lisere` (matériau `lisere`), `cour`, `signe`, `fx_rang`, `niveau_1`, `niveau_2`, `niveau_3`, `chantier` et `ruines` présents, écrits à l'identique ; `hampe`, `drapeau` et `fx_tete_hampe` sur le signe, mêmes noms, mêmes pivots.
- Le bâtiment inchangé et rehaussé de 2,2 m ; la cour libre du rectangle de 30 × 14 m devant `fx_rang` ; aucun accessoire ne ressemble à une pièce du jeu.
- Dans la page, des cases pour montrer un seul groupe (`niveau_2`, `niveau_3`, `chantier`, `ruines`) et compter les triangles de chaque état : moins de 3 500 dans tous.
