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
  seule texture atlas de 1 024 px au plus, peinte sur canvas.
- `vitres` : les fenêtres.
- Figurine peinte, contours nets, couleurs d'époque désaturées (acier gris-vert, brique, minerai
  rouille). Aucun drapeau peint, aucun insigne.
- **Moins de 3 500 triangles.**

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
- 1 unité = 1 m ; 50 m en x ; chevalement de 24 m ; rien sous y = 0.
- Chaque molette tourne sur son moyeu sans osciller ; tous les noms ci-dessus présents à
  l'identique (`sheave_*` disparaît) ; `vitres` sur les vitres ; moins de 3 500 triangles.
