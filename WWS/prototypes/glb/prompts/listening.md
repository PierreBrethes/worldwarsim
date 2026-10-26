# Station d'écoute — listening.glb

Une station d'écoute radio des années 1930 : un bâtiment de béton à un étage et toit-terrasse,
deux mâts d'antenne haubanés reliés par des fils, et sur le toit un cadre goniométrique tournant.
Dans « La Manchette » (stratégie, presse illustrée de 1940), elle relève les mouvements adverses
qui passent à sa portée ; son cadre tourne pendant qu'elle écoute.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la façade (la porte) regarde +z. Origine au
sol (y = 0), au centre de l'emprise. Rien sous y = 0. « Gauche » = +x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m. Rez-de-chaussée de 4 m, étage de 3,5 m,
fenêtres de 1,4 à 1,8 m, porte de 3,3 m. Le modèle précédent avait une porte de 7,8 m et des
étages de 10 m : ne pas l'imiter.

- **Emprise** : 30 m (x) × 22 m (z).
- **Bâtiment** : 20 m (x de −10 à +10) × 12 m (z de −4 à +8), béton à chaînages de brique,
  soubassement 0,6 m, rez-de-chaussée 4 m, étage 3,5 m (sur la moitié arrière seulement, la
  moitié avant reste à un niveau en terrasse avec garde-corps), acrotère. Fenêtres 1,4 × 1,8 m à
  barreaux, allège 0,9 m ; porte blindée de 1,6 × 3,3 m au milieu de la façade.
- **Appentis** : 6 × 5 m accolé au pignon −x, un groupe électrogène dedans.
- **Mâts d'antenne** : deux mâts en treillis de 20 m, aux extrémités x = ±13, haubanés ; fil
  d'antenne tendu entre leurs sommets, descente vers le toit ; isolateurs.
- **Cadre goniométrique** : sur la terrasse avant, un cadre carré de 2,5 m sur un pivot de 1,5 m.
- **Hampe** : 8 m au sol à x = +8, z = +11 ; drapeau de 3 × 2 m (3:2 exact).

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `cadre_gonio` | sommet du pivot, sur l'axe vertical du cadre (0 ; 5,9 ; +6) | tourne autour de y, par à-coups, tant que la station écoute | 2,5 × 2,5 m |
| `porte` | gond, au bas du montant +x de la porte (x = +0,8 ; y = 0,6 ; z = +8) | axe vertical ; s'étend vers −x ; vers l'extérieur de +110° | 1,6 × 3,3 m |
| `fond_sombre` | centre du plan | fixe ; noir mat, 0,3 m derrière la porte | 1,6 × 3,3 m |
| `hampe` | pied du mât (+8, 0, +11) | fixe | 8 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât | pend vers −y, s'étend vers −x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_sortie` | seuil de la porte (0 ; 0,6 ; +8,2) | +z |
| `fx_smoke` | bout de l'échappement du groupe électrogène | +y |
| `fx_tete_hampe` | sommet de la hampe | +y |

## Matériaux et texture

- Matériaux nommés par matière (`beton`, `brique`, `acier_vert`, `fer`…), une seule texture atlas
  de 1 024 px au plus, peinte sur canvas.
- `vitres` : les fenêtres. `feux` : une lampe rouge au sommet de chaque mât. `fond_sombre` :
  noir mat.
- Figurine peinte, contours nets, couleurs d'époque désaturées. Aucun drapeau peint, aucun insigne.
- **Moins de 3 500 triangles.**

## Ce que le modèle doit permettre

- Le cadre goniométrique tourne par à-coups tant que la station écoute ; sabotée, il s'arrête.
- La nuit, les fenêtres et les feux des mâts s'allument.
- La porte s'ouvre de 110° ; un homme sort par `fx_sortie`.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 30 m en x ; étages de 4 et 3,5 m ; mâts de 20 m ; rien sous y = 0.
- Tous les noms ci-dessus présents à l'identique ; `vitres` et `feux` présents ; moins de 3 500
  triangles.
