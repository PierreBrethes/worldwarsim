# Entrepôt — warehouse.glb

Un entrepôt de brique des années 1930 sur un quai de chargement, toit de tôle à deux pans, une
porte coulissante sur rail à hauteur de camion et quelques caisses sur le quai. Dans « La
Manchette » (stratégie, presse illustrée de 1940), il relève le plafond des ressources et se
pille ; les camions y reculent pour charger.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la façade (la porte et le quai) regarde +z.
Origine au sol (y = 0), au centre de l'emprise du bâtiment. Rien sous y = 0. « Gauche » = +x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m ; le camion 6,5 × 2,3 × 3 m, plancher à 1,2 m.
Le modèle précédent avait une porte de 16 × 15,5 m et des étages de 10 m : ne pas l'imiter.

- **Corps** (`murs`) : 60 m (x) × 40 m (z), x de −30 à +30, z de −20 à +20. Soubassement-quai à
  1,2 m (le sol intérieur est à +1,2 m). Rez-de-chaussée de magasin de 5 m (jusqu'à 6,2 m), un
  étage de 3,5 m, égout à ≈ 10 m. Toit de tôle à deux pans, faîtage à ≈ 16 m. Piliers d'angle en
  brique, pilastres tous les 7,5 m.
- **Fenêtres** : à l'étage, 1,6 m × 2 m, allège 0,9 m ; au rez-de-chaussée, des jours hauts de
  1,6 × 1,6 m à 3,5 m du sol intérieur.
- **Quai de chargement** : sur toute la façade, 1,2 m de haut (le plancher du camion), 3 m de
  profondeur (z de +20 à +23), bord ferré.
- **Porte** : au milieu de la façade (x = 0), 5 m de large × 4,5 m de haut, seuil au niveau du quai
  (+1,2 m). Un seul vantail coulissant de 5,1 × 4,6 m, 0,15 m d'épaisseur, pendu par deux galets à
  un rail (`rail`) de 11 m posé à 5,9 m ; il glisse vers +x et se range devant le mur.
- **Caisses** : cinq caisses cubiques de 1,2 m sur le quai, à gauche de la porte vue de dehors
  (x de −6 à −3) : trois au sol, deux dessus.
- **Hampe** : mât de 12 m au sol à x = −27, z = +26 ; drapeau de 3 × 2 m (3:2 exact).
- Une lanterne au-dessus de la porte.

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `murs` | centre du corps au sol | fixe | 60 × 10 × 40 m |
| `porte` | en haut du vantail, à son bout +x, sur l'axe du rail (x = +2,55 ; y = 5,8 ; z = +20,2) | translation le long de +x, **course 5,2 m** | 5,1 × 4,6 × 0,15 m |
| `rail` | centre du rail | fixe | 11 m |
| `galet`, `galet_2` | axe de chaque galet, en haut du vantail | enfants de `porte` ; tournent autour de z quand elle glisse | Ø 0,3 m |
| `fond_sombre` | centre du plan | fixe ; plan noir mat dans la baie, 0,3 m derrière le vantail fermé | 5 × 4,5 m |
| `caisse_1` à `caisse_5` | centre du dessous de chaque caisse | chacune libre : le jeu les fait sauter dans un camion ou les fait porter | 1,2 × 1,2 × 1,2 m |
| `hampe` | pied du mât (−27, 0, +26) | fixe | 12 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât (−27 ; 11,8 ; +26) | pend vers −y, s'étend vers +x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_quai` | au sol, au pied du quai, face à la porte (0 ; 0 ; +23,5) | +z : le camion s'y arrête, l'arrière contre le quai, l'avant vers +z |
| `fx_entree` | dans le magasin, 3 m derrière la porte (0 ; 1,2 ; +17) | +z |
| `fx_sortie` | sur le seuil de la porte (0 ; 1,2 ; +20,4) | +z |
| `fx_tete_hampe` | sommet de la hampe | +y |

## Matériaux et texture

- Matériaux nommés par matière (`brique`, `beton`, `tole`, `fer`, `bois_caisse`…), une seule
  texture atlas de 1 024 px au plus, peinte sur canvas.
- `vitres` : les fenêtres et la lanterne. `fond_sombre` : matériau à part, noir mat.
- Figurine peinte, contours nets, couleurs d'époque désaturées (brique sourde, tôle rouillée,
  vantail de planches gris-vert, caisses vert olive). Aucun drapeau peint, aucun insigne.
- **Moins de 3 500 triangles.**

## Ce que le modèle doit permettre

- Le vantail glisse de 5,2 m sur `rail` vers +x, ses galets tournent ; la baie s'ouvre sur le noir.
- Un camion recule jusqu'à `fx_quai`, cul au quai ; les caisses sautent du quai sur son plancher
  (à 1,2 m, de plain-pied avec le quai).
- Piller : deux hommes entrent par `fx_sortie`, ressortent chacun une caisse.
- La nuit, les fenêtres, la lanterne et le fond de la porte s'allument.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Un curseur dans la page fait glisser la porte de 0 à 5,2 m.
- 1 unité = 1 m ; 60 m en x ; quai à 1,2 m ; porte 5 × 4,5 m ; caisses de 1,2 m ; rien sous
  y = 0.
- Tous les noms ci-dessus présents à l'identique ; `vitres` sur les vitres ; moins de 3 500
  triangles.
