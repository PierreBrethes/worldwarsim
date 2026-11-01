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

## Le socle, la cour, le signe

Ce site est une maquette posée sur sa base de wargame (ADR 0038). Tout le site tient sur le socle ; le bâtiment, ses portes et ses pièces nommées gardent leurs mètres et leurs pivots, simplement rehaussés de 2,2 m (le dessus du socle). **Le bâtiment lui-même ne change pas.** Les x et z des tableaux qui suivent restent vrais.

**Rehausse.** L'origine du fichier reste au même (x, z), au pied du socle (y = 0) ; le dessus du socle est à y = 2,2. Toute cote y des tableaux ci-dessous se lit **+2,2 m** : un pivot ou un repère donné à y = 0 passe à 2,2. En particulier : les quatre dalles de béton à 2,2 → 2,5 m, portes à 2,5 m, `fx_smoke` +2,2 m. Seul le socle descend jusqu'à y = 0.

- `socle`, fixe : rectangle aux coins arrondis (rayon 6 m), dessus à y = 2,2 m, biseau de 0,8 m à 45° sur tout le tour. Couleur papier, à peine plus claire que la feuille (#ebe1c8, L* 90), flanc et biseau plus sombres (#bfae8a). Ici 66 × 58 m : x de −33 à 33, z de −22 à 36. Il enveloppe les quatre baraques et leurs dalles : 8 m de débord sur les côtés et derrière, 23 m devant les pignons pour la place. Rien du site ne dépasse le socle sauf le drapeau au vent.
- `lisere`, fixe, matériau `lisere` à part (le jeu le teint à l'encre de la nation) : une bande de 3 m de large sur le bord du dessus du socle, 6 cm au-dessus, blanc neutre dans le GLB.
- `cour`, fixe : les sols peints sur le socle, 4 cm d'épaisseur au plus ; les rangs, tirets, joints et sillons sont peints dans l'atlas, pas modelés. Valeurs proches du socle : 10 à 20 points de L* plus sombres au plus, jamais saturées. Ici : pavés peints de la place devant les pignons (z de +14 à +33), allée de gravier vers le clocher ; les dalles de béton des baraques restent au bâtiment.
- `signe`, fixe : le clocher : tour carrée de brique de 6 × 6 m, ardoise et flèche, 22 m, bandeau blanc sous le beffroi, en (+22 ; 2,2 ; +24). C'est lui qui dit « ville » à 40 px, car les baraques sont basses. Il dépasse le bâtiment d'au moins un quart de sa hauteur (le bâtiment monte à 7 m, le signe à 9 m au moins au-dessus du socle) et le dit en silhouette noire de 40 px. Il porte seul la couleur chaude du site, une matière désaturée (brique, rayures, cuivre, minium), pas une couleur de jeu.
- `hampe` et `drapeau` passent sur le signe (mêmes noms, mêmes pivots : pied de la hampe, coin haut de la toile). La hampe (5 m, au lieu de 10) est plantée sur le beffroi, au pied de la flèche : pied en (+22 ; 18,2 ; +24). `fx_tete_hampe` les suit, au sommet de la hampe.
- `fx_rang` : repère vide sur la cour, en (-10 ; 2,2 ; 18), au milieu du bord du rectangle côté bâtiment ; +z vers le rang. La cour laisse libre le rectangle de 30 m (x de −25 à 5) sur 14 m (z de 18 à 32) devant lui pour la garnison (le jeu y pose ses figurines), et le chemin libre de `fx_sortie` à ce rectangle. Aucun accessoire ni signe n'y entre, et la cour n'y est pas plus sombre que le socle de plus de 20 points de L*.
- Accessoires par niveau et par état, chacun un groupe fixe, tous masqués sauf un par le jeu : `niveau_1` (toujours : le minimum d'un site vivant, deux bornes peintes et un petit fanal de 2 m), `niveau_2` et `niveau_3` (ils s'ajoutent), `chantier`, `ruines`. 20 à 80 triangles par objet, 150 par groupe au plus ; aucun ne ressemble à une pièce du jeu (ni soldat, ni véhicule, ni avion, ni canon, ni bateau).
  - `niveau_2` : une fontaine de pierre de 4 m de diamètre en (+8 ; 2,2 ; +26), hors du rang, et deux bancs.
  - `niveau_3` : une halle de marché ouverte de 10 × 6 m à toit de tuile et trois étals de planches ; une rangée de lampadaires de 4 m.
  - `chantier` : échafaudage sur deux pignons, une grue-mât rouge de 14 m, tas de sable et de moellons, madriers. Le jeu coupe le bâtiment par un plan qui monte ; l'échafaudage ne dépasse pas le bâtiment et n'a besoin d'aucune pièce nommée.
  - `ruines` : gravats de brique et de tôle, pignons arasés à 3 m, voûtes de tôle affaissées, poutres noircies, trace de feu sur les pavés ; le clocher reste debout, noirci.
- Budget : le bâtiment 2 500 triangles au plus ; socle, liseré, cour et signe 700 au total ; chaque groupe d'accessoires 150 ; **total sous 3 500 dans n'importe quel état**. Atlas WebP (512² visé, 1 024 au plus) : cinq cases de plus (papier du socle, gravier, béton d'aire, labours, toile de tente).
- Contrôle : vu de haut à 45°, socle de 64 px de large, le site se reconnaît à son signe ; à 25 px, socle, liseré et signe seuls le disent encore. Le socle fait partie du modèle : ce n'est pas un « sol » à retirer à l'export.

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
- **Budget : 3 500 triangles par site**, dans n'importe quel état : 2 500 au plus pour le bâtiment, 700 pour le socle, le liseré, la cour et le signe, 150 par groupe d'accessoires (section « Le socle, la cour, le signe »).

## Ce que le modèle doit permettre

- La fumée des poêles sort par `fx_smoke`.
- La nuit, les fenêtres s'allument.
- À la capture, le drapeau descend, celui du vainqueur monte.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 50 m en x ; porte de 3,3 m ; le dessus du socle à y = 2,2 et le bâtiment posé dessus, rien sous y = 0.
- `hampe`, `drapeau`, `fx_smoke`, `fx_tete_hampe` présents à l'identique ; `vitres` sur les
  vitres ; budget de 3 500 triangles par état (bâtiment ≤ 2 500).
- Le socle (dessus à y = 2,2 m, rayon de coin 6 m, biseau 0,8 m), `lisere` (matériau `lisere`), `cour`, `signe`, `fx_rang`, `niveau_1`, `niveau_2`, `niveau_3`, `chantier` et `ruines` présents, écrits à l'identique ; `hampe`, `drapeau` et `fx_tete_hampe` sur le signe, mêmes noms, mêmes pivots.
- Le bâtiment inchangé et rehaussé de 2,2 m ; la cour libre du rectangle de 30 × 14 m devant `fx_rang` ; aucun accessoire ne ressemble à une pièce du jeu.
- Dans la page, des cases pour montrer un seul groupe (`niveau_2`, `niveau_3`, `chantier`, `ruines`) et compter les triangles de chaque état : moins de 3 500 dans tous.
