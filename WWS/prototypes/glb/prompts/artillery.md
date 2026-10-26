# Pièce d'artillerie — artillery.glb

Le canon ou l'obusier de campagne de chaque nation en 1940, sur son affût à roues, sculpté comme
une figurine de wargame peinte. Dans « La Manchette » (stratégie, presse illustrée de 1940), il
sort de la remise de la caserne tube en avant, se met en batterie flèches ouvertes, lève son tube,
tire et recule.

**Nation de cette conversation : ______** — ne lis que son paragraphe dans « Par nation ».
La planche de la nation est jointe : silhouette et peinture s'y prennent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; **la bouche du tube vers +z** (les flèches
vers −z). Origine au sol (y = 0), sous le milieu de l'essieu. Rien sous y = 0 : les roues et le
bout des flèches touchent y = 0. « Left » = côté +x (la gauche du pointeur qui regarde vers la
bouche), « right » = −x.

- **Pose de sculpture : en route, flèches fermées**, tube à l'horizontale. Les longueurs de
  « Par nation » sont prises ainsi, de la bouche au bout des flèches.
- Le jeu ouvre lui-même les flèches pour la mise en batterie.

## Pièces nommées

Les noms anglais existants se gardent. Chaque pièce qui bouge est un nœud à part, son origine où
elle tourne. Aucun autre nom pour une pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `carriage` | milieu de l'essieu | l'affût, l'essieu, le berceau fixe ; parent des autres | — |
| `barrel` | **aux tourillons** | enfant de `carriage` ; tube, culasse, berceau, frein ; hausse autour de x (0° à +45°) ; recul le long de son axe (−z local), 0,6 à 1,1 m selon la pièce | tube jusqu'à la bouche |
| `shield` | — | enfant de `carriage` ; le bouclier, fixe sur l'affût | — |
| `wheels_left`, `wheels_right` | **moyeu de chaque roue** | enfants de `carriage` ; tournent autour de x | Ø de la roue |
| `trail_left`, `trail_right` | **charnière de chaque flèche** sur l'affût | enfants de `carriage` ; s'ouvrent autour de y (left vers +x, right vers −x), de l'angle dit pour la nation. Une pièce à flèche unique ou en caisson garde deux pièces : ses deux longerons, qui ne s'ouvrent pas (angle 0°) | longueur de flèche |
| `platform` | centre de la plate-forme de tir (Royaume-Uni seulement) | enfant de `carriage`, accrochée sous les flèches ; le jeu la pose sous les roues à la mise en batterie | Ø 2,4 m |

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_muzzle` | enfant de `barrel`, à la bouche | le long du tube, vers l'avant |
| `fx_smoke` | enfant de `barrel`, à la culasse | vers l'arrière |
| `fx_poussiere` | au sol, sous la bêche des flèches | +y |

Un seul `fx_muzzle` et un seul `fx_smoke`.

## Matériaux et texture

- Matériaux nommés par matière (`peinture`, `acier`, `bois_roue`, `pneu`…), une seule texture
  atlas de 1 024 px au plus, peinte sur canvas, d'après la planche ; **sans symbole de régime**.
- Figurine peinte, contours nets, couleurs d'époque désaturées.
- Lisible de haut à 30° sous la verticale, de 20 à 100 px : le tube et les roues d'abord.
- **Plafond 3 000 triangles ; vise 1 000 à 1 200.**

## Ce que le modèle doit permettre

- Il sort seul de la remise de la caserne (baie de 5 × 4,2 m), tube en avant, roues qui tournent.
- En batterie : les flèches s'ouvrent, la bêche s'enfonce (poussière), le tube se lève, part
  (éclair à `fx_muzzle`, fumée à `fx_smoke`) et recule le long de son axe, puis revient.

## Par nation

Couleurs et marquages cités ici sont indicatifs : en cas d’écart, la planche jointe fait foi.

Longueur en route (bouche → bout des flèches) × largeur × hauteur, en mètres réels ; ouverture des
flèches en batterie.

- **France — canon de 75 mle 1897** : tube long et fin, grandes roues à rayons de bois cerclées
  d'acier (Ø 1,35 m), bouclier droit, flèche unique (0°). 4,5 × 1,72 × 1,54. Kaki français.
- **Royaume-Uni — QF 25 livres** : tube court et épais à frein de bouche, bouclier à pans coupés,
  roues pleines à pneus, flèche en caisson (0°), plate-forme de tir ronde accrochée sous la
  flèche (`platform`). ≈ 4,6 × 2,1 × 1,6. Vert de service.
- **États-Unis — obusier M2A1 de 105 mm** : tube moyen et lisse, petit bouclier, roues à pneus
  jumelées, longues flèches ouvrantes (±25°). 5,94 × 2,16 × 1,57. Olive drab.
- **URSS — canon divisionnaire de 76 mm modèle 1939 (USV)** : tube long, bouclier bas à bord
  coudé, roues à pneus, flèches ouvrantes (±28°). ≈ 7,0 × 1,9 × 1,7. Vert 4BO.
- **Allemagne — obusier leFH 18 de 105 mm** : tube moyen, bouclier haut à bord droit, roues
  d'acier à bandage plein, flèches ouvrantes (±28°). ≈ 6,1 × 2,0 × 1,9. Gris panzer.
- **Japon — canon de 75 mm Type 90** : tube long à frein de bouche, roues à rayons, bouclier,
  flèches ouvrantes (±25°). ≈ 5,7 × 1,8 × 1,6. Kaki japonais vert-brun.
- **Italie — Cannone da 75/27 modello 1911** : tube court, roues à rayons de bois, bouclier plat,
  flèches ouvrantes (±25°). ≈ 5,4 × 1,7 × 1,5. Grigio-verde.
- **Chine — canon de montagne Bofors de 75 mm** : pièce légère et basse, roues à rayons, petit
  bouclier, flèche unique (0°). ≈ 4,2 × 1,4 × 1,3. Vert-gris terne.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de profil, de dessus et de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page : un curseur « mise en batterie » (flèches qui s'ouvrent, tube qui se lève) et un
  bouton « tir » (recul le long du tube).
- 1 unité = 1 m ; longueur de la nation ± 8 % ; roues et flèches sur y = 0 ; bouche vers +z.
- Noms présents à l'identique : `carriage`, `barrel`, `shield`, `wheels_left`, `wheels_right`,
  `trail_left`, `trail_right` (et `platform` pour le Royaume-Uni), `fx_muzzle`, `fx_smoke`,
  `fx_poussiere`.
- Moins de 3 000 triangles.
