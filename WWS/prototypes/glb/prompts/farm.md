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
- **Moins de 3 500 triangles.**

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
- 1 unité = 1 m ; 40 m en x ; porte de 3,2 m ; rien sous y = 0.
- La roue tourne sur son moyeu sans osciller ; tous les noms ci-dessus présents à l'identique ;
  `vitres` sur les vitres ; moins de 3 500 triangles.
