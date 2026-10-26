# Camion de transport de troupes — landTransport.glb

Le camion militaire de transport de troupes de chaque nation en 1940 : cabine, plateau à ridelles
et bancs, bâche sur arceaux, hayon arrière. Dans « La Manchette » (stratégie, presse illustrée de
1940), il porte deux pièces d'infanterie, des caisses, et sort de la remise de la caserne ; les
hommes montent par le hayon et disparaissent sous la bâche.

**Nation de cette conversation : ______** — ne lis que son paragraphe dans « Par nation ».
La planche de la nation est jointe : la silhouette, la peinture et les marquages s'y prennent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; l'avant (le capot) vers +z. Origine au sol
(y = 0), au centre de l'emprise (milieu entre les essieux extrêmes, en x = 0). Rien sous y = 0 :
les pneus touchent y = 0. « Left » = côté +x (la gauche du conducteur), « right » = côté −x.

- Longueur, largeur et hauteur : celles du modèle de la nation (« Par nation »), bâche comprise.
- **Plancher du plateau à 1,2 m du sol** (± 0,1 m) : il est de plain-pied avec le quai d'un
  entrepôt.
- Plateau à ridelles de 0,5 m, deux bancs latéraux face à face (assise à 0,45 m au-dessus du
  plancher), place pour six hommes.
- Bâche sur trois ou quatre arceaux, ouverte à l'arrière ; sous elle, le plateau est noir.
- Hayon de toute la largeur du plateau, 0,5 m de haut, avec un marchepied.

## Pièces nommées

Les noms anglais qui existent déjà se gardent ; chaque pièce qui bouge est un nœud à part, son
origine où elle tourne. Aucun autre nom pour une pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `body` | centre du châssis, à la hauteur des essieux | la caisse suspendue (cabine, capot, plateau, ridelles, bancs) : le jeu la fait tasser de 0,1 m sous la charge et tanguer au départ | le véhicule moins ses roues |
| `wheels_left` | — | groupe des roues +x | — |
| `wheels_right` | — | groupe des roues −x | — |
| `roue_left_1`, `roue_left_2` (`_3` pour un 6 × 4 ou 6 × 6) | moyeu de chaque roue | enfants de `wheels_left` ; tournent autour de x, d'avant en arrière | Ø du pneu de la nation |
| `roue_right_1`, `roue_right_2` (`_3`) | moyeu de chaque roue | enfants de `wheels_right` ; tournent autour de x | idem |
| `tailgate` | gond, au milieu de l'arête basse du hayon, au niveau du plancher (0 ; 1,2 ; arrière du plateau) | enfant de `body` ; s'abat vers l'arrière (−z) de 95° (rotation négative autour de x) | largeur du plateau × 0,5 m |
| `tarp` | centre du bas de la bâche | enfant de `body` ; la bâche et ses arceaux, d'un seul tenant, qu'on peut cacher | longueur du plateau × 1,4 m au-dessus des ridelles |
| `fond_sombre` | centre du plan | enfant de `tarp` ; plan noir mat qui ferme l'ouverture arrière de la bâche, 0,3 m en dedans : les hommes qui montent s'y effacent | largeur × hauteur de l'ouverture |

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_smoke` | à la sortie du pot d'échappement | vers l'arrière (−z) |
| `fx_poussiere` | au sol, derrière les roues arrière, au milieu | −z |
| `fx_hayon` | au sol, 1 m derrière le hayon ouvert, au milieu | −z : où l'homme saute à terre, où la file attend pour monter |

Un seul `fx_smoke` dans le fichier.

## Matériaux et texture

- Matériaux nommés par matière (`peinture`, `toile`, `pneu`, `fer`, `bois`…), une seule texture
  atlas de 1 024 px au plus, peinte sur canvas, aucune texture externe ; peinture et marquages
  d'après la planche jointe.
- `vitres` : pare-brise et vitres de cabine. `phares` : les verres des phares. `fond_sombre` : noir
  mat.
- Figurine peinte, contours nets, couleurs d'époque désaturées. Marquages : ceux de la planche,
  sans aucun symbole de régime.
- Lisible de haut à 30° sous la verticale, de 20 à 120 px à l'écran : la cabine, la bâche et les
  roues d'abord.
- **De 1 000 à 1 500 triangles.**

## Ce que le modèle doit permettre

- Le hayon tombe de 95° ; deux files de trois hommes de 2,6 m montent l'une après l'autre et
  s'effacent dans le noir de la bâche ; la caisse tasse de 0,1 m ; le hayon claque ; le moteur
  part par `fx_smoke`. La descente fait l'inverse.
- Le camion recule cul au quai d'un entrepôt (plancher à 1,2 m) et les caisses de 1,2 m sautent à
  bord, bâche cachée (`tarp`) ou non.
- En marche, les roues tournent à la distance parcourue, la poussière monte de `fx_poussiere` ;
  à vide, la caisse roule plus haut sur ses ressorts.
- Il sort de la remise de la caserne (baie de 5 × 4,2 m) ; la nuit, ses phares s'allument.

## Par nation

Couleurs et marquages cités ici sont indicatifs : en cas d’écart, la planche jointe fait foi.

Mesures réelles, hors tout (longueur × largeur × hauteur bâche comprise). « ≈ » : ordre de
grandeur, à prendre sur la planche.

- **France — Laffly S20 TL**, tout-terrain 6 × 6 de transport de troupes : capot long et bas,
  cabine ouverte à pare-brise rabattable, roues de secours latérales entre les essieux, six roues.
  ≈ 5,3 × 1,9 × 2,4 m. Kaki français (vert-brun), bâche toile brun-vert.
- **Royaume-Uni — Bedford QL**, 4 × 4 à cabine avancée au-dessus du moteur, calandre plate,
  plateau à bâche haute. 5,97 × 2,29 × 3,02 m. Vert de service britannique, bâche kaki.
- **États-Unis — GMC CCKW 353**, 6 × 6 « Jimmy », capot long, cabine fermée, plateau long à
  ridelles en bois. 6,86 × 2,24 × 2,8 m. Olive drab, étoile blanche sur le capot et les portes.
- **URSS — ZiS-5**, 4 × 2, capot long, cabine de bois et de tôle, plateau de planches à ridelles
  rabattables. 6,06 × 2,24 × 2,4 m (bâche comprise). Vert 4BO.
- **Allemagne — Opel Blitz 3,6-36S**, 4 × 2, capot arrondi, cabine fermée, plateau à ridelles et
  bâche haute. 6,02 × 2,27 × 2,9 m. Gris panzer, sans insigne.
- **Japon — Isuzu Type 94**, 6 × 4, capot étroit, cabine ouverte ou bâchée, plateau à ridelles
  basses. ≈ 5,4 × 1,9 × 2,4 m (bâche comprise). Kaki japonais vert-brun.
- **Italie — Fiat 626 NM**, 4 × 2 à cabine avancée, calandre haute, plateau à ridelles. ≈ 5,8 ×
  2,2 × 2,7 m. Kaki saharien ou grigio-verde, selon la planche.
- **Chine — camion de la route de Birmanie**, un Chevrolet ou Dodge 1,5 t 4 × 2 à capot long, cabine
  fermée, plateau à bâche. ≈ 6,0 × 2,2 × 2,6 m. Vert-gris terne, bâche délavée.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de profil, de dessus et de trois quarts
  arrière), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page : un curseur qui abat le hayon, un bouton qui cache la bâche, les roues qui
  tournent.
- 1 unité = 1 m ; longueur de la nation ± 5 % ; plancher à 1,2 m ; pneus sur y = 0 ; avant vers +z.
- Noms présents à l'identique : `body`, `wheels_left`, `wheels_right`, `roue_left_*`,
  `roue_right_*`, `tailgate`, `tarp`, `fond_sombre`, `fx_smoke`, `fx_poussiere`, `fx_hayon`.
- Chaque roue tourne sur son moyeu sans osciller ; le hayon tourne sur son arête basse.
- `vitres` et `phares` présents ; de 1 000 à 1 500 triangles.
