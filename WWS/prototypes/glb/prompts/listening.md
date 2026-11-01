# Station d'écoute — listening.glb

Une station d'écoute radio des années 1930 : un bâtiment de béton à un étage et toit-terrasse,
deux mâts d'antenne haubanés reliés par des fils, et sur le toit un cadre goniométrique tournant.
Dans « La Manchette » (stratégie, presse illustrée de 1940), elle relève les mouvements adverses
qui passent à sa portée ; son cadre tourne pendant qu'elle écoute.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la façade (la porte) regarde +z. Origine au
sol (y = 0), au centre de l'emprise. Rien sous y = 0. « Gauche » = +x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m. Rez-de-chaussée de 4 m, étage de 3,5 m,
fenêtres de 1,4 à 1,8 m, porte de 3,3 m. Le modèle précédent avait une porte de 7,8 m et des
étages de 10 m : ne pas l'imiter.

- **Emprise** : 30 m (x) × 22 m (z).
- **Bâtiment** : 20 m (x de −10 à +10) × 12 m (z de −4 à +8), béton à chaînages de brique,
  soubassement 0,6 m, rez-de-chaussée 4 m, étage 3,5 m (sur la moitié arrière seulement, la
  moitié avant reste à un niveau en terrasse avec garde-corps), acrotère. Fenêtres 1,4 × 1,8 m à
  barreaux, allège 0,9 m ; porte blindée de 1,6 × 3,3 m au milieu de la façade.
- **Appentis** : 6 × 5 m accolé au pignon −x, un groupe électrogène dedans.
- **Mâts d'antenne** : deux mâts en treillis de 20 m, aux extrémités x = ±13, haubanés ; fil
  d'antenne tendu entre leurs sommets, descente vers le toit ; isolateurs.
- **Cadre goniométrique** : sur la terrasse avant, un cadre carré de 2,5 m sur un pivot de 1,5 m.
- **Hampe** : 8 m au sol à x = +8, z = +11 ; drapeau de 3 × 2 m (3:2 exact).

## Le socle, la cour, le signe

Ce site est une maquette posée sur sa base de wargame (ADR 0038). Tout le site tient sur le socle ; le bâtiment, ses portes et ses pièces nommées gardent leurs mètres et leurs pivots, simplement rehaussés de 2,2 m (le dessus du socle). **Le bâtiment lui-même ne change pas.** Les x et z des tableaux qui suivent restent vrais.

**Rehausse.** L'origine du fichier reste au même (x, z), au pied du socle (y = 0) ; le dessus du socle est à y = 2,2. Toute cote y des tableaux ci-dessous se lit **+2,2 m** : un pivot ou un repère donné à y = 0 passe à 2,2. En particulier : `cadre_gonio` (0 ; 8,1 ; +6), `porte` pivote à y = 2,8, `fx_sortie` (0 ; 2,8 ; +8,2), `fx_smoke` +2,2 m, les feux rouges des mâts +2,2 m. Seul le socle descend jusqu'à y = 0.

- `socle`, fixe : rectangle aux coins arrondis (rayon 6 m), dessus à y = 2,2 m, biseau de 0,8 m à 45° sur tout le tour. Couleur papier, à peine plus claire que la feuille (#ebe1c8, L* 90), flanc et biseau plus sombres (#bfae8a). Ici 48 × 51 m : x de −24 à 24, z de −18 à 33. Il enveloppe le bâtiment, l'appentis et les deux mâts d'antenne : 8 m de débord sur les côtés, 7 m derrière, 25 m devant la porte pour la cour. Rien du site ne dépasse le socle sauf le drapeau au vent.
- `lisere`, fixe, matériau `lisere` à part (le jeu le teint à l'encre de la nation) : une bande de 3 m de large sur le bord du dessus du socle, 6 cm au-dessus, blanc neutre dans le GLB.
- `cour`, fixe : les sols peints sur le socle, 4 cm d'épaisseur au plus ; les rangs, tirets, joints et sillons sont peints dans l'atlas, pas modelés. Valeurs proches du socle : 10 à 20 points de L* plus sombres au plus, jamais saturées. Ici : béton lissé de la cour de garde devant la porte (z de +8 à +30), gravier ailleurs ; une grande rose des vents peinte au sol, hors du rang.
- `signe`, fixe : le pylône haubané : pylône de treillis d'acier peint de bandes rouges et blanches, 30 m, pied de 3 × 3 m, en (0 ; 2,2 ; −12), derrière le bâtiment ; haubans de câble ancrés dans le socle à 5 m au plus de son pied. Ce ne sont pas les deux mâts d'antenne du bâtiment. Il dépasse le bâtiment d'au moins un quart de sa hauteur (le bâtiment monte à 20 m, le signe à 25 m au moins au-dessus du socle) et le dit en silhouette noire de 40 px. Il porte seul la couleur chaude du site, une matière désaturée (brique, rayures, cuivre, minium), pas une couleur de jeu.
- `hampe` et `drapeau` passent sur le signe (mêmes noms, mêmes pivots : pied de la hampe, coin haut de la toile). La hampe (5 m, au lieu de 8) est plantée au sommet du pylône : pied en (0 ; 32,2 ; −12). `fx_tete_hampe` les suit, au sommet de la hampe.
- `fx_rang` : repère vide sur la cour, en (0 ; 2,2 ; 14), au milieu du bord du rectangle côté bâtiment ; +z vers le rang. La cour laisse libre le rectangle de 30 m (x de −15 à 15) sur 14 m (z de 14 à 28) devant lui pour la garnison (le jeu y pose ses figurines), et le chemin libre de `fx_sortie` à ce rectangle. Aucun accessoire ni signe n'y entre, et la cour n'y est pas plus sombre que le socle de plus de 20 points de L*.
- Accessoires par niveau et par état, chacun un groupe fixe, tous masqués sauf un par le jeu : `niveau_1` (toujours : le minimum d'un site vivant, deux bornes peintes et un petit fanal de 2 m), `niveau_2` et `niveau_3` (ils s'ajoutent), `chantier`, `ruines`. 20 à 80 triangles par objet, 150 par groupe au plus ; aucun ne ressemble à une pièce du jeu (ni soldat, ni véhicule, ni avion, ni canon, ni bateau).
  - `niveau_2` : une guérite de planches et un abri de tôle de 5 × 3 m à côté de l'appentis.
  - `niveau_3` : une seconde antenne en cadre sur pied de 4 m, une baraque d'écoute de 6 × 4 m et deux fûts de gazole.
  - `chantier` : échafaudage sur la façade du bâtiment, une grue-mât rouge de 14 m, tas de sable, madriers. Le jeu coupe le bâtiment par un plan qui monte ; l'échafaudage ne dépasse pas le bâtiment et n'a besoin d'aucune pièce nommée.
  - `ruines` : gravats de béton, murs arasés à 3 m, mâts d'antenne du bâtiment couchés, poutres noircies, trace de feu ; le pylône haubané reste debout.
- Budget : le bâtiment 2 500 triangles au plus ; socle, liseré, cour et signe 700 au total ; chaque groupe d'accessoires 150 ; **total sous 3 500 dans n'importe quel état**. Atlas WebP (512² visé, 1 024 au plus) : cinq cases de plus (papier du socle, gravier, béton d'aire, labours, toile de tente).
- Contrôle : vu de haut à 45°, socle de 64 px de large, le site se reconnaît à son signe ; à 25 px, socle, liseré et signe seuls le disent encore. Le socle fait partie du modèle : ce n'est pas un « sol » à retirer à l'export.

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `cadre_gonio` | sommet du pivot, sur l'axe vertical du cadre (0 ; 5,9 ; +6) | tourne autour de y, par à-coups, tant que la station écoute | 2,5 × 2,5 m |
| `porte` | gond, au bas du montant +x de la porte (x = +0,8 ; y = 0,6 ; z = +8) | axe vertical ; s'étend vers −x ; vers l'extérieur de +110° | 1,6 × 3,3 m |
| `fond_sombre` | centre du plan | fixe ; noir mat, 0,3 m derrière la porte | 1,6 × 3,3 m |
| `hampe` | pied du mât (+8, 0, +11) | fixe | 8 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât | pend vers −y, s'étend vers −x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_sortie` | seuil de la porte (0 ; 0,6 ; +8,2) | +z |
| `fx_smoke` | bout de l'échappement du groupe électrogène | +y |
| `fx_tete_hampe` | sommet de la hampe | +y |

## Matériaux et texture

- Matériaux nommés par matière (`beton`, `brique`, `acier_vert`, `fer`…), une seule texture atlas
  de 1 024 px au plus, peinte sur canvas.
- `vitres` : les fenêtres. `feux` : une lampe rouge au sommet de chaque mât. `fond_sombre` :
  noir mat.
- Figurine peinte, contours nets, couleurs d'époque désaturées. Aucun drapeau peint, aucun insigne.
- **Budget : 3 500 triangles par site**, dans n'importe quel état : 2 500 au plus pour le bâtiment, 700 pour le socle, le liseré, la cour et le signe, 150 par groupe d'accessoires (section « Le socle, la cour, le signe »).

## Ce que le modèle doit permettre

- Le cadre goniométrique tourne par à-coups tant que la station écoute ; sabotée, il s'arrête.
- La nuit, les fenêtres et les feux des mâts s'allument.
- La porte s'ouvre de 110° ; un homme sort par `fx_sortie`.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 30 m en x ; étages de 4 et 3,5 m ; mâts de 20 m ; le dessus du socle à y = 2,2 et le bâtiment posé dessus, rien sous y = 0.
- Tous les noms ci-dessus présents à l'identique ; `vitres` et `feux` présents ; budget de 3 500 triangles par état (bâtiment ≤ 2 500).
- Le socle (dessus à y = 2,2 m, rayon de coin 6 m, biseau 0,8 m), `lisere` (matériau `lisere`), `cour`, `signe`, `fx_rang`, `niveau_1`, `niveau_2`, `niveau_3`, `chantier` et `ruines` présents, écrits à l'identique ; `hampe`, `drapeau` et `fx_tete_hampe` sur le signe, mêmes noms, mêmes pivots.
- Le bâtiment inchangé et rehaussé de 2,2 m ; la cour libre du rectangle de 30 × 14 m devant `fx_rang` ; aucun accessoire ne ressemble à une pièce du jeu.
- Dans la page, des cases pour montrer un seul groupe (`niveau_2`, `niveau_3`, `chantier`, `ruines`) et compter les triangles de chaque état : moins de 3 500 dans tous.
