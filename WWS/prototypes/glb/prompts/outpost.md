# Avant-poste — outpost.glb

Un avant-poste de campagne des années 1930 : un mât et son drapeau au centre d'un cercle de sacs
de sable, le tout posé sur un socle rond de wargame. Dans « La Manchette » (stratégie, presse
illustrée de 1940), il tient la couleur d'une région, stocke et guette. Au niveau 2, il prend une
spécialisation qui se lit à un accessoire posé dans le cercle : des caisses pour le **Magasin**,
une antenne pour le **Guet**, des sacs empilés et une pièce pour le **Fort** ; l'avant-poste
**généraliste** n'en montre aucun. Le jeu affiche au plus un accessoire à la fois.

C'est une pièce plus petite qu'un bâtiment (30 m contre 50 à 80 m) : elle doit rester lisible
avec peu de détails.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; l'entrée du cercle regarde +z. Origine au
sol (y = 0), au centre du socle, au pied du mât. Rien sous y = 0. « Gauche » = +x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m : un mur de sacs de 1,3 m lui arrive à la
taille, une caisse de 1,2 m au coude. Ne pas grandir les sacs pour qu'ils se voient : c'est le
socle et le signe qui se voient de loin.

- **Emprise** : 30 m de diamètre, celle du socle. Rien ne dépasse le socle sauf le drapeau au vent.
- **Dessus du socle** : y = 2,2. Tout ce qui suit est posé dessus ; les cotes y des tableaux sont
  déjà rehaussées.
- **Cercle de sacs** : un anneau de sacs de sable de 23 m de diamètre extérieur (rayon 11,5),
  1,6 m d'épaisseur à la base, 1,3 m de haut (y de 2,2 à 3,5), trois à quatre rangs de sacs
  visibles, posés en quinconce, le rang du haut légèrement bombé. Une ouverture de 4 m face à +z
  (x de −2 à +2), ses deux bouts arrondis.
- **Le chemin** : trois caillebotis de 1 × 2 m de l'ouverture au pied du mât, 3 cm au-dessus du
  socle.
- **Mât** : au centre, 12 m de bois goudronné, haubané par trois câbles ancrés dans le socle à
  5 m de son pied, en (+5 ; 2,2 ; 0), (−5 ; 2,2 ; 0) et (+1,5 ; 2,2 ; +4,8), hors du chemin et
  hors de la zone des accessoires ; une vergue de 2 m à 10 m de haut ; une lanterne au sommet du mât.
- **Hampe** : 3 m, au sommet du mât ; drapeau de 3 × 2 m (3:2 exact).
- **Zone des accessoires** : derrière le mât, x de −5 à +5, z de −8 à −1, à l'intérieur du cercle.
  Les trois accessoires y tiennent chacun seul, au même endroit (un seul est montré).

## Le socle, le liseré, le signe

L'avant-poste est une maquette posée sur sa base de wargame, comme les bâtiments du jeu (ADR 0038),
mais **sur un socle rond** : le rond le distingue d'un bâtiment de près (les bâtiments ont un
rectangle aux coins arrondis), comme le losange de son épingle au loin (ADR 0038 §11).

- `socle`, fixe : un disque de 30 m de diamètre (rayon 15 m), dessus à y = 2,2 m, biseau de
  0,8 m à 45° sur tout le tour. Couleur papier, à peine plus claire que la feuille (#ebe1c8,
  L* 90), flanc et biseau plus sombres (#bfae8a). 48 segments au moins sur le tour, pour que le
  rond se lise. Le socle fait partie du modèle : ce n'est pas un « sol » à retirer à l'export.
- `lisere`, fixe, matériau `lisere` à part (le jeu le teint à l'encre de la nation) : un anneau
  de 3 m de large sur le bord du dessus du socle (rayon de 12 à 15 m), 6 cm au-dessus, blanc
  neutre dans le GLB. Le cercle de sacs s'arrête à 0,5 m en dedans du liseré.
- `signe`, fixe : le mât, ses haubans, sa vergue et sa lanterne. Pied en (0 ; 2,2 ; 0). Il porte
  seul la couleur chaude du site : le tiers haut du mât cerclé de bandes minium et blanc cassé,
  désaturées, pas une couleur de jeu. Il dit l'avant-poste en silhouette noire de 40 px.
- `hampe` et `drapeau` sont plantés au sommet du signe : pied de la hampe en (0 ; 14,2 ; 0).
  `fx_tete_hampe` au sommet de la hampe.
- **Pas de cour, pas de `fx_rang`.** Le cercle de 23 m ne loge pas le rectangle de 30 × 14 m
  qu'une garnison demande sur la cour d'un bâtiment, avec le mât et un accessoire en plus : le jeu
  pose la garnison de l'avant-poste **à côté du socle**, au sol, à environ 34 m du centre, pas
  dessus. Ne pas modeler de cour peinte, ni de niveaux (`niveau_1`…), ni de chantier ni de ruines.

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `socle` | centre du disque, au sol (0 ; 0 ; 0) | fixe | 30 m de diamètre, dessus à 2,2 m |
| `lisere` | centre du disque (0 ; 2,2 ; 0) | fixe ; matériau `lisere` | anneau de 3 m sur le bord |
| `sacs` | centre du cercle (0 ; 2,2 ; 0) | fixe | anneau de 23 m, 1,3 m de haut, ouvert de 4 m vers +z |
| `signe` | pied du mât (0 ; 2,2 ; 0) | fixe | mât de 12 m, haubans, vergue, lanterne |
| `hampe` | pied de la hampe (0 ; 14,2 ; 0) | fixe | 3 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât | pend vers −y, s'étend vers −x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |
| `magasin` | pied du groupe, au centre de la zone des accessoires (0 ; 2,2 ; −5) | groupe fixe, montré par le jeu pour le Magasin seul | voir plus bas |
| `guet` | même point (0 ; 2,2 ; −5) | groupe fixe, montré pour le Guet seul | voir plus bas |
| `fort` | même point (0 ; 2,2 ; −5) | groupe fixe, montré pour le Fort seul | voir plus bas |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile.

### Les trois accessoires

Chacun est un groupe à lui seul, enfant direct de la racine, rangé dans la zone des accessoires
(x de −5 à +5, z de −8 à −1). Chacun se reconnaît de haut à 64 px de socle, par sa silhouette,
pas par sa couleur. 150 triangles par groupe au plus. Aucun ne ressemble à une pièce du jeu :
ni soldat, ni véhicule, ni avion, ni bateau, ni canon de campagne.

- `magasin` : une pile de caisses de bois clair cerclées de fer, 1,2 × 0,8 × 0,8 m, en deux
  tas (six caisses en pyramide, trois caisses de côté), une bâche kaki à demi tirée sur le plus
  grand, deux fûts couchés sur un chantier de madriers. Tout sous 2,5 m de haut.
- `guet` : une antenne de campagne : un mât télescopique de 7 m sur un trépied, haubané à trois
  piquets, un cadre carré de 1,5 m à son sommet ; à son pied, une table de campagne et une
  caisse de poste radio. Elle reste plus basse que le mât du signe et ne le cache pas de face.
- `fort` : des sacs empilés et une pièce. Un nid de sacs en fer à cheval, ouvert vers le mât,
  4,5 m de large, 3 m de profondeur, 1,6 m de haut, au fond de la zone (z de −8 à −5), à 2 m en
  dedans du cercle ; dedans, une **pièce de
  position** : un tube court de 2 m sur un affût à pivot fixé à une plate-forme de madriers, la
  bouche vers −z au-dessus des sacs. **Sans roues, sans flèches d'affût, sans bouclier** : la
  pièce d'artillerie du jeu (la figurine) a les trois, celle-ci n'en a aucun et ne la quitte
  jamais. Ses sacs sont d'une toile un ton plus sombre que ceux du cercle.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_tete_hampe` | sommet de la hampe | +y |

## Matériaux et texture

- Matériaux nommés par matière (`toile_sacs`, `bois`, `fer`, `bache`…), une seule texture atlas
  de 512 px au plus, peinte sur canvas, en WebP si possible. Cases de l'atlas : papier du socle,
  toile de jute des sacs (deux tons), bois des caisses, bâche, fer.
- `lisere` : l'anneau du liseré, blanc neutre. `feux` : la lanterne au sommet du mât.
- Figurine peinte, contours nets, couleurs d'époque désaturées : sacs en jute (#a8996f et
  #8f7f58), bois (#9c7a4e), fer (#4a4a44). Aucun drapeau peint, aucun insigne.
- **Budget : 1 500 triangles dans n'importe quel état** (un seul accessoire montré) : socle,
  liseré et signe 500 au plus, cercle de sacs et chemin 850 au plus, chaque accessoire 150 au
  plus.

## Ce que le modèle doit permettre

- De près, on reconnaît un avant-poste à son socle rond, son cercle de sacs et son mât ; sa
  spécialisation à l'accessoire seul visible.
- Le liseré dit à qui il est (le jeu le teint).
- La nuit, la lanterne s'allume.
- À la capture, le drapeau descend, celui du vainqueur monte.
- Vu de haut à 45°, socle de 64 px de large, l'accessoire se distingue ; à 28 px, socle, liseré et
  signe seuls le disent encore. En dessous, le jeu passe au losange.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; socle de 30 m de diamètre, dessus à y = 2,2, biseau 0,8 m ; cercle de sacs de
  23 m et 1,3 m de haut ; mât de 12 m ; rien sous y = 0.
- Tous les noms ci-dessus présents à l'identique, chacun sur un seul nœud : `socle`, `lisere`,
  `sacs`, `signe`, `hampe`, `drapeau`, `fx_tete_hampe`, `magasin`, `guet`, `fort` ; matériaux
  `lisere` et `feux` présents. Aucun nœud `fx_rang`, `cour` ni `niveau_*`.
- Dans la page, quatre boutons pour montrer un seul accessoire ou aucun (généraliste, Magasin,
  Guet, Fort) et le compte de triangles de chaque état : moins de 1 500 dans tous, 150 au plus
  par accessoire.
