# Navire d'escorte — escort.glb

Le navire d'escorte de chaque nation en 1940 (contre-torpilleur, destroyer, corvette ou croiseur
léger), sculpté comme une figurine de wargame peinte. Dans « La Manchette » (stratégie, presse
illustrée de 1940), il sort de la cale du port, accoste au môle, appareille en culant, et au combat
pivote ses tourelles et fait feu.

**Nation de cette conversation : ______** — ne lis que son paragraphe dans « Par nation ».
La planche de la nation est jointe : silhouette et peinture s'y prennent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel (le jeu réduit lui-même les navires de moitié ; ne pas le faire
ici). y vers le haut ; l'étrave (l'avant) vers +z. **Origine sur la ligne de flottaison (y = 0),
au milieu de la coque.** La coque descend sous y = 0 jusqu'à son tirant d'eau : c'est la seule
géométrie sous y = 0. « Bâbord » = côté +x (la gauche en regardant l'avant), « tribord » = −x.

- Longueur hors tout, largeur et tirant d'eau : ceux de la nation (« Par nation »).
- Une bande de flottaison peinte (rouge ou noire) de 0,8 m au-dessus de y = 0 : quand il est
  lège, le jeu le fait flotter plus haut et la bande se voit.
- Bittes d'amarrage à l'avant et à l'arrière, des deux bords.

## Pièces nommées

Les noms anglais existants se gardent. Chaque pièce qui bouge est un nœud à part, son origine où
elle tourne. Aucun autre nom pour une pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `hull` | origine du modèle | coque, ponts, superstructures, cheminées, mâts ; parent des autres | — |
| `turret_1` … `turret_N` | **centre de la couronne de chaque tourelle** (numérotées de l'avant vers l'arrière) | enfants de `hull` ; tournent autour de y (±150°) | — |
| `gun_1` … `gun_N` | **aux tourillons** du ou des canons de chaque tourelle | enfant de sa `turret_k` ; hausse autour de x (0° à +30°) ; recul le long de son axe | — |
| `boat_left`, `boat_right` | centre de la quille de chaque canot, sous ses bossoirs | enfants de `hull`, détachables : le jeu les met à l'eau | 7 à 8 m |

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_muzzle` | enfant de `gun_1`, à la bouche | le long du tube |
| `fx_smoke` | au sommet de la première cheminée | +y |
| `fx_sillage` | à la poupe, sur la flottaison (y = 0), au milieu | −z |
| `fx_amarre_avant_babord`, `fx_amarre_avant_tribord` | sur le pont, aux bittes avant de chaque bord | vers l'extérieur du bord |
| `fx_amarre_arriere_babord`, `fx_amarre_arriere_tribord` | sur le pont, aux bittes arrière de chaque bord | vers l'extérieur du bord |

Un seul `fx_muzzle` et un seul `fx_smoke`.

## Matériaux et texture

- Matériaux nommés par matière, une seule texture atlas de 1 024 px au plus, peinte sur canvas,
  d'après la planche ; **sans symbole de régime**.
- `vitres` : hublots et passerelle (allumés la nuit). `feux` : feux de route — rouge à bâbord (+x),
  vert à tribord (−x), sur les ailerons de passerelle ; blanc en tête de mât.
- Figurine peinte, contours nets, couleurs d'époque désaturées.
- Lisible de haut à 30° sous la verticale : tourelles, cheminées et mâts d'abord.
- **Plafond 4 000 triangles ; vise 1 200.**

## Ce que le modèle doit permettre

- Il arrive du large, se range le long du môle, s'amarre par ses quatre `fx_amarre_*` (le jeu tend
  les aussières de là aux bittes du môle) ; il appareille en culant, sillage à `fx_sillage`.
- Au combat, ses tourelles pivotent vers la cible, les canons se lèvent, tirent et reculent.
- Un canot se met à l'eau et mène des hommes à terre.
- Touché, il fume, gîte et s'enfonce par l'arrière ; la nuit, hublots et feux de route allumés.

## Par nation

Couleurs et marquages cités ici sont indicatifs : en cas d’écart, la planche jointe fait foi.

Longueur × largeur × tirant d'eau (m) ; tourelles.

- **France — contre-torpilleur Le Fantasque** : long et effilé, deux cheminées, plage avant
  relevée. 132,4 × 12,4 × 4,5 ; cinq pièces de 138 mm en masques simples (deux à l'avant, trois à
  l'arrière) : `turret_1` à `turret_5`. Gris clair.
- **Royaume-Uni — corvette classe Flower** : coque courte de baleinier, un mât, une cheminée.
  62,5 × 10,1 × 3,5 ; un canon de 4 pouces à l'avant (`turret_1`), un pom-pom à l'arrière
  (`turret_2`) ; rails de grenades à la poupe. Camouflage Western Approaches (blanc, vert pâle,
  bleu).
- **États-Unis — destroyer classe Fletcher** : coque à pont continu, deux cheminées. 114,8 × 12,0 ×
  4,0 ; cinq tourelles de 5 pouces (deux à l'avant, trois à l'arrière). Gris marine.
- **URSS — destroyer classe Gnevny (projet 7)** : deux cheminées, mât tripode. 112,8 × 10,2 × 4,1 ;
  quatre pièces de 130 mm en masques (deux à l'avant, deux à l'arrière). Gris-bleu.
- **Allemagne — Zerstörer 1934 (classe Leberecht Maass)** : étrave droite, deux cheminées.
  119,0 × 11,3 × 4,2 ; cinq pièces de 12,7 cm (deux à l'avant, trois à l'arrière). Gris clair, sans
  insigne.
- **Japon — kaibokan (type C)** : petite escorte à une cheminée. 67,5 × 8,4 × 2,9 ; deux pièces de
  120 mm (une à l'avant, une à l'arrière). Gris marine japonais.
- **Italie — destroyer classe Soldati** : une cheminée, deux tourelles doubles. 106,7 × 10,15 ×
  4,35 ; `turret_1` à l'avant, `turret_2` à l'arrière, chacune à deux canons dans un seul `gun_k`.
  Gris clair, bandes de proue rouge et blanche.
- **Chine — croiseur léger Ning Hai** : coque de croiseur, catapulte et hydravion à l'arrière.
  109,7 × 11,9 × 4,0 ; trois tourelles doubles de 140 mm (une à l'avant, deux à l'arrière). Gris
  terne.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de profil, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni eau. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page : un plan d'eau à y = 0 (hors export), les tourelles qui pivotent.
- 1 unité = 1 m ; longueur de la nation ± 5 % ; flottaison à y = 0 ; seule la coque sous y = 0 ;
  étrave vers +z.
- Noms présents à l'identique : `hull`, `turret_*`, `gun_*`, `boat_left`, `boat_right`,
  `fx_muzzle`, `fx_smoke`, `fx_sillage`, les quatre `fx_amarre_*`.
- `vitres` et `feux` présents ; moins de 4 000 triangles.
