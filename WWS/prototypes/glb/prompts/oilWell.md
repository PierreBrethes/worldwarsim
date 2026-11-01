# Puits de pétrole — oilWell.glb

Un puits de pétrole des années 1930 : un derrick de bois en treillis au-dessus de la tête de
puits, et à côté une pompe à balancier (« tête de cheval ») menée par un moteur, sur une
plate-forme de planches avec quelques fûts. Dans « La Manchette » (stratégie, presse illustrée de
1940), il exploite un gisement de pétrole ; son balancier pompe quand il produit et se fige quand
on le sabote.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la tête de cheval regarde +z. Origine au sol
(y = 0), au centre de l'emprise. Rien sous y = 0. « Gauche » = +x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m : garde-corps de 1,1 m, échelons de 0,3 m,
marche de 0,2 m. Le modèle précédent avait un derrick de 40 m : ne pas l'imiter.

- **Emprise** : 25 m (x) × 18 m (z) ; plate-forme de planches de 0,4 m de haut sur toute l'emprise.
- **Derrick** : pyramide tronquée en treillis de bois, pied de 7 × 7 m, sommet de 1,5 m à 22 m de
  haut, centrée en (−7 ; 0 ; 0) ; plancher de travail à 1 m, échelle, poulie de tête (moufle fixe).
- **Pompe à balancier**, dans l'axe z, centrée en x = +5 :
  - chevalet (le pied en A) de 5 m de haut, à z = 0 ;
  - balancier (poutre) de 7 m le long de z, posé sur le chevalet ; la tête de cheval à son bout
    +z, au-dessus de la tête de puits (x = +5, z = +3,5) ;
  - réducteur et manivelle à l'arrière (z = −3), manivelle de 1,2 m avec deux contrepoids ;
  - deux bielles de la manivelle au bout −z du balancier ;
  - tige polie qui pend de la tête de cheval dans la tête de puits ;
  - moteur à un cylindre sous auvent à z = −6.
- Fûts et madriers sur la plate-forme.
- **Hampe** : 8 m au sol à x = +11, z = +8 ; drapeau de 3 × 2 m (3:2 exact).

## Le socle, la cour, le signe

Ce site est une maquette posée sur sa base de wargame (ADR 0038). Tout le site tient sur le socle ; le bâtiment, ses portes et ses pièces nommées gardent leurs mètres et leurs pivots, simplement rehaussés de 2,2 m (le dessus du socle). **Le bâtiment lui-même ne change pas.** Les x et z des tableaux qui suivent restent vrais.

**Rehausse.** L'origine du fichier reste au même (x, z), au pied du socle (y = 0) ; le dessus du socle est à y = 2,2. Toute cote y des tableaux ci-dessous se lit **+2,2 m** : un pivot ou un repère donné à y = 0 passe à 2,2. En particulier : plate-forme de planches à 2,6 m, `balancier` (+5 ; 7,6 ; 0), `manivelle` (+5 ; 3,8 ; −3), `tige` +2,2 m, `fx_smoke` +2,2 m. Seul le socle descend jusqu'à y = 0.

- `socle`, fixe : rectangle aux coins arrondis (rayon 6 m), dessus à y = 2,2 m, biseau de 0,8 m à 45° sur tout le tour. Couleur papier, à peine plus claire que la feuille (#ebe1c8, L* 90), flanc et biseau plus sombres (#bfae8a). Ici 40 × 47 m : x de −20 à 20, z de −18 à 29. Il enveloppe la plate-forme de 25 × 18 m : 7,5 m de débord sur les côtés, 9 m derrière, 20 m devant la tête de cheval pour la cour. Rien du site ne dépasse le socle sauf le drapeau au vent.
- `lisere`, fixe, matériau `lisere` à part (le jeu le teint à l'encre de la nation) : une bande de 3 m de large sur le bord du dessus du socle, 6 cm au-dessus, blanc neutre dans le GLB.
- `cour`, fixe : les sols peints sur le socle, 4 cm d'épaisseur au plus ; les rangs, tirets, joints et sillons sont peints dans l'atlas, pas modelés. Valeurs proches du socle : 10 à 20 points de L* plus sombres au plus, jamais saturées. Ici : gravier gras, noirci d'huile, et planches de cheminement devant la plate-forme (z de +9 à +27) ; une flaque d'huile peinte près de la tête de puits.
- `signe`, fixe : le derrick de forage : pyramide tronquée de treillis de bois gris, pied de 5 × 5 m, sommet de 1 m, 30 m de haut, couronne de poulies fixe au sommet, une échelle, en (+14 ; 2,2 ; −12,5). Ce n'est pas le derrick de 22 m du bâtiment, qui reste au bâtiment. Il dépasse le bâtiment d'au moins un quart de sa hauteur (le bâtiment monte à 22 m, le signe à 28 m au moins au-dessus du socle) et le dit en silhouette noire de 40 px. Il porte seul la couleur chaude du site, une matière désaturée (brique, rayures, cuivre, minium), pas une couleur de jeu.
- `hampe` et `drapeau` passent sur le signe (mêmes noms, mêmes pivots : pied de la hampe, coin haut de la toile). La hampe (6 m, au lieu de 8) est plantée sur la couronne du derrick de forage : pied en (+14 ; 32,2 ; −12,5). `fx_tete_hampe` les suit, au sommet de la hampe.
- `fx_rang` : repère vide sur la cour, en (0 ; 2,2 ; 12), au milieu du bord du rectangle côté bâtiment ; +z vers le rang. La cour laisse libre le rectangle de 30 m (x de −15 à 15) sur 14 m (z de 12 à 26) devant lui pour la garnison (le jeu y pose ses figurines), et le chemin libre de `fx_sortie` à ce rectangle. Aucun accessoire ni signe n'y entre, et la cour n'y est pas plus sombre que le socle de plus de 20 points de L*.
- Accessoires par niveau et par état, chacun un groupe fixe, tous masqués sauf un par le jeu : `niveau_1` (toujours : le minimum d'un site vivant, deux bornes peintes et un petit fanal de 2 m), `niveau_2` et `niveau_3` (ils s'ajoutent), `chantier`, `ruines`. 20 à 80 triangles par objet, 150 par groupe au plus ; aucun ne ressemble à une pièce du jeu (ni soldat, ni véhicule, ni avion, ni canon, ni bateau).
  - `niveau_2` : quatre fûts rouille debout en tas et une cabane de planches de 4 × 3 m.
  - `niveau_3` : une rangée de huit fûts, un réservoir cylindrique de tôle de 5 m de diamètre et 3 m de haut, un tuyau posé au sol du réservoir à la plate-forme.
  - `chantier` : échafaudage de planches au pied du derrick du bâtiment, une chèvre de levage rouge de 10 m, tas de sable et de madriers. Le jeu coupe le bâtiment par un plan qui monte ; l'échafaudage ne dépasse pas le bâtiment et n'a besoin d'aucune pièce nommée.
  - `ruines` : gravats et poutres noircies de la plate-forme, treillis du derrick du bâtiment effondré à 6 m, trace de feu et flaque d'huile noire ; le derrick de forage reste debout.
- Budget : le bâtiment 2 500 triangles au plus ; socle, liseré, cour et signe 700 au total ; chaque groupe d'accessoires 150 ; **total sous 3 500 dans n'importe quel état**. Atlas WebP 512² au plus : cinq cases de plus (papier du socle, gravier, béton d'aire, labours, toile de tente).
- Contrôle : vu de haut à 45°, socle de 64 px de large, le site se reconnaît à son signe ; à 25 px, socle, liseré et signe seuls le disent encore. Le socle fait partie du modèle : ce n'est pas un « sol » à retirer à l'export.

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `balancier` | palier du balancier, au sommet du chevalet (+5 ; 5,4 ; 0) | bascule autour de x, ±18°, 8 coups par minute ; porte la tête de cheval | 7 m |
| `tete_de_cheval` | — | enfant de `balancier`, au bout +z | 1,5 × 2 m |
| `manivelle` | axe de sortie du réducteur (+5 ; 1,6 ; −3) | tourne autour de x, un tour par coup ; porte les contrepoids | rayon 1,2 m |
| `contrepoids` | — | enfants de `manivelle` | 1,2 × 1 × 0,3 m |
| `bielle` | articulation haute, au bout −z du balancier | le jeu l'oriente vers le maneton de la manivelle (rotation autour de x) | 4 m |
| `tige` | sommet de la tige, sous la tête de cheval | translation verticale de ±1,2 m, suit la tête de cheval | 3 m |
| `hampe` | pied du mât (+11, 0, +8) | fixe | 8 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât | pend vers −y, s'étend vers −x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

`bielle` et `tige` ne sont pas enfants de `balancier` : le jeu les accorde au balancier et à la
manivelle à chaque image. Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_smoke` | au bout du tuyau d'échappement du moteur | +y |
| `fx_tete_hampe` | sommet de la hampe | +y |

## Matériaux et texture

- Matériaux nommés par matière (`bois_gris`, `acier`, `acier_vert`, `plancher`, `fut`…), une seule
  texture atlas de 512 px au plus, peinte sur canvas.
- Figurine peinte, contours nets, couleurs d'époque désaturées (bois gris, acier vert sombre,
  fûts rouille). Aucun drapeau peint, aucun insigne.
- **Budget : 3 500 triangles par site**, dans n'importe quel état : 2 500 au plus pour le bâtiment, 700 pour le socle, le liseré, la cour et le signe, 150 par groupe d'accessoires (section « Le socle, la cour, le signe »).

## Ce que le modèle doit permettre

- Le balancier bascule, la manivelle tourne avec ses contrepoids, les bielles suivent, la tige
  monte et descend : le puits pompe tant qu'il produit ; le moteur crache par `fx_smoke`.
- Saboté, une fumée noire monte et le balancier se fige.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de profil, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Un curseur dans la page joue un coup de pompe : le balancier, la manivelle, les bielles et la
  tige restent accordés sans se décrocher.
- 1 unité = 1 m ; 25 m en x ; derrick de 22 m ; le dessus du socle à y = 2,2 et le bâtiment posé dessus, rien sous y = 0.
- Tous les noms ci-dessus présents à l'identique (`walking_beam`, `crank` disparaissent) ;
  budget de 3 500 triangles par état (bâtiment ≤ 2 500).
- Le socle (dessus à y = 2,2 m, rayon de coin 6 m, biseau 0,8 m), `lisere` (matériau `lisere`), `cour`, `signe`, `fx_rang`, `niveau_1`, `niveau_2`, `niveau_3`, `chantier` et `ruines` présents, écrits à l'identique ; `hampe`, `drapeau` et `fx_tete_hampe` sur le signe, mêmes noms, mêmes pivots.
- Le bâtiment inchangé et rehaussé de 2,2 m ; la cour libre du rectangle de 30 × 14 m devant `fx_rang` ; aucun accessoire ne ressemble à une pièce du jeu.
- Dans la page, des cases pour montrer un seul groupe (`niveau_2`, `niveau_3`, `chantier`, `ruines`) et compter les triangles de chaque état : moins de 3 500 dans tous.
