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

## Le socle, la cour, le signe

Ce site est une maquette posée sur sa base de wargame (ADR 0038). Tout le site tient sur le socle ; le bâtiment, ses portes et ses pièces nommées gardent leurs mètres et leurs pivots, simplement rehaussés de 2,2 m (le dessus du socle). **Le bâtiment lui-même ne change pas.** Les x et z des tableaux qui suivent restent vrais.

**Rehausse.** L'origine du fichier reste au même (x, z), au pied du socle (y = 0) ; le dessus du socle est à y = 2,2. Toute cote y des tableaux ci-dessous se lit **+2,2 m** : un pivot ou un repère donné à y = 0 passe à 2,2. En particulier : perron et soubassement à 3,2 m, `porte_gauche` et `porte_droite` pivotent à y = 3,2, `porte_service` à 2,2 (seuil), `fx_entree` (0 ; 3,2 ; +6,7), `fx_sortie` (0 ; 3,2 ; +8,2), `fx_quai` (+24 ; 2,2 ; z de la baie), `fx_smoke` et `fx_tete_hampe` +2,2 m ; `fx_tete_hampe` passe en (−26 ; 32,2 ; +20). Seul le socle descend jusqu'à y = 0.

- `socle`, fixe : rectangle aux coins arrondis (rayon 6 m), dessus à y = 2,2 m, biseau de 0,8 m à 45° sur tout le tour. Couleur papier, à peine plus claire que la feuille (#ebe1c8, L* 90), flanc et biseau plus sombres (#bfae8a). Ici 76 × 71 m : x de −38 à 38, z de −38 à 33. Il enveloppe le corps, les deux ailes en retour (jusqu'à z = −30) et le perron : 8 m de débord sur les côtés et derrière, 25 m devant la façade pour la cour d'honneur. Rien du site ne dépasse le socle sauf le drapeau au vent.
- `lisere`, fixe, matériau `lisere` à part (le jeu le teint à l'encre de la nation) : une bande de 3 m de large sur le bord du dessus du socle, 6 cm au-dessus, blanc neutre dans le GLB.
- `cour`, fixe : les sols peints sur le socle, 4 cm d'épaisseur au plus ; les rangs, tirets, joints et sillons sont peints dans l'atlas, pas modelés. Valeurs proches du socle : 10 à 20 points de L* plus sombres au plus, jamais saturées. Ici : gravier de la cour d'honneur devant le perron (z de +11 à +30), allée de dalles de la porte d'honneur au campanile ; chaussée de béton de 4 × 12 m devant la porte de service (côté +x).
- `signe`, fixe : le campanile à mâts radio : tour carrée de pierre blonde de 5 × 5 m et 22 m, plantée en (−26 ; 2,2 ; +20), avec à son sommet deux mâts de treillis d'acier jusqu'à 36 m, à ses angles arrière, reliés par un fil. Ce n'est pas la tour à horloge du corps central, qui reste au bâtiment. Il dépasse le bâtiment d'au moins un quart de sa hauteur (le bâtiment monte à 22 m, le signe à 28 m au moins au-dessus du socle) et le dit en silhouette noire de 40 px. Il porte seul la couleur chaude du site, une matière désaturée (brique, rayures, cuivre, minium), pas une couleur de jeu.
- `hampe` et `drapeau` passent sur le signe (mêmes noms, mêmes pivots : pied de la hampe, coin haut de la toile). La hampe (6 m, au lieu de 8) est plantée au centre de la plate-forme du campanile : pied en (−26 ; 24,2 ; +20). Elle ne reste pas sur la tour du corps central. `fx_tete_hampe` les suit, au sommet de la hampe.
- `fx_rang` : repère vide sur la cour, en (-5 ; 2,2 ; 16), au milieu du bord du rectangle côté bâtiment ; +z vers le rang. La cour laisse libre le rectangle de 30 m (x de −20 à 10) sur 14 m (z de 16 à 30) devant lui pour la garnison (le jeu y pose ses figurines), et le chemin libre de `fx_sortie` à ce rectangle. Aucun accessoire ni signe n'y entre, et la cour n'y est pas plus sombre que le socle de plus de 20 points de L*.
- Accessoires par niveau et par état, chacun un groupe fixe, tous masqués sauf un par le jeu : `niveau_1` (toujours : le minimum d'un site vivant, deux bornes peintes et un petit fanal de 2 m), `niveau_2` et `niveau_3` (ils s'ajoutent), `chantier`, `ruines`. 20 à 80 triangles par objet, 150 par groupe au plus ; aucun ne ressemble à une pièce du jeu (ni soldat, ni véhicule, ni avion, ni canon, ni bateau).
  - `niveau_2` : deux guérites de planches et une barrière peinte de rayures devant la grille, côté −x, en (−10 ; 2,2 ; +28).
  - `niveau_3` : deux massifs de buis de 1,5 m, un bassin rond de 5 m de diamètre au milieu de la cour (z ≈ +24, hors du rang) et une rangée de poteaux à chaîne.
  - `chantier` : échafaudage sur la façade et les deux ailes, une grue-mât rouge de 18 m en (+8 ; 2,2 ; +26), tas de sable, madriers. Le jeu coupe le bâtiment par un plan qui monte ; l'échafaudage ne dépasse pas le bâtiment et n'a besoin d'aucune pièce nommée.
  - `ruines` : gravats de pierre de taille, murs arasés à 3 m, ailes éventrées, poutres noircies, trace de feu sur la cour ; le campanile reste debout.
- Budget : le bâtiment 2 500 triangles au plus ; socle, liseré, cour et signe 700 au total ; chaque groupe d'accessoires 150 ; **total sous 3 500 dans n'importe quel état**. Atlas WebP 512² au plus : cinq cases de plus (papier du socle, gravier, béton d'aire, labours, toile de tente).
- Contrôle : vu de haut à 45°, socle de 64 px de large, le site se reconnaît à son signe ; à 25 px, socle, liseré et signe seuls le disent encore. Le socle fait partie du modèle : ce n'est pas un « sol » à retirer à l'export.

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
  seule texture atlas de 512 px au plus, peinte sur canvas.
- `vitres` : toutes les fenêtres, le cadran de l'horloge et les lanternes.
- `fond_sombre` : matériau à part, noir mat (les deux fonds).
- Figurine peinte, contours nets, couleurs d'époque désaturées (pierre blonde, ardoise, volets gris).
  Aucun drapeau peint, aucun insigne.
- **Budget : 3 500 triangles par site**, dans n'importe quel état : 2 500 au plus pour le bâtiment, 700 pour le socle, le liseré, la cour et le signe, 150 par groupe d'accessoires (section « Le socle, la cour, le signe »).

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
- 1 unité = 1 m ; 60 m en x ; étages de 4 et 3,5 m ; porte de 3,4 m ; le dessus du socle à y = 2,2 et le bâtiment posé dessus, rien sous y = 0.
- Chaque battant tourne autour de son gond (essayer 0°, 90°, 110°).
- Tous les noms ci-dessus présents à l'identique ; `vitres` sur les vitres ; budget de 3 500 triangles par état (bâtiment ≤ 2 500).
- Le socle (dessus à y = 2,2 m, rayon de coin 6 m, biseau 0,8 m), `lisere` (matériau `lisere`), `cour`, `signe`, `fx_rang`, `niveau_1`, `niveau_2`, `niveau_3`, `chantier` et `ruines` présents, écrits à l'identique ; `hampe`, `drapeau` et `fx_tete_hampe` sur le signe, mêmes noms, mêmes pivots.
- Le bâtiment inchangé et rehaussé de 2,2 m ; la cour libre du rectangle de 30 × 14 m devant `fx_rang` ; aucun accessoire ne ressemble à une pièce du jeu.
- Dans la page, des cases pour montrer un seul groupe (`niveau_2`, `niveau_3`, `chantier`, `ruines`) et compter les triangles de chaque état : moins de 3 500 dans tous.
