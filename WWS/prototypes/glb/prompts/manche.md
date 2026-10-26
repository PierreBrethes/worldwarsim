# Manche à air — manche.glb

Une manche à air d'aérodrome de 1940 : un mât d'acier, un cerceau tournant et une manche de toile à
bandes rouges et blanches, faite de cinq tronçons articulés. Dans « La Manchette » (stratégie,
presse illustrée de 1940), le jeu la pose une fois par aérodrome, au bord de l'aire devant les
hangars ; elle se gonfle et s'oriente au vent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; **la manche, au repos, s'étend vers −z**
depuis le mât (le vent vient de +z). Origine au sol (y = 0), au pied du mât. Rien sous y = 0.

- **Mât** : tube d'acier de Ø 0,12 m, 6 m de haut, sur un petit socle de béton de 0,8 × 0,3 m ;
  un feu rouge d'obstacle en tête.
- **Tête tournante** : un pivot en tête de mât et un bras de 0,5 m qui porte le cerceau.
- **Cerceau** : Ø 0,9 m, vertical, son centre à 0,6 m du mât vers −z et à 5,8 m de haut.
- **Manche** : 3,6 m de long, tronc de cône de Ø 0,9 m (au cerceau) à Ø 0,4 m (au bout), en cinq
  tronçons de 0,72 m alternés rouge et blanc (rouge au cerceau et au bout).

## Pièces nommées

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `mat_manche` | pied du mât (0, 0, 0) | fixe | 6 m |
| `manche` | sur l'axe du mât, en tête (0 ; 6 ; 0) | enfant de `mat_manche` ; tourne autour de y pour faire face au vent | — |
| `manche_cerceau` | centre du cerceau | enfant de `manche` ; fixe par rapport à elle | Ø 0,9 m |
| `manche_troncon_1` | centre de son anneau avant (au cerceau) | enfant de `manche_cerceau` ; s'incline autour de x (pend quand le vent tombe, jusqu'à 60°) et ondule autour de y | 0,72 m |
| `manche_troncon_2` | centre de son anneau avant (= l'anneau arrière du 1) | enfant de `manche_troncon_1` ; même mouvement, accumulé | 0,72 m |
| `manche_troncon_3` | idem | enfant de `manche_troncon_2` | 0,72 m |
| `manche_troncon_4` | idem | enfant de `manche_troncon_3` | 0,72 m |
| `manche_troncon_5` | idem | enfant de `manche_troncon_4` | 0,72 m |

## Repères vides

Aucun.

## Matériaux et texture

- Une seule petite texture atlas (256 à 512 px), peinte sur canvas.
- `acier`, `beton`, `manche_rouge`, `manche_blanc` (toile), `feux` (le feu d'obstacle, allumé la
  nuit).
- Figurine peinte, contours nets ; le rouge reste sourd, désaturé.
- **De 1 000 à 1 200 triangles.**

## Ce que le modèle doit permettre

- Par vent fort, la manche se tend à l'horizontale ; par vent faible, ses tronçons pendent un à un
  vers le bas ; elle tourne avec le vent autour du mât ; elle ondule.
- La nuit, le feu d'obstacle s'allume.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vue de profil, vue de trois quarts) avec un
  curseur « vent » (de pendante à tendue) et un curseur « direction » ; bouton « Exporter en GLB »
  (GLTFExporter, binaire), le seul groupe du modèle : ni lumière, ni caméra, ni sol. Ni meshopt, ni
  quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; mât de 6 m ; manche de 3,6 m ; rien sous y = 0.
- Les tronçons restent jointifs à toutes les inclinaisons.
- Noms présents à l'identique : `mat_manche`, `manche`, `manche_cerceau`, `manche_troncon_1` à
  `manche_troncon_5`.
- `feux` présent ; de 1 000 à 1 200 triangles.
