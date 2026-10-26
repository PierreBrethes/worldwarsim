# Quartier général — hq.glb

Un quartier général installé dans un hôtel de préfecture des années 1900 : corps central à deux
étages en pierre de taille, deux ailes en retour, une petite tour à horloge qui porte le mât du
drapeau, des sacs de sable devant l'entrée. Dans « La Manchette » (stratégie, presse illustrée de
1940), c'est le cœur d'un joueur ; les camions viennent y charger par la porte de service.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la façade regarde +z. Origine au sol (y = 0),
au centre de l'emprise. Rien sous y = 0. « Gauche » = côté +x (la gauche de qui sort), « droite »
= −x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m. Rez-de-chaussée de 4 m, étage de 3,5 m,
fenêtres de 1,6 à 2 m de haut, porte de 3,4 m, marches de 0,2 m. Le modèle précédent avait des
fenêtres de 4,7 m et une porte de 8,3 m : ne pas l'imiter.

- **Emprise** : 60 m (x) × 38 m (z).
- **Corps central** : 40 m (x) × 16 m (z), façade à z = +8. Soubassement de 1 m (rez-de-chaussée à
  +1 m), rez-de-chaussée 4 m, deux étages de 3,5 m : corniche à 12 m. Toit d'ardoise à la Mansart,
  faîtage à ≈ 17 m, lucarnes, souches de cheminée.
- **Deux ailes en retour** aux extrémités du corps, vers l'arrière (−z) : 10 m de large chacune,
  jusqu'à z = −30, mêmes niveaux.
- **Fenêtres** : 1,4 × 2,0 m au rez-de-chaussée et au premier, 1,4 × 1,6 m au second ; allège
  0,9 m ; encadrements de pierre en relief.
- **Porte d'honneur** : au milieu (x = 0, z = +8), baie de 2,4 × 3,4 m, seuil à +1 m ; deux
  battants de 1,2 × 3,4 m. Perron de 1 m, cinq marches de 0,2 m ; porche à deux piliers.
- **Porte de service** : au rez-de-chaussée de l'aile +x, sur sa face extérieure (x = +20), au sol
  (seuil à y = 0, une rampe douce rattrape le soubassement), baie charretière de 3 × 3,4 m, un seul
  battant.
- **Tour** : carrée, 5 × 5 m, au milieu du corps, jusqu'à 22 m, une horloge ; le mât du drapeau
  est sur son toit.
- **Hampe** : 8 m sur le toit de la tour (pied à y = 22) ; drapeau de 3 × 2 m (3:2 exact).
- Sacs de sable en arc devant le perron (0,6 m de haut).
- Deux lanternes de part et d'autre de la porte d'honneur.

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `porte_gauche` | gond, au bas du montant +x de la porte d'honneur (x = +1,2 ; y = 1 ; z = +8) | axe vertical ; s'étend vers −x ; vers l'extérieur de +110° | 1,2 × 3,4 × 0,12 m |
| `porte_droite` | gond, au bas du montant −x (x = −1,2 ; y = 1 ; z = +8) | axe vertical ; s'étend vers +x ; vers l'extérieur de −110° | 1,2 × 3,4 × 0,12 m |
| `fond_sombre` | centre du plan | fixe ; noir mat, 0,3 m derrière les battants | 2,4 × 3,4 m |
| `porte_service` | gond, au bas du montant arrière (−z) de la baie de service, sur la face x = +20 | axe vertical ; s'ouvre vers l'extérieur (+x) de 110° | 3 × 3,4 × 0,12 m |
| `fond_sombre_service` | centre du plan | fixe ; noir mat derrière `porte_service` | 3 × 3,4 m |
| `hampe` | pied du mât, sur le toit de la tour (0 ; 22 ; 0) | fixe | 8 m |
| `drapeau` | haut de la hampe, coin haut de la toile côté mât (0 ; 29,8 ; 0) | pend vers −y, s'étend vers +x ; flotte et descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 |

Le drapeau est une toile neutre blanc cassé, UV 0 → 1 sur toute la toile : le jeu y peint le
drapeau du teneur. Plus de `flag` ni de `fanion`.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_entree` | derrière la porte d'honneur (0 ; 1 ; +6,7) | +z |
| `fx_sortie` | seuil de la porte d'honneur (0 ; 1 ; +8,2) | +z |
| `fx_quai` | au sol, 4 m devant la porte de service (+24 ; 0 ; z de la baie) | +x : le camion s'y arrête, l'arrière contre la baie |
| `fx_smoke` | au sommet de chaque souche de cheminée (`fx_smoke`, `fx_smoke_2`…) | +y |
| `fx_tete_hampe` | sommet de la hampe (0 ; 30 ; 0) | +y |

## Matériaux et texture

- Matériaux nommés par matière (`pierre_taille`, `ardoise`, `menuiserie`, `sac_sable`…), une
  seule texture atlas de 1 024 px au plus, peinte sur canvas.
- `vitres` : toutes les fenêtres, le cadran de l'horloge et les lanternes.
- `fond_sombre` : matériau à part, noir mat (les deux fonds).
- Figurine peinte, contours nets, couleurs d'époque désaturées (pierre blonde, ardoise, volets gris).
  Aucun drapeau peint, aucun insigne.
- **Moins de 3 500 triangles.**

## Ce que le modèle doit permettre

- Les deux battants s'ouvrent de 110° vers l'extérieur ; une sentinelle fait les cent pas devant
  le perron ; un homme sort du noir par `fx_sortie`.
- Un camion recule jusqu'à `fx_quai`, la porte de service s'ouvre, les caisses montent à bord.
- La nuit, les fenêtres, l'horloge, les lanternes et les deux fonds s'allument.
- À la capture, le drapeau descend du mât de la tour, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 60 m en x ; étages de 4 et 3,5 m ; porte de 3,4 m ; rien sous y = 0.
- Chaque battant tourne autour de son gond (essayer 0°, 90°, 110°).
- Tous les noms ci-dessus présents à l'identique ; `vitres` sur les vitres ; moins de 3 500
  triangles.
