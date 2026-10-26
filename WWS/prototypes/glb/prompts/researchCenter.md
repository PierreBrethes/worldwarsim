# Centre de recherche — researchCenter.glb

Un pavillon de laboratoire des années 1930 en brique claire, à un étage et à toit-terrasse, flanqué
d'un atelier à sheds, avec sur le toit une coupole d'observatoire tournante d'où sort une lunette,
une cheminée de laboratoire et une antenne en treillis. Dans « La Manchette » (stratégie, presse
illustrée de 1940), il cherche les cartes de recherche ; sa coupole tourne pendant qu'il cherche.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la façade regarde +z. Origine au sol (y = 0),
au centre de l'emprise. Rien sous y = 0. « Gauche » = +x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m. Rez-de-chaussée de 4 m, étage de 3,5 m,
fenêtres de 1,6 à 2 m, porte de 3,4 m, marches de 0,2 m. Le modèle précédent avait un
rez-de-chaussée de 13 m, une porte de 9,4 m et une coupole de 19 m : ne pas l'imiter.

- **Emprise** : 50 m (x) × 30 m (z).
- **Pavillon** : 34 m (x de −25 à +9) × 16 m (z de −4 à +12). Soubassement 0,8 m,
  rez-de-chaussée 4 m, étage 3,5 m, acrotère à 9,3 m, toit-terrasse. Fenêtres hautes de
  laboratoire 1,6 × 2,0 m, allège 0,9 m, en travées régulières ; pilastres.
- **Entrée** : au milieu du pavillon (x = −8, z = +12), porte à deux battants de 2,4 × 3,4 m sous
  un petit fronton ; perron de 0,8 m à quatre marches.
- **Atelier** : 16 m (x de +9 à +25) × 14 m, un niveau de 6 m, toit en sheds vitrés.
- **Observatoire** sur le toit du pavillon, au-dessus de l'entrée : tambour cylindrique de Ø 8 m et
  3 m de haut, coupole hémisphérique de Ø 8 m, fente d'observation de 1,2 m de large fermée par un
  volet ; lunette de 4 m sur sa monture.
- **Cheminée de laboratoire** (Ø 1 m, 4 m au-dessus de la terrasse) et **antenne** en treillis de
  12 m au-dessus de l'atelier.
- **Hampe** : 10 m au sol à x = +20, z = +18 ; drapeau de 3 × 2 m (3:2 exact).

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `coupole` | centre de la base de la coupole, sur l'axe du tambour (−8 ; 12,3 ; +4) | tourne autour de y, lentement, tant que la recherche avance | Ø 8 m |
| `volet_coupole` | centre de la coupole | enfant de `coupole` ; ouvre la fente en tournant autour de l'axe x de la coupole, jusqu'à 90° | 1,4 m de large |
| `lunette` | axe de hauteur de la monture | enfant de `coupole` ; se lève autour de x de 10° à 60°, dans la fente | 4 m |
| `porte_gauche` | gond, montant +x de la porte (x = −6,8 ; y = 0,8 ; z = +12) | axe vertical ; s'étend vers −x ; vers l'extérieur de +110° | 1,2 × 3,4 m |
| `porte_droite` | gond, montant −x (x = −9,2 ; y = 0,8 ; z = +12) | axe vertical ; s'étend vers +x ; vers l'extérieur de −110° | 1,2 × 3,4 m |
| `fond_sombre` | centre du plan | fixe ; noir mat, 0,3 m derrière les battants | 2,4 × 3,4 m |
| `hampe` | pied du mât (+20, 0, +18) | fixe | 10 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât | pend vers −y, s'étend vers −x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_sortie` | seuil de la porte (−8 ; 0,8 ; +12,2) | +z |
| `fx_smoke` | sommet de la cheminée de laboratoire | +y |
| `fx_tete_hampe` | sommet de la hampe | +y |

## Matériaux et texture

- Matériaux nommés par matière (`brique_claire`, `pierre`, `cuivre_coupole`, `acier`…), une seule
  texture atlas de 1 024 px au plus, peinte sur canvas.
- `vitres` : fenêtres, sheds de l'atelier. `fond_sombre` : noir mat, aussi à l'intérieur de la
  fente de la coupole.
- Figurine peinte, contours nets, couleurs d'époque désaturées (brique blonde, coupole gris-vert
  de cuivre patiné). Aucun drapeau peint, aucun insigne.
- **Moins de 3 500 triangles.**

## Ce que le modèle doit permettre

- Pendant une recherche, la coupole tourne lentement, le volet s'ouvre et la lunette se lève.
- La nuit, les fenêtres s'allument et la fente de la coupole luit.
- Les battants s'ouvrent de 110° ; un homme sort par `fx_sortie`.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 50 m en x ; étages de 4 et 3,5 m ; coupole de 8 m ; rien sous y = 0.
- La coupole tourne sur l'axe de son tambour sans se décaler ; tous les noms ci-dessus présents à
  l'identique ; `vitres` sur les vitres ; moins de 3 500 triangles.
