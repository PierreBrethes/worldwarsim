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

## Le socle, la cour, le signe

Ce site est une maquette posée sur sa base de wargame (ADR 0038). Tout le site tient sur le socle ; le bâtiment, ses portes et ses pièces nommées gardent leurs mètres et leurs pivots, simplement rehaussés de 2,2 m (le dessus du socle). **Le bâtiment lui-même ne change pas.** Les x et z des tableaux qui suivent restent vrais.

**Rehausse.** L'origine du fichier reste au même (x, z), au pied du socle (y = 0) ; le dessus du socle est à y = 2,2. Toute cote y des tableaux ci-dessous se lit **+2,2 m** : un pivot ou un repère donné à y = 0 passe à 2,2. En particulier : `porte` pivote à y = 8,0 (z = +20,2), `rail` à 8,1, quai à 3,4 m (sol intérieur), `fx_quai` (0 ; 2,2 ; +23,5), `fx_entree` (0 ; 3,4 ; +17), `fx_sortie` (0 ; 3,4 ; +20,4), `caisse_*` posées à 3,4 m. Seul le socle descend jusqu'à y = 0.

- `socle`, fixe : rectangle aux coins arrondis (rayon 6 m), dessus à y = 2,2 m, biseau de 0,8 m à 45° sur tout le tour. Couleur papier, à peine plus claire que la feuille (#ebe1c8, L* 90), flanc et biseau plus sombres (#bfae8a). Ici 76 × 76 m : x de −38 à 38, z de −28 à 48. Il enveloppe le corps de 60 × 40 m et son quai : 8 m de débord sur les côtés et derrière, 25 m devant le quai de chargement pour l'aire des camions. Rien du site ne dépasse le socle sauf le drapeau au vent.
- `lisere`, fixe, matériau `lisere` à part (le jeu le teint à l'encre de la nation) : une bande de 3 m de large sur le bord du dessus du socle, 6 cm au-dessus, blanc neutre dans le GLB.
- `cour`, fixe : les sols peints sur le socle, 4 cm d'épaisseur au plus ; les rangs, tirets, joints et sillons sont peints dans l'atlas, pas modelés. Valeurs proches du socle : 10 à 20 points de L* plus sombres au plus, jamais saturées. Ici : béton d'aire de chargement devant le quai (z de +23 à +46), gravier sur les côtés ; deux voies de roulement peintes sous le portique ; une bande de 7 m libre sur l'axe x = 0 pour le camion qui recule jusqu'à `fx_quai`.
- `signe`, fixe : le portique de levage : deux jambes de treillis rouge minium de 1,2 × 1,2 m, en (+20 ; 2,2 ; +36) et (+34 ; 2,2 ; +36), portant une poutre de 16 m à 22 m de haut (24,2 m depuis y = 0, y compris le socle), un chariot et un palan fixe en bout de poutre ; 22 m de haut. Il dépasse le bâtiment d'au moins un quart de sa hauteur (le bâtiment monte à 16 m, le signe à 20 m au moins au-dessus du socle) et le dit en silhouette noire de 40 px. Il porte seul la couleur chaude du site, une matière désaturée (brique, rayures, cuivre, minium), pas une couleur de jeu.
- `hampe` et `drapeau` passent sur le signe (mêmes noms, mêmes pivots : pied de la hampe, coin haut de la toile). La hampe (6 m, au lieu de 12) est plantée sur la poutre, au-dessus de la jambe +x : pied en (+34 ; 24,2 ; +36). `fx_tete_hampe` les suit, au sommet de la hampe.
- `fx_rang` : repère vide sur la cour, en (-20 ; 2,2 ; 30), au milieu du bord du rectangle côté bâtiment ; +z vers le rang. La cour laisse libre le rectangle de 30 m (x de −35 à −5) sur 14 m (z de 30 à 44) devant lui pour la garnison (le jeu y pose ses figurines), et le chemin libre de `fx_sortie` à ce rectangle. Aucun accessoire ni signe n'y entre, et la cour n'y est pas plus sombre que le socle de plus de 20 points de L*.
- Accessoires par niveau et par état, chacun un groupe fixe, tous masqués sauf un par le jeu : `niveau_1` (toujours : le minimum d'un site vivant, deux bornes peintes et un petit fanal de 2 m), `niveau_2` et `niveau_3` (ils s'ajoutent), `chantier`, `ruines`. 20 à 80 triangles par objet, 150 par groupe au plus ; aucun ne ressemble à une pièce du jeu (ni soldat, ni véhicule, ni avion, ni canon, ni bateau).
  - `niveau_2` : une rangée de palettes vides en piles de 1,5 m et un abri à bidons de tôle de 6 × 4 m à droite du quai.
  - `niveau_3` : un second quai bas en bout de façade côté −x, avec trois piles de sacs de jute (pas de caisses : les `caisse_*` du bâtiment sont les seules) ; une baraque de contremaître de 5 × 4 m.
  - `chantier` : échafaudage sur la façade et le pignon, une grue-mât rouge de 16 m en (−34 ; 2,2 ; +40), tas de sable, madriers. Le jeu coupe le bâtiment par un plan qui monte ; l'échafaudage ne dépasse pas le bâtiment et n'a besoin d'aucune pièce nommée.
  - `ruines` : gravats de brique et de tôle autour du quai, murs arasés à 3 m, poutres noircies et tôles tordues, trace de feu sur le béton ; le portique reste debout.
- Budget : le bâtiment 2 500 triangles au plus ; socle, liseré, cour et signe 700 au total ; chaque groupe d'accessoires 150 ; **total sous 3 500 dans n'importe quel état**. Atlas WebP (512² visé, 1 024 au plus) : cinq cases de plus (papier du socle, gravier, béton d'aire, labours, toile de tente).
- Contrôle : vu de haut à 45°, socle de 64 px de large, le site se reconnaît à son signe ; à 25 px, socle, liseré et signe seuls le disent encore. Le socle fait partie du modèle : ce n'est pas un « sol » à retirer à l'export.

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
- **Budget : 3 500 triangles par site**, dans n'importe quel état : 2 500 au plus pour le bâtiment, 700 pour le socle, le liseré, la cour et le signe, 150 par groupe d'accessoires (section « Le socle, la cour, le signe »).

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
- 1 unité = 1 m ; 60 m en x ; quai à 1,2 m ; porte 5 × 4,5 m ; caisses de 1,2 m ; le dessus du socle à y = 2,2 et le bâtiment posé dessus, rien sous y = 0.
- Tous les noms ci-dessus présents à l'identique ; `vitres` sur les vitres ; budget de 3 500 triangles par état (bâtiment ≤ 2 500).
- Le socle (dessus à y = 2,2 m, rayon de coin 6 m, biseau 0,8 m), `lisere` (matériau `lisere`), `cour`, `signe`, `fx_rang`, `niveau_1`, `niveau_2`, `niveau_3`, `chantier` et `ruines` présents, écrits à l'identique ; `hampe`, `drapeau` et `fx_tete_hampe` sur le signe, mêmes noms, mêmes pivots.
- Le bâtiment inchangé et rehaussé de 2,2 m ; la cour libre du rectangle de 30 × 14 m devant `fx_rang` ; aucun accessoire ne ressemble à une pièce du jeu.
- Dans la page, des cases pour montrer un seul groupe (`niveau_2`, `niveau_3`, `chantier`, `ruines`) et compter les triangles de chaque état : moins de 3 500 dans tous.
