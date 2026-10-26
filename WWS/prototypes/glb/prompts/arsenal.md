# Arsenal — arsenal.glb

Une manufacture de munitions des années 1930 : une longue halle de brique à sheds, un pavillon de
bureaux à un étage en tête, une haute cheminée d'usine et un quai d'expédition. Dans « La
Manchette » (stratégie, presse illustrée de 1940), il transforme charbon et acier en munitions ;
il fume quand il produit et s'arrête quand on le sabote.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la façade du pavillon et le quai regardent +z.
Origine au sol (y = 0), au centre de l'emprise. Rien sous y = 0. « Gauche » = +x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m. Rez-de-chaussée de 4 m, étage de 3,5 m,
fenêtres de 1,6 à 2 m, portes d'homme de 3,3 m. Le modèle précédent avait une porte de 13 m et
des fenêtres de 9 m : ne pas l'imiter.

- **Emprise** : 80 m (x) × 36 m (z).
- **Halle de fabrication** : 64 m (x de −40 à +24) × 30 m (z), brique sur soubassement de béton,
  égout à 9 m ; toit en sheds (dents de scie) vitrés côté nord (−z), cinq dents, faîte à 13 m.
  Fenêtres industrielles en bandes de carreaux de 1,6 × 2 m, appui à 2,5 m.
- **Pavillon de bureaux** : 16 m (x de +24 à +40) × 14 m, rez-de-chaussée 4 m et un étage 3,5 m,
  toit-terrasse à acrotère à 8 m ; fenêtres 1,4 × 1,8 m ; porte d'homme de 1,6 × 3,3 m.
- **Quai d'expédition** : le long de la façade de la halle, 1,2 m de haut, 3 m de profondeur ;
  porte de quai de 4 × 4 m (seuil à 1,2 m) au milieu de la halle, à x = −8.
- **Cheminée d'usine** : brique, Ø 2,5 m à la base, 30 m de haut, à l'arrière de la halle
  (x = −30, z = −12).
- **Hampe** : 12 m au sol, à x = +36, z = +22 ; drapeau de 3 × 2 m (3:2 exact).
- Caisses de munitions et une palette sur le quai.

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `murs` | centre de la halle au sol | fixe | 64 × 9 × 30 m |
| `porte` | haut du vantail, à son bout +x, sur l'axe du rail (x = −6 ; y = 5,3 ; z = +15,2) | coulissant : translation +x, **course 4,2 m** | 4,1 × 4,1 × 0,15 m |
| `rail_porte` | centre du rail | fixe | 9 m |
| `fond_sombre` | centre du plan | fixe ; noir mat derrière la porte de quai | 4 × 4 m |
| `hampe` | pied du mât (+36, 0, +22) | fixe | 12 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât | pend vers −y, s'étend vers −x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_quai` | au sol, au pied du quai face à la porte (−8 ; 0 ; +18,5) | +z |
| `fx_sortie` | seuil de la porte de quai (−8 ; 1,2 ; +15,4) | +z |
| `fx_smoke` | au sommet de la cheminée d'usine (−30 ; 30 ; −12) : départ de la fumée de production | +y |
| `fx_tete_hampe` | sommet de la hampe | +y |

## Matériaux et texture

- Matériaux nommés par matière (`brique`, `beton`, `tole`, `fer`, `caisse_olive`…), une seule
  texture atlas de 1 024 px au plus, peinte sur canvas.
- `vitres` : vitrages des sheds, fenêtres, bureaux. `fond_sombre` : noir mat.
- Figurine peinte, contours nets, couleurs d'époque désaturées. Aucun drapeau peint, aucun insigne.
- **Moins de 3 500 triangles.**

## Ce que le modèle doit permettre

- La fumée de production monte de `fx_smoke` tant que l'arsenal travaille ; sabotée, une fumée
  noire sort de la halle et la cheminée s'éteint.
- La porte de quai glisse de 4,2 m ; un camion recule à `fx_quai` et charge.
- La nuit, les sheds vitrés et les bureaux s'allument.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 80 m en x ; étages de 4 et 3,5 m ; rien sous y = 0.
- Tous les noms ci-dessus présents à l'identique ; un seul `fx_smoke` ; `vitres` sur les vitres ;
  moins de 3 500 triangles.
