# Chantier naval — port.glb

Un chantier naval de 1940 au bord de l'eau : une cale de construction en pente vers la mer, à
moitié couverte par un hall à charpente métallique, une coque de cargo en construction sur ses
bers, et une grue portique à flèche relevable au pied du môle. Dans « La Manchette » (stratégie,
presse illustrée de 1940), c'est le port d'un joueur : la coque neuve y glisse à l'eau par
l'arrière, et les navires accostent au môle voisin (le môle est un autre modèle, posé par le jeu).

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la mer est vers +z (la cale descend vers
+z). Origine au sol (y = 0) **sur l'axe de la cale** (x = 0), à mi-longueur du chantier. Le côté
du môle est +x. Le sol du chantier et la surface de la mer sont à y = 0. Seul l'avant-cale descend
sous y = 0.

**Coordonnées de travail.** Le storyboard mesure `s` vers le large depuis la tête de cale, et `m`
vers le môle depuis l'axe de la cale : ici **z = s + 105** et **x = m**. La tête de cale (bord de
l'eau) est en z = +105.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m : portes d'homme de 3,3 m, carreaux de vitrage
de 1,6 × 2 m. Le modèle précédent avait un hall de 57 m de haut et une grue de 130 m : ne pas
l'imiter.

- **Emprise** : 210 m en z (de −105 à +105, plus l'avant-cale jusqu'à +117) ; en x de −35 à +80.
- **Chemin de glissement (la cale)** : deux coulisses de bois sur une rampe maçonnée, de z = −85 à
  z = +105, en pente de 2,5 % vers la mer (y = +4,75 au fond, y = 0 en tête de cale), 20 m de
  large. Les 80 derniers mètres (z de +25 à +105) sont à ciel ouvert.
- **Avant-cale** (`avant_cale`) : la même rampe prolongée de 12 m sous l'eau, de z = +105 à +117,
  de y = 0 à y = −1,5.
- **Hall de construction** : 110 m (z de −85 à +25) × 44 m (x de −22 à +22), charpente métallique,
  bardage de tôle et de brique en soubassement, égout à 28 m, toit à deux pans et lanterneau
  jusqu'à 34 m. **Ouvert côté mer** (z = +25) : la coque le traverse. Fenêtres en bandes de
  carreaux de 1,6 × 2 m ; une porte d'homme de 1,6 × 3,3 m sur le long pan −x.
- **Coque en construction** (`coque_cale`) : un cargo de 130 m, **retourné** : l'étrave (la proue)
  au fond, côté terre, à z = −45 ; l'étambot (la poupe) côté mer, à z = +85. Largeur 17 m, creux
  11 m. Quille posée 1,5 m au-dessus des coulisses. La poupe est bordée de tôle sur un tiers,
  le reste montre son squelette (membrures, lisses).
- **Bers** : trois berceaux sous la quille, à z = −20, +20 et +60 (s = −125, −85, −45).
- **Accores** : six étais, trois de chaque bord, du sol au flanc de la coque, au droit des bers.
- **Grue** : grue portique sur rails, au pied du môle, centrée en (x = +70, z = +90) : portique de
  10 × 10 m et 10 m de passage, fût jusqu'à 22 m, cabine, flèche relevable de 45 m (portée de 12 à
  42 m), contrepoids. Au repos, la flèche pointe vers la cale (−x), relevée à 30°.
- **Pile de bois** : madriers et rondins sur le terre-plein, à x ≈ −30, z de +75 à +95 (jamais
  dans l'eau).
- **Hampe** : mât de 12 m au sol à x = −30, z = +100 ; drapeau de 3 × 2 m (3:2 exact).

## Le socle, la cour, le signe

Ce site est une maquette posée sur sa base de wargame (ADR 0038). Tout le site tient sur le socle ; le bâtiment, ses portes et ses pièces nommées gardent leurs mètres et leurs pivots, simplement rehaussés de 2,2 m (le dessus du socle). **Le bâtiment lui-même ne change pas.** Les x et z des tableaux qui suivent restent vrais.

**Rehausse.** L'origine du fichier reste au même (x, z), au pied du socle (y = 0) ; le dessus du socle est à y = 2,2. Toute cote y des tableaux ci-dessous se lit **+2,2 m** : un pivot ou un repère donné à y = 0 passe à 2,2. En particulier : toute la cale, le hall, les bers et accores (pieds à y = 2,2 + la pente), la grue portique (pied du portique à 2,2, `grue_couronne` à y = 24,2), la pile de bois ; `coque_cale` à (0 ; 4,2 ; +85) ; `fx_bord_eau` en (0 ; 2,2 ; +105) ; le chemin de glissement va de y = 6,95 au fond à y = 2,2 en tête. Seul le socle descend jusqu'à y = 0, et `avant_cale` jusqu'à y = −1,5.

- `socle`, fixe : rectangle aux coins arrondis (rayon 6 m), dessus à y = 2,2 m, biseau de 0,8 m à 45° sur tout le tour. Couleur papier, à peine plus claire que la feuille (#ebe1c8, L* 90), flanc et biseau plus sombres (#bfae8a). Ici 133 × 219 m : x de −44 à 89, z de −114 à 105. Le socle tient la part de terre du chantier : hall, cale, bers, pile de bois et pied de la grue portique. Son bord +z, en tête de cale (z = +105), est le quai : le socle s'arrête là, sans biseau ni liseré sur ce bord-là, et l'eau commence. 8 à 9 m de débord sur les trois autres côtés, 25 m de quai devant le hall (z de +80 à +105) pour la cour. Rien du site ne dépasse le socle, hormis `avant_cale` qui plonge dans l'eau, sauf le drapeau au vent.
- `lisere`, fixe, matériau `lisere` à part (le jeu le teint à l'encre de la nation) : une bande de 3 m de large sur le bord du dessus du socle, 6 cm au-dessus, blanc neutre dans le GLB, sur les trois côtés de terre ; le bord du quai (z = +105) n'en porte pas.
- `cour`, fixe : les sols peints sur le socle, 4 cm d'épaisseur au plus ; les rangs, tirets, joints et sillons sont peints dans l'atlas, pas modelés. Valeurs proches du socle : 10 à 20 points de L* plus sombres au plus, jamais saturées. Ici : dalles de béton du quai devant le hall (z de +80 à +105), gravier et traverses de bois ailleurs ; rails de la grue portique peints le long de x = +70 ; la pente de la cale (coulisses de bois) reste une pièce du bâtiment.
- `signe`, fixe : la grue de chantier : grue à tour de treillis rouge minium, fixe, mât de 5 × 5 m et 44 m, flèche horizontale de 25 m portant un contrepoids, plantée en (−39 ; 2,2 ; +98) sur le quai côté terre. Elle ne bouge pas et ne se confond pas avec `grue`, le portique à flèche relevable qui reste au bâtiment. Il dépasse le bâtiment d'au moins un quart de sa hauteur (le bâtiment monte à 34 m, le signe à 43 m au moins au-dessus du socle) et le dit en silhouette noire de 40 px. Il porte seul la couleur chaude du site, une matière désaturée (brique, rayures, cuivre, minium), pas une couleur de jeu.
- `hampe` et `drapeau` passent sur le signe (mêmes noms, mêmes pivots : pied de la hampe, coin haut de la toile). La hampe (6 m, au lieu de 12) est plantée au sommet du mât de la grue : pied en (−39 ; 46,2 ; +98). `fx_tete_hampe` les suit, au sommet de la hampe.
- `fx_rang` : repère vide sur la cour, en (35 ; 2,2 ; 85), au milieu du bord du rectangle côté bâtiment ; +z vers le rang. La cour laisse libre le rectangle de 30 m (x de 20 à 50) sur 14 m (z de 85 à 99) devant lui pour la garnison (le jeu y pose ses figurines), et le chemin libre de `fx_sortie` à ce rectangle. Aucun accessoire ni signe n'y entre, et la cour n'y est pas plus sombre que le socle de plus de 20 points de L*.
- **La mer et l'avant-cale.** Le socle est le quai : son dessus est à 2,2 m, la surface de la mer reste à y = 0 et lèche le flanc du socle. `avant_cale` ne change pas de forme ni de nom : il part de la tête de cale (z = +105, y = 2,2) et descend sous l'eau jusqu'à y = −1,5 (z = +117), donc plus raide qu'avant ; c'est la seule pièce qui dépasse le socle et passe sous y = 0.
- **Le môle** part du bord +x du socle, côté grue (kit `mole.glb`, posé par le jeu) : le socle n'en dessine rien.
- Accessoires par niveau et par état, chacun un groupe fixe, tous masqués sauf un par le jeu : `niveau_1` (toujours : le minimum d'un site vivant, deux bornes peintes et un petit fanal de 2 m), `niveau_2` et `niveau_3` (ils s'ajoutent), `chantier`, `ruines`. 20 à 80 triangles par objet, 150 par groupe au plus ; aucun ne ressemble à une pièce du jeu (ni soldat, ni véhicule, ni avion, ni canon, ni bateau).
  - `niveau_2` : une pile de madriers supplémentaire et un baraquement de tôle de 10 × 5 m sur le terre-plein, près de la pile de bois, en (−30 ; 2,2 ; +50).
  - `niveau_3` : un atelier de forge ouvert à toit de tôle de 12 × 6 m et quatre cuves à rivets ; un réservoir d'eau sur pylône de 8 m côté terre, en (−38 ; 2,2 ; −90).
  - `chantier` : échafaudage de tubes sur les flancs du hall, une chèvre de levage rouge de 12 m, tas de sable, madriers et rivets en tas. Le jeu coupe le bâtiment par un plan qui monte ; l'échafaudage ne dépasse pas le bâtiment et n'a besoin d'aucune pièce nommée.
  - `ruines` : gravats et poutres tordues autour du hall, charpente métallique effondrée à mi-hauteur, pans de brique arasés à 3 m, trace de feu sur le quai ; le chemin de glissement reste sain.
- Budget : le bâtiment 2 500 triangles au plus ; socle, liseré, cour et signe 700 au total ; chaque groupe d'accessoires 150 ; **total sous 3 500 dans n'importe quel état**. Atlas WebP 512² au plus : cinq cases de plus (papier du socle, gravier, béton d'aire, labours, toile de tente).
- Contrôle : vu de haut à 45°, socle de 64 px de large, le site se reconnaît à son signe ; à 25 px, socle, liseré et signe seuls le disent encore. Le socle fait partie du modèle : ce n'est pas un « sol » à retirer à l'export.

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `coque_cale` | sur la quille, sous l'étambot : (0 ; 2,0 ; +85) | un seul nœud : quille, membrures, lisses, bordé, étrave, étambot. Le jeu le fait glisser le long de la pente (+z), puis pivoter autour de x en tête de cale ; il le découpe par un plan qui monte quand la coque « s'habille » | 130 × 17 × 13 m |
| `ber_1`, `ber_2`, `ber_3` | centre du dessous de chaque ber, sur les coulisses (z = −20, +20, +60) | glissent avec la coque jusqu'au bout de la cale, puis coulent | 17 × 1,5 × 4 m |
| `accore_1` à `accore_6` | pied de l'étai, au sol | tombent vers l'extérieur (vers ±x) de 77°, l'un après l'autre ; axe horizontal le long de z | ≈ 9 m de long |
| `avant_cale` | tête de cale, au centre (0 ; 0 ; +105) | fixe ; descend sous l'eau | 20 × 12 m |
| `grue` | centre du portique au sol (+70 ; 0 ; +90) | fixe : portique et fût | 10 × 22 × 10 m |
| `grue_couronne` | centre de la couronne d'orientation, en haut du fût (+70 ; 22 ; +90) | axe vertical, rotation libre : porte la cabine, la flèche et le contrepoids | Ø 5 m |
| `fleche` | pied de la flèche, sur son axe d'articulation | axe horizontal perpendiculaire à la flèche : relevage de 10° à 75° | 45 m |
| `cable` | en tête de flèche, à la poulie | une seule pièce verticale qui pend vers −y (20 m dans la pose de repos) ; le jeu l'étire en y | Ø 0,1 m |
| `crochet` | en haut de la moufle, au bout du câble | suit le bout du câble ; descend de 14 m sur une coque | 1 × 2 m |
| `hampe` | pied du mât (−30 ; 0 ; +100) | fixe | 12 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât (−30 ; 11,8 ; +100) | pend vers −y, s'étend vers +x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

`cable` et `crochet` sont enfants de `grue_couronne`, pas de `fleche` : ils restent verticaux quand
la flèche se relève (le jeu les replace sous sa tête). Le drapeau est une toile neutre blanc cassé,
UV 0 → 1 sur toute la toile.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_bord_eau` | sur l'axe de la cale, là où elle entre dans l'eau (0 ; 0 ; +105) | +z, vers le large |
| `fx_smoke` | au sommet de la cheminée de la forge du hall, s'il y en a une ; sinon sur le faîtage | +y |
| `fx_tete_hampe` | sommet de la hampe (−30 ; 12 ; +100) | +y |

## Matériaux et texture

- Matériaux nommés par matière (`tole`, `brique`, `acier`, `bois_neuf`, `beton`, `interieur`…),
  une seule texture atlas de 512 px au plus, peinte sur canvas.
- `vitres` : les bandes vitrées du hall et le lanterneau.
- `interieur` : le dedans du hall, sombre, visible par le bout ouvert.
- Figurine peinte, contours nets, couleurs d'époque désaturées (tôle grise, brique, acier minium
  sur la coque, bois clair des bers). Aucun drapeau peint, aucun insigne.
- Lisible de haut à 30° sous la verticale : la coque sur sa cale et la grue se lisent d'abord.
- **Budget : 3 500 triangles par site**, dans n'importe quel état : 2 500 au plus pour le bâtiment, 700 pour le socle, le liseré, la cour et le signe, 150 par groupe d'accessoires (section « Le socle, la cour, le signe »).

## Ce que le modèle doit permettre

- La coque neuve glisse par l'arrière : bers et coque descendent la cale, les accores tombent
  vers l'extérieur l'un après l'autre, la poupe flotte la première et la coque pivote sur la tête
  de cale (`fx_bord_eau`) avant que la proue tombe à l'eau ; une nouvelle quille repousse sur la
  cale.
- Le jeu pose le terre-plein et le môle à partir de `fx_bord_eau` ; le môle part du côté de la
  grue (+x), parallèle à la cale.
- La grue tourne sur sa couronne, relève sa flèche et descend son crochet de 14 m sur un navire
  amarré au môle ; au repos elle regarde la cale.
- Le port peut être posé en miroir (x → −x) quand le côté de la grue est encombré : rien ne doit
  dépendre d'une asymétrie cachée.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de dessus et de trois quarts haute),
  bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni lumière, ni
  caméra, ni eau, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page, un curseur qui joue le lancement (coque et bers qui glissent, accores qui
  tombent) et un autre qui tourne la grue et relève sa flèche.
- 1 unité = 1 m ; 210 m de long en z ; la coque fait 130 m, étrave côté terre ; le dessus du socle à y = 2,2 et le bâtiment posé dessus, rien sous y = 0
  sauf `avant_cale`.
- `fx_bord_eau` exactement en tête de cale, orienté +z.
- Tous les noms ci-dessus présents à l'identique (les anciens `coque`, `door_left`,
  `door_right`, `vantail`, `moufle`, `cable_crochet` disparaissent).
- Budget de 3 500 triangles par état (bâtiment ≤ 2 500).
- Le socle (dessus à y = 2,2 m, rayon de coin 6 m, biseau 0,8 m), `lisere` (matériau `lisere`), `cour`, `signe`, `fx_rang`, `niveau_1`, `niveau_2`, `niveau_3`, `chantier` et `ruines` présents, écrits à l'identique ; `hampe`, `drapeau` et `fx_tete_hampe` sur le signe, mêmes noms, mêmes pivots.
- Le bâtiment inchangé et rehaussé de 2,2 m ; la cour libre du rectangle de 30 × 14 m devant `fx_rang` ; aucun accessoire ne ressemble à une pièce du jeu.
- Dans la page, des cases pour montrer un seul groupe (`niveau_2`, `niveau_3`, `chantier`, `ruines`) et compter les triangles de chaque état : moins de 3 500 dans tous.
