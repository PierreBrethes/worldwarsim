# Mine de charbon — coalMine.glb

Un carreau de houillère des années 1930 : un chevalement d'acier à deux molettes sur la recette,
une chaufferie à haute cheminée, un terril noir, un tas de charbon et un wagonnet sur rail. Dans
« La Manchette » (stratégie, presse illustrée de 1940), c'est la mine posée sur un gisement de
charbon ; ses molettes tournent et sa cheminée fume quand elle produit. (Modèle frère de
`mine.glb`, la mine de fer : même plan, mêmes noms.)

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la façade de la recette regarde +z. Origine
au sol (y = 0), au centre de l'emprise. Rien sous y = 0. « Gauche » = +x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m. Rez-de-chaussée de 4 m, étage de 3,5 m,
fenêtres de 1,6 à 2 m, portes d'homme de 3,3 m. Ne pas reprendre le chevalement de 40 m et les
portes de 6 m du modèle précédent.

- **Emprise** : 50 m (x) × 40 m (z).
- **Recette** : 20 m (x de −10 à +10) × 16 m (z de −2 à +14), brique à chaînages de béton,
  rez-de-chaussée 4 m et un étage 3,5 m, égout à 8 m, toit à deux pans. Fenêtres 1,6 × 2 m ;
  porte d'homme 1,6 × 3,3 m ; porte de berline de 3 × 3,5 m sur le pignon +x.
- **Chevalement** : treillis d'acier à quatre montants (centre en x = 0, z = −2), 24 m de haut,
  jambe de force vers −z, plate-forme à 22 m. Deux molettes de Ø 4 m (x = −1,2 et +1,2), axe le
  long de x, à 24 m ; câbles vers la recette et vers le treuil.
- **Chaufferie** : 12 × 10 m à x de −24 à −12, un niveau de 5 m ; cheminée de brique de Ø 1,8 m
  et 25 m de haut à son angle arrière (x = −20, z = −12).
- **Terril** : cône noir de schiste, Ø 22 m, 11 m de haut, centré en (+15 ; 0 ; −10).
- **Tas de charbon** : 8 × 8 m, 2,5 m de haut, au bout du rail (x = +20, z = +10).
- **Rail** : voie de 0,6 m, du pignon +x de la recette (x = +10, z = +6) au tas de charbon.
- **Hampe** : 10 m au sol à x = −22, z = +16 ; drapeau de 3 × 2 m (3:2 exact).

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `molette_1` | moyeu de la molette −x (−1,2 ; 24 ; −2) | tourne autour de x | Ø 4 m |
| `molette_2` | moyeu de la molette +x (+1,2 ; 24 ; −2) | tourne autour de x, sens opposé | Ø 4 m |
| `wagonnet` | centre du dessous, sur le rail (+11 ; 0 ; +6) | translation le long de +x, **course 8 m** | 1,6 × 1,3 × 1 m |
| `wagonnet_caisse` | axe de bascule, au bord +z de la caisse | enfant de `wagonnet` ; bascule autour de x jusqu'à 110° | 1,4 × 0,8 × 0,9 m |
| `rail` | centre de la voie | fixe | 10 m |
| `hampe` | pied du mât (−22, 0, +16) | fixe | 10 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât | pend vers −y, s'étend vers +x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_smoke` | au sommet de la cheminée de la chaufferie (−20 ; 25 ; −12) | +y |
| `fx_sortie` | seuil de la porte de berline (+10,2 ; 0 ; +6) | +x |
| `fx_tete_hampe` | sommet de la hampe | +y |

## Matériaux et texture

- Matériaux nommés par matière (`brique`, `beton`, `acier`, `houille`, `schiste`, `bois`…), une
  seule texture atlas de 1 024 px au plus, peinte sur canvas.
- `vitres` : les fenêtres.
- Figurine peinte, contours nets, couleurs d'époque désaturées. Aucun drapeau peint, aucun insigne.
- **Moins de 3 500 triangles.**

## Ce que le modèle doit permettre

- Les molettes tournent en sens opposés et la cheminée fume tant que la mine produit ; sabotée,
  une fumée noire monte et tout s'arrête.
- Le wagonnet roule de la recette au tas de charbon, bascule sa caisse, revient.
- La nuit, les fenêtres s'allument.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 50 m en x ; chevalement de 24 m ; rien sous y = 0.
- Tous les noms ci-dessus présents à l'identique ; un seul `fx_smoke` ; `vitres` sur les vitres ;
  moins de 3 500 triangles.
