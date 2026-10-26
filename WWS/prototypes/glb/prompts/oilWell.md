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
- **Derrick** : pyramide tronquée en treillis de bois, base de 7 × 7 m, sommet de 1,5 m à 22 m de
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
  texture atlas de 1 024 px au plus, peinte sur canvas.
- Figurine peinte, contours nets, couleurs d'époque désaturées (bois gris, acier vert sombre,
  fûts rouille). Aucun drapeau peint, aucun insigne.
- **Moins de 3 500 triangles.**

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
- 1 unité = 1 m ; 25 m en x ; derrick de 22 m ; rien sous y = 0.
- Tous les noms ci-dessus présents à l'identique (`walking_beam`, `crank` disparaissent) ;
  moins de 3 500 triangles.
