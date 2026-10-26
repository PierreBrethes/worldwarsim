# Porte-avions — carrier.glb

Le porte-avions de chaque nation en 1940, sculpté comme une figurine de wargame peinte, avec son
pont d'envol, son îlot et ses ascenseurs. Dans « La Manchette » (stratégie, presse illustrée de
1940), il porte des troupes de terre, accoste au môle (il le dépasse), et au rapproché un chasseur
de décor remonte par son ascenseur et décolle de son pont.

**Nation de cette conversation : ______** — ne lis que son paragraphe dans « Par nation ».
La planche de la nation est jointe : silhouette et peinture s'y prennent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel (le jeu réduit lui-même les navires de moitié ; ne pas le faire
ici). y vers le haut ; l'étrave vers +z. **Origine sur la ligne de flottaison (y = 0), au milieu
de la coque.** La coque descend sous y = 0 jusqu'à son tirant d'eau : seule géométrie sous y = 0.
« Bâbord » = +x, « tribord » = −x.

- Longueur hors tout, largeur de coque, tirant d'eau, hauteur du pont d'envol : ceux de la nation.
- Pont d'envol en bois clair à ligne d'axe peinte ; brins d'arrêt peints à l'arrière.
- Ascenseurs : plates-formes carrées de 13 à 15 m dans le pont, un puits noir dessous.

## Pièces nommées

Les noms existants se gardent (`hull`, `ascenseur`). Chaque pièce qui bouge est un nœud à part, son
origine où elle bouge. Aucun autre nom pour une pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `hull` | origine du modèle | coque, hangar, pont d'envol, îlot ; parent des autres | — |
| `ascenseur` | **centre du dessus de la plate-forme**, au ras du pont (l'ascenseur avant, ou le seul) | enfant de `hull` ; translation verticale vers −y de 6 m (jusqu'au pont hangar) | 13 à 15 m de côté |
| `fond_sombre` | centre du puits, 6,5 m sous le pont | plan noir mat au fond du puits de l'ascenseur | taille de la plate-forme |
| `boat_left`, `boat_right` | centre de la quille de chaque canot | enfants de `hull`, détachables | 8 m |

Les autres ascenseurs, s'il y en a, sont dessinés fixes dans le pont.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_smoke` | au sommet de la cheminée de l'îlot | +y |
| `fx_sillage` | à la poupe, sur la flottaison | −z |
| `fx_pont` | sur le pont d'envol, sur l'axe, 30 m devant la poupe | +z : d'où un avion de décor commence sa course |
| `fx_amarre_avant_babord`, `fx_amarre_avant_tribord`, `fx_amarre_arriere_babord`, `fx_amarre_arriere_tribord` | aux bittes avant et arrière, sur le pont de coque | vers l'extérieur du bord |

Un seul `fx_smoke` ; une pièce de défense, s'il y en a, porte le seul `fx_muzzle`.

## Matériaux et texture

- Matériaux nommés par matière, une seule texture atlas de 1 024 px au plus, peinte sur canvas,
  d'après la planche ; **sans symbole de régime** (ni sur l'îlot, ni sur le pont).
- `vitres` : hublots et passerelle. `feux` : rouge à bâbord (+x), vert à tribord (−x), blanc au mât.
- Figurine peinte, contours nets, couleurs d'époque désaturées.
- **Plafond 4 000 triangles ; vise 1 500.**

## Ce que le modèle doit permettre

- Il accoste au môle (il le dépasse de 90 m), s'amarre par ses quatre `fx_amarre_*`, appareille en
  culant, sillage à `fx_sillage`.
- Au rapproché, l'ascenseur descend, remonte avec un chasseur, qui court depuis `fx_pont` et
  décolle.
- Touché, il gîte et s'enfonce ; la nuit, hublots et feux allumés.

## Par nation

Couleurs et marquages cités ici sont indicatifs : en cas d’écart, la planche jointe fait foi.

Longueur × largeur de coque × tirant d'eau (m) ; pont d'envol ; îlot.

- **France — Béarn** : coque de cuirassé convertie, pont d'envol à 17 m au-dessus de l'eau, îlot et
  cheminée à tribord. 182,6 × 27,1 × 9,3 ; trois ascenseurs. Gris clair.
- **Royaume-Uni — HMS Illustrious** : pont blindé, îlot à tribord. 229,7 × 29,2 × 8,7 ; deux
  ascenseurs. Gris, camouflage de la planche.
- **États-Unis — USS Essex** : long pont d'envol, îlot à tribord avec tourelles de 5 pouces.
  250 × 28,3 × 8,7 ; trois ascenseurs dont un en bordure bâbord. Bleu marine mesure 21.
- **URSS — porte-avions du projet 71** (jamais construit) : coque de croiseur, pont d'envol court,
  petit îlot à tribord. ≈ 195 × 23 × 6,5 ; un ascenseur. Gris-bleu.
- **Allemagne — Graf Zeppelin** : coque haute, îlot à tribord, étrave droite. 262,5 × 31,5 × 8,5 ;
  trois ascenseurs. Gris clair, sans insigne.
- **Japon — Akagi** : îlot **à bâbord**, cheminée qui s'incurve vers le bas à tribord. 260,7 ×
  31,3 × 8,7 ; trois ascenseurs. Gris marine japonais, pont de bois.
- **Italie — Aquila** : coque de paquebot élancée, îlot à tribord avec une grande cheminée.
  231,5 × 29,4 × 7,3 ; deux ascenseurs. Gris clair.
- **Chine — cargo converti** (invention) : pont d'envol plat posé sur une coque marchande, îlot
  minuscule à tribord, hangars ouverts sous le pont. ≈ 150 × 20 × 7,5 ; un ascenseur. Gris terne,
  coque rouillée.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de profil, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni eau. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page : un plan d'eau à y = 0 (hors export), un curseur qui descend l'ascenseur.
- 1 unité = 1 m ; longueur de la nation ± 5 % ; flottaison à y = 0 ; seule la coque sous y = 0 ;
  étrave vers +z.
- Noms présents à l'identique : `hull`, `ascenseur`, `fond_sombre`, `boat_left`, `boat_right`,
  `fx_smoke`, `fx_sillage`, `fx_pont`, les quatre `fx_amarre_*`.
- `vitres` et `feux` présents ; moins de 4 000 triangles.
