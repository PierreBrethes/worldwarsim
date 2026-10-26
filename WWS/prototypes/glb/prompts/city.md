# Ville (Blitz) — city.glb

Un cantonnement de quatre baraques à voûte de tôle ondulée (du type Romney), pignons de brique,
posées côte à côte sur des dalles de béton. Dans la Blitz de « La Manchette » (stratégie, presse
illustrée de 1940), c'est le symbole d'une ville qui verse des fonds à qui la tient ;
l'infanterie la capture. Ce n'est pas une ville réelle : un symbole de 50 m, à hauteur d'homme.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; les pignons à porte regardent +z. Origine au
sol (y = 0), au centre de l'emprise. Rien sous y = 0. « Gauche » = +x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m : porte de 3,3 m, fenêtres de 1,6 m de haut.
Le modèle précédent avait des baraques de 16 m de portée et des portes de 5,5 m : ne pas l'imiter.

- **Emprise** : 50 m (x) × 28 m (z).
- **Quatre baraques** de 10,7 m de portée (x) × 26 m de long (z), voûte en plein cintre de 5,5 m de
  haut, tôle ondulée à nervures ; centres en x = −19,65, −6,55, +6,55, +19,65 (2,4 m entre
  elles). Chacune sur sa dalle de béton de 0,3 m qui déborde de 0,5 m.
- **Pignon avant** de chaque baraque (z = +13) : brique, une porte de 1,6 × 3,3 m au milieu, une
  fenêtre de 1,4 × 1,6 m de chaque côté, allège 0,9 m ; un auvent de tôle au-dessus de la porte.
- **Pignon arrière** : planches, une fenêtre.
- Un tuyau de poêle par baraque, sur la voûte.
- **Hampe** : 10 m au sol à x = −26, z = +16 ; drapeau de 3 × 2 m (3:2 exact).

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `hampe` | pied du mât (−26, 0, +16) | fixe | 10 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât | pend vers −y, s'étend vers +x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_smoke` | au bout du tuyau de poêle de la deuxième baraque | +y |
| `fx_tete_hampe` | sommet de la hampe | +y |

## Matériaux et texture

- Matériaux nommés par matière (`tole`, `brique`, `planches`, `beton`…), une seule texture atlas
  de 1 024 px au plus, peinte sur canvas.
- `vitres` : toutes les fenêtres.
- Figurine peinte, contours nets, couleurs d'époque désaturées (tôle gris-vert, brique sourde).
  Aucun drapeau peint, aucun insigne.
- **Moins de 3 500 triangles.**

## Ce que le modèle doit permettre

- La fumée des poêles sort par `fx_smoke`.
- La nuit, les fenêtres s'allument.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 50 m en x ; porte de 3,3 m ; rien sous y = 0.
- `hampe`, `drapeau`, `fx_smoke`, `fx_tete_hampe` présents à l'identique ; `vitres` sur les
  vitres ; moins de 3 500 triangles.
