# Traces de combat — traces.glb

Un kit de deux restes de combat que le jeu pose sur la carte, là où un combat du joueur a détruit
un engin : la **carcasse** brûlée d'un blindé sur terre, l'**épave** d'un navire coulé en mer.
Dans « La Manchette » (stratégie, presse illustrée de 1940), ces restes ne bougent pas : ils
restent posés au point du combat, pâlissent en un jour puis s'effacent. Le jeu les pose à côté des
cratères qu'il dessine lui-même à l'encre (#642) ; ils ne disent jamais **ni la nation ni le
modèle** de ce qui a été détruit.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; l'avant vers +z ; « gauche » = +x. Chaque
module a son origine **au sol** (la carcasse) ou **à la flottaison** (l'épave), au centre de sa
propre emprise, et sa translation est nulle.

**L'échelle.** Le jeu montre toutes les pièces à leur taille réelle, multipliée d'une seule
exagération (ADR 0035) ; la mer est à demi-échelle (un cargo de 130 m y fait 65 m). Ne rien
grossir : c'est la silhouette qui se lit, pas la taille.

- **`carcasse`** : un blindé de 1940 quelconque, détruit et brûlé, **6 m de long, 3 m de large**,
  2 m de haut au plus. Caisse posée de travers (penchée de 8° sur la gauche), **tourelle arrachée
  et couchée au sol** à 2 m de la caisse, côté +x, son canon tordu vers le bas. Une chenille
  déroulée qui traîne derrière. **Emprise totale** (caisse, tourelle, chenille) : **4,5 m de large
  (x de −1,5 à +3) sur 7 m de long (z de −4 à +3)**. Aucun insigne, aucune forme qui
  désigne un char réel : une caisse à pans, des galets, une tourelle ronde générique.
  Origine au sol, au centre de la caisse. Rien sous y = 0.
- **`epave`** : l'avant d'un navire de commerce qui sort de l'eau, **à la demi-échelle de la mer**.
  Une étrave dressée à 25° au-dessus de la flottaison, 14 m de large, qui dépasse de 9 m au plus
  haut ; derrière, à 18 m, **un mât brisé** de 10 m penché à 30° vers −x, ses haubans pendants ;
  entre les deux, le bord d'un pont qui affleure et une écoutille ouverte. **40 m en tout le long
  de z** (z de −20 à +20), 14 m de large. Origine à la flottaison (y = 0) au centre de
  l'emprise ; la coque descend sous l'eau jusqu'à y = −3 pour qu'aucun jour ne paraisse à la
  flottaison. Pas de nom peint, pas de numéro, pas de pavillon, pas de cheminée aux couleurs d'une
  compagnie.

## Pièces nommées

Le fichier contient deux nœuds racines, un par module, chacun à l'origine (translation nulle).
Dans la page, ils peuvent se montrer côte à côte, mais l'export les remet à zéro.

| Nœud | Origine (pivot) | Mouvement | Taille | Triangles |
|---|---|---|---|---|
| `carcasse` | au sol, centre de la caisse | fixe | emprise 4,5 × 7 m, 2 m de haut au plus | 400 au plus |
| `epave` | à la flottaison, centre de l'emprise | fixe | 14 × 40 m, 9 m hors de l'eau, −3 m dessous | 600 au plus |

## Repères vides

| Repère | Parent | Position | Orientation |
|---|---|---|---|
| `fx_fumee` | `carcasse` | dans la caisse, à l'ouverture de la tourelle arrachée | +y |
| `fx_remous` | `epave` | à la flottaison, au pied de l'étrave | +y |

Le jeu ne s'en sert pas encore (rien n'est animé) ; ils marquent où une fumée ou un remous
viendront peut-être.

## Matériaux et texture

- Matériaux nommés par matière (`acier_brule`, `rouille`, `coque`, `bois`), une seule texture
  atlas de 256 px au plus, peinte sur canvas, en WebP si possible.
- Figurine peinte, contours nets, couleurs désaturées : acier brûlé noir-brun (#2b2420), rouille
  (#7a4a2a), suie en dégradé vers le bas de la caisse ; coque gris neutre (#5e605c), rouillée à la
  flottaison, bois du pont (#8a6e4a). **Aucune couleur de nation**, aucune lumière (`feux`
  absent : une épave ne s'allume pas).

## Ce que le modèle doit permettre

- De haut à 45°, à 40 px de large, on lit « un char détruit » et « un navire coulé », sans pouvoir
  dire lequel.
- Posée sur la feuille à côté de cratères à l'encre, la carcasse reste une figurine sombre et
  basse, sous les pièces vivantes du jeu : elle ne doit pas passer pour une pièce à commander.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de dessus, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), ni lumière, ni caméra, ni sol, ni
  eau. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- 1 unité = 1 m ; `carcasse` 4,5 × 7 m d'emprise, rien sous y = 0 ; `epave` 14 × 40 m, rien sous y = −3.
- Tous les noms présents à l'identique, chacun sur un seul nœud : `carcasse`, `epave`,
  `fx_fumee`, `fx_remous`. Deux racines à l'origine.
- Le compte de triangles de chaque module affiché dans la page : 400 et 600 au plus.
