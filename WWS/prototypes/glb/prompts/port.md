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
  une seule texture atlas de 1 024 px au plus, peinte sur canvas.
- `vitres` : les bandes vitrées du hall et le lanterneau.
- `interieur` : le dedans du hall, sombre, visible par le bout ouvert.
- Figurine peinte, contours nets, couleurs d'époque désaturées (tôle grise, brique, acier minium
  sur la coque, bois clair des bers). Aucun drapeau peint, aucun insigne.
- Lisible de haut à 30° sous la verticale : la coque sur sa cale et la grue se lisent d'abord.
- **Moins de 3 500 triangles** : les membrures se dessinent par la texture plus que par la
  géométrie.

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
- 1 unité = 1 m ; 210 m de long en z ; la coque fait 130 m, étrave côté terre ; rien sous y = 0
  sauf `avant_cale`.
- `fx_bord_eau` exactement en tête de cale, orienté +z.
- Tous les noms ci-dessus présents à l'identique (les anciens `coque`, `door_left`,
  `door_right`, `vantail`, `moufle`, `cable_crochet` disparaissent).
- Moins de 3 500 triangles.
