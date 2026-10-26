# Môle — mole.glb

Un kit de môle portuaire de 1940 en pierre, en deux modules que le jeu assemble : un tronçon de
10 m qui se raccorde sans couture, avec sa bitte, sa défense et son lampadaire, et le musoir rond
qui le termine, avec son feu vert. Dans « La Manchette » (stratégie, presse illustrée de 1940), le
môle part du chantier naval, du côté de la grue ; les navires y accostent et s'y amarrent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; **l'axe du môle suit z, vers le large en
+z**. y = 0 est la surface de la mer. Chaque module a son origine sur l'eau (y = 0), au centre de
sa propre emprise. **Le côté bassin, où accostent les navires, est −x** ; le côté large (+x) est
un enrochement. Seuls les parements descendent sous y = 0, jusqu'à −1 m, pour qu'aucun jour ne
paraisse à la flottaison.

- **Largeur : 20 m** (x de −10 à +10). **Dessus à y = +0,5 m** (le terre-plein du chantier est au
  même niveau).
- **`mole_troncon`** : 10 m de long (z de −5 à +5). Le jeu en aligne seize pour 160 m.
  - Dalle de pierre à joints, liseré de pierre de taille de 0,6 m le long du bord bassin, deux
    rails gravés dans la dalle parallèles à l'axe (à x = −4 et x = −2,5).
  - Parement bassin (x = −10) vertical, pierre de taille ; côté large (x = +10), un talus
    d'enrochements jusqu'à l'eau.
  - Accessoires, chacun un nœud que le jeu montre ou cache selon la place du tronçon (une bitte
    tous les 30 m, une défense tous les 20 m, une lampe tous les 40 m) :
    - **bitte** d'amarrage en fonte, 0,6 m de haut, au bord bassin (x = −9,2 ; z = 0) ;
    - **défense** : un boudin de bois et de corde suspendu au parement bassin (x = −10,1 ;
      z = 0), 0,6 × 2 m ;
    - **lampadaire** : poteau de 6 m sur l'axe (x = 0 ; z = 0), une lanterne en tête.
- **`mole_tete`** (le musoir) : un plateau rond de **Ø 24 m** (plus large que le môle), même dessus
  à +0,5 m, parement de pierre tout autour ; une tourelle de feu de 6 m au centre, un feu vert en
  tête ; une bitte côté bassin. Son origine est au centre du cercle ; il se raccorde au dernier
  tronçon par son bord −z (z = −12).

## Pièces nommées

Le fichier contient deux nœuds racines, un par module, **chacun à l'origine** (translation nulle).
Dans la page, ils peuvent se montrer assemblés, mais l'export les remet à zéro.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `mole_troncon` | centre du module, sur l'eau | fixe ; posé bout à bout le long de z | 20 × 1,5 × 10 m |
| `bitte` | pied de la bitte (−9,2 ; 0,5 ; 0) | enfant de `mole_troncon` ; montrée ou cachée | 0,6 m |
| `defense` | haut de la défense, au bord du parement | enfant de `mole_troncon` ; montrée ou cachée | 0,6 × 2 m |
| `lampadaire` | pied du poteau (0 ; 0,5 ; 0) | enfant de `mole_troncon` ; montré ou caché | 6 m |
| `mole_tete` | centre du musoir, sur l'eau | fixe | Ø 24 m |
| `feu_musoir` | centre du feu, en tête de la tourelle | enfant de `mole_tete` ; fixe ; le jeu l'allume la nuit (vert) | Ø 0,6 m |

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_amarre` | enfant de `bitte`, au sommet de la bitte | −x (vers le bassin) : où arrive l'aussière d'un navire |
| `fx_amarre_tete` | enfant de `mole_tete`, au sommet de sa bitte | −x |

## Matériaux et texture

- Une seule texture atlas de 1 024 px au plus, peinte sur canvas.
- `pierre` : dalle et parements ; **la texture de la dalle se répète exactement tous les 10 m en
  z**, liseré et rails continus d'un tronçon à l'autre.
- `enrochement`, `fonte`, `bois_corde`.
- `feux` : la lanterne des lampadaires et le feu vert du musoir (le jeu les allume la nuit).
- Figurine peinte, contours nets, pierre grise chaude désaturée ; un trait d'encre à la
  flottaison est dessiné par le jeu, pas par le modèle.
- **Moins de 500 triangles pour le tronçon (accessoires compris), 800 pour le musoir, au moins 1 000 pour le fichier.**

## Ce que le modèle doit permettre

- Le jeu assemble 160 m de môle (seize tronçons et le musoir), parallèle à la cale du chantier,
  le côté bassin vers elle.
- Un cargo de 130 m vient de travers le long du parement bassin, touche les défenses, s'amarre :
  le jeu tend ses aussières jusqu'aux `fx_amarre` des bittes.
- La nuit, une lampe tous les 40 m et le feu vert du musoir s'allument ; le feu se reflète sur
  l'eau.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vue de dessus, vue de trois quarts haute)
  montrant les deux modules seuls et le môle assemblé de 160 m sur un plan d'eau ; bouton
  « Exporter en GLB » (GLTFExporter, binaire) qui n'exporte que les deux modules, chacun à
  l'origine : ni lumière, ni caméra, ni eau, ni l'assemblage. Ni meshopt, ni quantification.
  Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; 20 m de large ; tronçon de 10 m ; musoir de Ø 24 m ; dessus à +0,5 m ; rien
  sous −1 m.
- Côté bassin en −x ; assemblage sans couture.
- Noms présents à l'identique : `mole_troncon`, `bitte`, `defense`, `lampadaire`, `mole_tete`,
  `feu_musoir`, `fx_amarre`, `fx_amarre_tete`.
- `feux` présent ; budgets de triangles tenus.
