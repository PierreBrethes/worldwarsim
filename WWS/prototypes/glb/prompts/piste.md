# Piste d'aérodrome — piste.glb

Un kit de piste en terre battue de 1940, en trois modules que le jeu assemble bout à bout : un
bout, un seuil à barres blanches et un tronçon de 10 m qui se raccorde sans couture. Dans « La
Manchette » (stratégie, presse illustrée de 1940), la piste se pose devant les deux hangars d'un
aérodrome, parallèle à leurs façades ; les avions y courent, décollent et atterrissent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; **l'axe de la piste suit z**. Chaque module
a son origine au sol (y = 0), au centre de sa propre emprise. Rien sous y = 0. « Gauche » = +x.

- **Largeur : 30 m** (x de −15 à +15) pour tous les modules.
- **Épaisseur** : une galette de 0,1 m (dessus à y = 0,1), bords biseautés sur 0,3 m, pour ne
  jamais se confondre avec le sol de la carte.
- **`piste_troncon`** : 10 m de long (z de −5 à +5). Le jeu en aligne quatorze.
- **`piste_seuil`** : 10 m de long ; cinq barres blanches de seuil, parallèles à l'axe, de 2 m de
  large et 8 m de long, réparties sur la largeur (centres à x = 0, ±5,5, ±11).
- **`piste_bout`** : 5 m de long (z de −2,5 à +2,5) ; le côté −z se raccorde, le côté +z ferme la
  piste d'un contour d'encre à angles arrondis (rayon 3 m).
- Assemblage complet : bout, seuil, quatorze tronçons, seuil, bout = **170 m**. Le jeu retourne
  de 180° le seuil et le bout de l'autre extrémité.
- Sur chaque tronçon et chaque seuil, de chaque côté, à 0,5 m du bord : une borne blanche
  (cône tronqué de 0,4 m de haut) et un feu de bord (globe de 0,25 m sur un pied de 0,3 m), au
  milieu du module (z = 0).

## Pièces nommées

Le fichier contient trois nœuds racines, un par module, **chacun à l'origine** (translation
nulle) : le jeu clone chaque module par son nom. Dans la page, ils peuvent se montrer côte à côte
et assemblés, mais l'export les remet à zéro.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `piste_troncon` | centre du module au sol | fixe ; posé bout à bout le long de z | 30 × 0,1 × 10 m |
| `piste_seuil` | centre du module au sol | fixe | 30 × 0,1 × 10 m |
| `piste_bout` | centre du module au sol | fixe ; le côté −z se raccorde | 30 × 0,1 × 5 m |
| `balise_gauche`, `balise_droite` | pied de chaque borne (x = ±14,5 ; z = 0) | enfants de `piste_troncon` et de `piste_seuil` ; fixes | 0,4 m |
| `feu_gauche`, `feu_droit` | pied de chaque feu (x = ±14,5 ; z = 0) | enfants de `piste_troncon` et de `piste_seuil` ; le jeu les allume un par un, de proche en proche depuis le hangar | 0,55 m |

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_seuil` | enfant de `piste_seuil`, au sol au milieu de son bord −z, sur l'axe (0 ; 0,1 ; −5) | +z, vers l'intérieur de la piste : là où commence la course et où l'avion touche |

## Matériaux et texture

- Une seule texture atlas de 1 024 px au plus, peinte sur canvas.
- `terre` : terre battue, un aplat chaud couleur de papier, un grain, des traînées d'usure dans
  l'axe ; **la texture se répète exactement tous les 10 m en z** (v de 0 à 1 sur un tronçon) pour
  que les tronçons se raccordent sans couture visible ; le liseré d'encre des deux bords longs
  est continu d'un module à l'autre. Pas de ligne d'axe : c'est une piste en herbe et en terre,
  pas une piste en dur.
- `peinture_blanche` : barres de seuil et bornes.
- `feux` : les globes des feux de bord (le jeu les allume la nuit, pendant un mouvement).
- Désaturé, pâle : la piste est toujours dessinée et ne doit pas crier.
- **Moins de 500 triangles par module, au moins 1 000 pour le fichier.**

## Ce que le modèle doit permettre

- Le jeu assemble 170 m de piste devant deux hangars, parallèle à leurs façades, sans couture.
- Un chasseur part de `fx_seuil`, court queue basse puis queue haute, et quitte le sol avant
  l'autre seuil ; un bombardier ou un transport aussi, plus lentement.
- La nuit, pendant un mouvement, les feux de bord s'allument de proche en proche depuis le hangar,
  puis s'éteignent.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vue de dessus, vue rasante) montrant les trois
  modules seuls et la piste assemblée de 170 m ; bouton « Exporter en GLB » (GLTFExporter,
  binaire) qui n'exporte que les trois modules, chacun à l'origine : ni lumière, ni caméra, ni sol,
  ni l'assemblage. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 30 m de large ; tronçon et seuil de 10 m, bout de 5 m ; dessus à y = 0,1.
- Assemblage sans couture visible de texture ni de liseré.
- Noms présents à l'identique : `piste_troncon`, `piste_seuil`, `piste_bout`, `balise_gauche`,
  `balise_droite`, `feu_gauche`, `feu_droit`, `fx_seuil`.
- `feux` présent ; moins de 500 triangles par module, au moins 1 000 pour le fichier.
