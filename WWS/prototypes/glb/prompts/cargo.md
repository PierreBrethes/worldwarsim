# Cargo — cargo.glb

Le navire de charge de chaque nation en 1940, sculpté comme une figurine de wargame peinte, avec
ses cales, ses mâts de charge et ses canots. Dans « La Manchette » (stratégie, presse illustrée de
1940), il est lancé de la cale du port, accoste au môle, embarque troupes et caisses par ses mâts
de charge, et met ses canots à l'eau pour un débarquement.

**Nation de cette conversation : ______** — ne lis que son paragraphe dans « Par nation ».
La planche de la nation est jointe : silhouette et peinture s'y prennent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel (le jeu réduit lui-même les navires de moitié ; ne pas le faire
ici). y vers le haut ; l'étrave vers +z. **Origine sur la ligne de flottaison (y = 0), au milieu
de la coque.** La coque descend sous y = 0 jusqu'à son tirant d'eau : seule géométrie sous y = 0.
« Bâbord » = +x, « tribord » = −x.

- Longueur hors tout, largeur et tirant d'eau : ceux de la nation.
- Bande de flottaison peinte de 1 m au-dessus de y = 0 (le jeu le fait flotter plus haut à vide).
- Cales ouvertes par des panneaux, mâts de charge à flèches, bittes à l'avant et à l'arrière des
  deux bords.

## Pièces nommées

Les noms existants se gardent (`hull`, `mat_charge_*`). Chaque pièce qui bouge est un nœud à part,
son origine où elle tourne. Aucun autre nom pour une pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `hull` | origine du modèle | coque, château, cheminée, mâts ; parent des autres | — |
| `mat_charge_1` … `mat_charge_N` | **pied de chaque flèche de charge**, sur son mât (numérotées de l'avant) | enfants de `hull` ; pivotent autour de y (±100°) pour passer de la cale au quai, et se relèvent autour de leur axe horizontal (20° à 70°) | flèche de 12 à 15 m |
| `hold_hatch_1` … `hold_hatch_N` | **gond sur l'arête bâbord** de chaque panneau de cale | enfants de `hull` ; s'ouvrent de 120° vers bâbord autour d'un axe le long de z | panneau de la taille de l'écoutille |
| `fond_sombre_1` … `fond_sombre_N` | centre de chaque écoutille | plans noirs mats 0,3 m sous chaque panneau : ce qui descend en cale s'y efface | taille de l'écoutille |
| `boat_left`, `boat_right` | centre de la quille de chaque canot, sous ses bossoirs | enfants de `hull`, détachables : le jeu les met à l'eau | 7 à 8 m |

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_charge_1` … `fx_charge_N` | en tête de chaque flèche de charge (enfant de `mat_charge_k`) | −y : d'où pend l'élingue |
| `fx_smoke` | au sommet de la cheminée | +y |
| `fx_sillage` | à la poupe, sur la flottaison, au milieu | −z |
| `fx_amarre_avant_babord`, `fx_amarre_avant_tribord`, `fx_amarre_arriere_babord`, `fx_amarre_arriere_tribord` | sur le pont, aux bittes | vers l'extérieur du bord |
| `fx_passerelle` | sur le pont, au milieu du bord bâbord, au pied du château | +x : où se pose la passerelle d'embarquement |

Un seul `fx_smoke`. Le canon de poupe, s'il y en a un, porte le seul `fx_muzzle`.

## Matériaux et texture

- Matériaux nommés par matière, une seule texture atlas de 1 024 px au plus, peinte sur canvas,
  d'après la planche ; **sans symbole de régime**.
- `vitres` : hublots et timonerie. `feux` : rouge à bâbord (+x), vert à tribord (−x), blanc en tête
  de mât.
- Figurine peinte, contours nets, couleurs d'époque désaturées.
- **Plafond 4 000 triangles ; vise 1 500.**

## Ce que le modèle doit permettre

- Il accoste au môle, l'étrave à terre, s'amarre par ses quatre `fx_amarre_*`.
- Un panneau de cale s'ouvre ; un mât de charge pivote vers le quai, élingue un char ou une caisse
  depuis `fx_charge_k`, pivote au-dessus de la cale et la descend dans le noir.
- L'infanterie monte par la passerelle posée à `fx_passerelle` et disparaît sous le château.
- Un canot se met à l'eau et mène quatre hommes à la plage.
- Il appareille en culant, sillage à `fx_sillage` ; touché, il gîte et s'enfonce ; la nuit,
  hublots et feux allumés.

## Par nation

Couleurs et marquages cités ici sont indicatifs : en cas d’écart, la planche jointe fait foi.

Longueur × largeur × tirant d'eau (m) ; cales et mâts.

- **France — cargo des Messageries maritimes** : coque noire, château blanc au milieu, cheminée
  chamois à manchette noire, mâts de charge avant et arrière. ≈ 130 × 17 × 7,5 ; quatre cales,
  quatre flèches.
- **Royaume-Uni — cargo marchand (« tramp »)** : coque noire, château central, cheminée haute.
  ≈ 128 × 17 × 7,6 ; quatre cales, quatre flèches. Gris de guerre.
- **États-Unis — Liberty ship** : château au milieu, trois mâts à flèches. 134,6 × 17,3 × 8,5 ;
  cinq cales, cinq flèches. Gris marine, canon de poupe.
- **URSS — cargo soviétique** : coque noire, château central, cheminée à bande rouge. ≈ 120 × 16 ×
  7 ; quatre cales, quatre flèches.
- **Allemagne — Frachter** : étrave droite, château central, cheminée large. ≈ 130 × 18 × 8 ;
  quatre cales, quatre flèches. Gris, sans insigne.
- **Japon — maru** : château central, mâts à flèches, cheminée haute. ≈ 130 × 18 × 8 ; quatre
  cales, quatre flèches.
- **Italie — cargo marchand** : château central, coque grise. ≈ 125 × 17 × 7,5 ; quatre cales,
  quatre flèches.
- **Chine — jonque de haute mer** : coque de bois à poupe haute, trois mâts à voiles lattées, une
  cale sous un rouf. ≈ 55 × 10 × 3,5 ; une cale
  (`hold_hatch_1`), une flèche sur le grand mât (`mat_charge_1`), un sampan (`boat_left` seul,
  pas de `boat_right`) ; pas de cheminée : `fx_smoke` sur le rouf (le fourneau).

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de profil, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni eau. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page : un plan d'eau à y = 0 (hors export), un panneau qui s'ouvre, une flèche qui pivote.
- 1 unité = 1 m ; longueur de la nation ± 5 % ; flottaison à y = 0 ; seule la coque sous y = 0 ;
  étrave vers +z.
- Noms présents à l'identique : `hull`, `mat_charge_*`, `hold_hatch_*`, `fond_sombre_*`,
  `boat_left` (et `boat_right` hors jonque), `fx_charge_*`, `fx_smoke`, `fx_sillage`, les quatre
  `fx_amarre_*`, `fx_passerelle`.
- `vitres` et `feux` présents ; moins de 4 000 triangles.
