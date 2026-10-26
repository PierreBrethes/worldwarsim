# Caserne — barracks.glb

Une caserne d'infanterie française des années 1930 : un corps de trois niveaux en enduit clair sur
soubassement de pierre, toit d'ardoise, et une remise basse accolée à son pignon pour les
véhicules. Dans « La Manchette », jeu de stratégie à l'esthétique de presse illustrée de 1940,
c'est d'elle que sortent, par la porte, chaque escouade, char, canon et camion formés.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; la façade principale regarde +z. Origine au
sol (y = 0), **au centre du corps `murs`** (et non de l'emprise totale : la remise dépasse d'un
côté, et le jeu mesure la caserne sur ses murs, 50 m). Rien sous y = 0. « Gauche » veut dire côté
+x (la gauche de qui sort du bâtiment), « droite » côté −x.

**L'échelle humaine.** L'homme du jeu mesure 2,6 m (un homme de 1,75 m agrandi ×1,5) : chaque
porte, marche et fenêtre se dessine pour lui. Les modèles précédents se trompaient ici (étages de
4,8 m, fenêtres de 2,6 m) : ne pas les imiter.

- **Corps (`murs`)** : 50 m (x) × 15,4 m (z), x de −25 à +25, z de −7,7 à +7,7. Soubassement de
  pierre de 0,8 m (le rez-de-chaussée est à +0,8 m). Trois niveaux de 3,9 m : planchers à 0,8,
  4,7 et 8,6 m ; corniche et égout à 12,5 m. Toit d'ardoise à deux pans à 35°, faîtage à ≈ 18 m,
  deux souches de cheminée.
- **Fenêtres** : 1,6 m de large × 2,0 m de haut, allège à 0,9 m au-dessus de chaque plancher
  (appuis à 1,7, 5,6 et 9,5 m) ; travées de 3,5 m environ ; encadrement en relief de 0,1 m,
  appui saillant de 0,15 m. Petits soupiraux dans le soubassement.
- **Porte d'entrée** : au milieu de la façade (x = 0, z = +7,7), baie de 2,4 m de large × 3,4 m
  de haut, seuil à +0,8 m. Deux battants de 1,2 × 3,4 m, 0,12 m d'épaisseur. Encadrement de pierre,
  linteau, marquise ou fronton au-dessus (facultatif).
- **Perron** : 0,8 m de haut, palier de 5 m (x) × 2 m (z) devant la porte, quatre marches de
  0,2 m de haut et 0,3 m de giron descendant vers +z ; il s'avance jusqu'à z ≈ +10,9.
- **Remise** : aile basse accolée au pignon +x, façade alignée sur celle du corps : x de +25 à
  +39 (14 m), z de −7,7 à +7,7, 6 m à l'égout, toit à faible pente. Sol de plain-pied (y = 0, pas
  de marche). Baie de 5 m de large × 4,2 m de haut au milieu de sa façade (x = +32), linteau de
  6,2 × 0,5 m. Deux vantaux de 2,5 × 4,2 m, 0,15 m d'épaisseur. Profondeur intérieure ≥ 10 m.
  Gabarit : un char de 3 m de large et 2,8 m de haut y passe avec 0,5 m de jeu de chaque côté et
  au-dessus ; un camion de 2,3 × 3 m aussi.
- **Hampe** : mât de 12 m posé au sol devant la façade, à x = −20, z = +12 ; drapeau de
  3 × 2 m (proportion 3:2 exacte).
- **Lanternes** : une au-dessus de chaque porte, à 0,4 m au-dessus du linteau.

## Pièces nommées

Chaque pièce qui bouge est un nœud à part, jamais fusionné au reste, son origine au point où elle
tourne ou glisse. Aucun autre nom pour une pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `murs` | centre du corps au sol (0, 0, 0) | fixe : le jeu mesure la caserne sur lui | 50 × 12,5 × 15,4 m |
| `porte_gauche` | gond, au bas du montant +x de la baie (x = +1,2 ; y = 0,8 ; z = +7,7) | axe vertical ; le battant s'étend vers −x ; s'ouvre vers l'extérieur de **+110°** (rotation positive autour de y) | 1,2 × 3,4 × 0,12 m |
| `porte_droite` | gond, au bas du montant −x (x = −1,2 ; y = 0,8 ; z = +7,7) | axe vertical ; s'étend vers +x ; s'ouvre vers l'extérieur de **−110°** | 1,2 × 3,4 × 0,12 m |
| `fond_sombre` | centre du plan | fixe ; plan noir mat dans la baie, 0,3 m en retrait derrière les battants fermés | 2,4 × 3,4 m |
| `remise_murs` | centre de la remise au sol (+32, 0, 0) | fixe | 14 × 6 × 15,4 m |
| `remise_toit` | — | fixe, débord de 0,4 m | — |
| `remise_porte_gauche` | gond, au bas du montant +x de la baie (x = +34,5 ; y = 0 ; z = +7,7) | axe vertical ; s'étend vers −x ; vers l'extérieur de **+110°** | 2,5 × 4,2 × 0,15 m |
| `remise_porte_droite` | gond, au bas du montant −x (x = +29,5 ; y = 0 ; z = +7,7) | axe vertical ; s'étend vers +x ; vers l'extérieur de **−110°** | 2,5 × 4,2 × 0,15 m |
| `remise_fond_sombre` | centre du plan | fixe ; plan noir mat 0,3 m en retrait derrière les vantaux | 5 × 4,2 m |
| `hampe` | pied du mât (−20, 0, +12) | fixe | Ø 0,15 m, 12 m |
| `drapeau` | en haut de la hampe, au coin haut de la toile côté mât (−20, 11,8, +12) | la toile pend vers −y et s'étend vers +x ; le moteur la fait flotter (maillage) et la descend le long de y | 3 × 2 m, grille d'au moins 8 × 4 quads |

Le drapeau est une toile neutre (blanc cassé) : le jeu y peint le drapeau de qui tient la caserne.
Ses UV couvrent 0 → 1 sur toute la toile, u le long de la toile depuis la hampe, v de bas en haut.

## Repères vides

Object3D sans géométrie, orientés : leur +z est la direction indiquée.

| Repère | Position | Orientation |
|---|---|---|
| `fx_entree` | dans le couloir, 1 m derrière `fond_sombre` : (0 ; 0,8 ; +6,4) | +z |
| `fx_sortie` | sur le seuil de la porte d'entrée : (0 ; 0,8 ; +7,9) | +z (vers l'extérieur) |
| `fx_entree_remise` | dans la remise, 4 m derrière la baie : (+32 ; 0 ; +3,7) | +z |
| `fx_sortie_remise` | sur le seuil de la remise : (+32 ; 0 ; +7,9) | +z |
| `fx_smoke` | au sommet de chaque souche de cheminée (`fx_smoke`, `fx_smoke_2`) | +y |
| `fx_tete_hampe` | au sommet de la hampe (−20 ; 12 ; +12) | +y |

## Matériaux et texture

- Plusieurs matériaux nommés (un par matière : `enduit`, `pierre`, `ardoise`, `bois_porte`…),
  qui partagent **une seule texture atlas de 1 024 px au plus**, peinte sur canvas, aucune
  texture externe. Chaque primitive a son matériau.
- `vitres` : toutes les vitres des fenêtres et les deux lanternes (le jeu les allume la nuit).
- `fond_sombre` : matériau à part, noir mat, pour `fond_sombre` et `remise_fond_sombre` (le jeu
  le fait rougeoyer la nuit).
- Rendu de figurine peinte : contours nets, couleurs d'époque désaturées (enduit ocre pâle,
  pierre grise, ardoise bleu-gris, menuiseries vert sombre). La maquette est la même pour toutes
  les nations : aucun drapeau peint, aucun insigne.
- Lisible de haut, caméra à 30° sous la verticale, de 20 à 400 px de haut à l'écran : la porte,
  le perron et la remise se lisent avant les détails.
- **Moins de 3 500 triangles.** Le relief de façade (corniche, bandeau, encadrements) a sa place
  dans ce budget.

## Ce que le modèle doit permettre

- Les deux battants s'ouvrent vers l'extérieur de 110° ; trois hommes de 2,6 m sortent du noir
  par `fx_sortie`, l'un après l'autre, descendent les quatre marches et vont au rang.
- Les vantaux de la remise s'ouvrent de 110° ; un char de 6 m, un canon ou un camion sort tout
  droit de `fx_sortie_remise`, puis les vantaux se referment après le dernier.
- À l'inverse, une pièce qui rentre en garnison passe le seuil et s'efface dans `fond_sombre`.
- La nuit, les fenêtres, les lanternes et le fond des deux entrées s'allument : les silhouettes
  s'y découpent.
- À la capture, le drapeau descend le long de la hampe, celui du vainqueur monte.
- La fumée sort des cheminées par `fx_smoke`.

## À vérifier avant de livrer

- Livrable : une page three.js autonome (OrbitControls, vue de face, vue de dessus, vue de trois
  quarts haute) avec un bouton « Exporter en GLB » (GLTFExporter, binaire). Exporter **le seul
  groupe du modèle** : ni lumière, ni caméra, ni sol dans le fichier. Ni meshopt, ni quantification.
- Texture : WebP si l'exporteur sait l'écrire (EXT_texture_webp), sinon PNG (je la convertirai).
- 1 unité = 1 m ; `murs` mesure 50 m en x ; égout à 12,5 m ; rien sous y = 0.
- Origine au centre de `murs`, façade vers +z, remise côté +x.
- Tous les noms ci-dessus présents, écrits à l'identique ; chaque battant tourne autour de son
  gond sans se détacher du mur (essayer 0°, 90° et 110° dans la page).
- Un homme de 2,6 m passe sous la porte (3,4 m) ; un bloc de 3 × 2,8 × 6 m passe la remise.
- `fond_sombre` et `remise_fond_sombre` présents, noirs, derrière les battants fermés.
- Matériau `vitres` sur toutes les vitres ; moins de 3 500 triangles.
