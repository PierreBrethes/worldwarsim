# Char moyen ou lourd — armor-2.glb

Le char moyen ou lourd de chaque nation en 1940 (deuxième marque des blindés), sculpté comme une
figurine de wargame peinte. Dans « La Manchette » (stratégie, presse illustrée de 1940), il sort de
la remise de la caserne, roule chenilles tournantes, pivote sa tourelle, tire, et au repos son chef
ouvre l'écoutille.

**Nation de cette conversation : ______** — ne lis que son paragraphe dans « Par nation ».
La planche de la nation est jointe : silhouette, camouflage et marquages s'y prennent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; l'avant vers +z. Origine au sol (y = 0), au
centre de l'emprise (milieu des chenilles). Rien sous y = 0 : le bas des chenilles touche y = 0.
« Left » = côté +x (la gauche du pilote), « right » = −x.

- **Longueur de caisse, largeur, hauteur** : celles du char de la nation (« Par nation »), canon
  non compté dans la longueur. Le jeu mesure le char sur sa longueur réelle.
- Il passe la baie de la remise (5 × 4,2 m) avec au moins 0,5 m de jeu de chaque côté et au-dessus.
- Chenilles d'un seul tenant par côté, garde-boue ou jupes au-dessus.

## Pièces nommées

Les noms anglais existants se gardent. Chaque pièce qui bouge est un nœud à part, son origine où
elle tourne. Aucun autre nom pour une pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `hull` | centre de la caisse au niveau des moyeux de galets | la caisse suspendue : tangue au départ et à l'arrêt | caisse sans chenilles |
| `turret` | **centre de la couronne de tourelle** | enfant de `hull` ; tourne autour de y, 360° | — |
| `gun` | **aux tourillons** du canon de tourelle | enfant de `turret` ; hausse autour de x (−8° à +20°) ; recul le long de son axe (−z local), 0,2 à 0,4 m | tube jusqu'à la bouche |
| `gun_hull` | aux tourillons du canon de caisse (B1 bis seulement) | enfant de `hull` ; hausse autour de x ; recul le long de son axe | — |
| `hatch` | gond de l'écoutille du chef, sur la tourelle ou la coupole | enfant de `turret` ; s'ouvre de 110° autour de son arête | — |
| `tracks_left`, `tracks_right` | centre de chaque chenille | d'un seul tenant, **UV déroulées dans la longueur** (motif de patins répété) : le jeu fait défiler la texture | longueur de chenille |
| `wheels_left`, `wheels_right` | — | groupes des roues de chaque côté | — |
| `barbotin_left`, `barbotin_right` | moyeu du barbotin | enfants de `wheels_*` ; tournent autour de x | — |
| `roue_folle_left`, `roue_folle_right` | moyeu de la roue de tension | enfants de `wheels_*` ; tournent autour de x | — |
| `galet_left_1`… `galet_left_N`, `galet_right_1`… | moyeu de chaque galet visible | enfants de `wheels_*` ; tournent autour de x. Les galets cachés par des jupes ou des bogies se fusionnent en `galets_left` / `galets_right` (fixes) | Ø du galet |

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_muzzle` | enfant de `gun`, à la bouche du canon de tourelle | le long du tube, vers l'avant |
| `fx_smoke` | à la sortie de l'échappement | vers l'arrière ou le haut |
| `fx_poussiere` | au sol, derrière les chenilles, au milieu | −z |

Un seul `fx_muzzle` (celui du canon de tourelle) et un seul `fx_smoke`.

## Matériaux et texture

- Matériaux nommés par matière (`peinture`, `chenille`, `acier`…), une seule texture atlas de
  1 024 px au plus, peinte sur canvas ; camouflage et marquages d'après la planche, **sans
  symbole de régime** (ni croix gammée, ni faisceau ; cocardes et croix d'arme se gardent).
- `phares` : les verres des phares.
- Figurine peinte, contours nets, couleurs d'époque désaturées.
- Lisible de haut à 30° sous la verticale, de 20 à 150 px : tourelle et canon d'abord.
- **Moins de 1 200 triangles.**

## Ce que le modèle doit permettre

- Il sort de la remise de la caserne tout droit, vire et va au rang : chenilles qui défilent,
  roues qui tournent à la distance, poussière par `fx_poussiere`.
- Au combat, la tourelle pivote, le tube se lève, tire (éclair à `fx_muzzle`) et recule.
- Au repos, l'écoutille du chef s'ouvre.
- La nuit, ses phares s'allument ; usé, il fume par `fx_smoke`.

## Par nation

Couleurs et marquages cités ici sont indicatifs : en cas d’écart, la planche jointe fait foi.

Longueur de caisse × largeur × hauteur, en mètres réels.

- **France — Char B1 bis** : longue caisse haute à chenilles enveloppantes et blindages latéraux,
  canon de 75 mm dans la caisse à l'avant droit (`gun_hull`), tourelle APX4 à canon de 47 mm
  (`gun`), grille de prise d'air latérale. 6,37 × 2,46 × 2,79. Vert armée à taches brunes et
  beiges.
- **Royaume-Uni — Matilda II** : caisse moulée massive, jupes latérales à boue (galets fusionnés),
  tourelle moulée à canon de 2 livres. 5,61 × 2,59 × 2,52. Camouflage Caunter ou vert de service,
  selon la planche.
- **États-Unis — M4 Sherman** : caisse haute à glacis, tourelle moulée à canon de 75 mm, trois
  bogies VVSS par côté. 5,84 × 2,62 × 2,74. Olive drab, étoile blanche.
- **URSS — T-34 (1941)** : caisse basse à plans inclinés, cinq grands galets par côté, tourelle
  à canon de 76,2 mm. 6,68 × 3,00 × 2,45. Vert 4BO, marques de la planche.
- **Allemagne — Panzer IV** : caisse à superstructure, tourelle à coupole arrière et canon court
  de 75 mm, huit galets par paires, rouleaux de retour. 5,92 × 2,88 × 2,68. Gris panzer, croix
  d'arme blanche bordée de noir.
- **Japon — Type 97 Chi-Ha** : caisse rivetée, tourelle décalée à droite avec antenne en arceau et
  canon court de 57 mm, suspension à bras coudés. 5,52 × 2,33 × 2,23. Camouflage trois tons.
- **Italie — M13/40** : caisse rivetée, tourelle à canon de 47/32, huit galets en bogies à lames.
  4,92 × 2,28 × 2,37. Sable ou grigio-verde selon la planche.
- **Chine — T-26 (modèle 1933)** : caisse rivetée, tourelle unique à canon de 45 mm, huit galets en
  bogies. 4,62 × 2,44 × 2,24. Vert-gris terne. (Il est plus court que le Vickers de la marque 1 :
  c'est voulu.)

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de profil, de dessus et de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page : tourelle qui tourne, tube qui se lève et recule, écoutille qui s'ouvre, texture
  de chenille qui défile.
- 1 unité = 1 m ; longueur de caisse de la nation ± 5 % ; chenilles sur y = 0 ; avant vers +z ;
  largeur + 1 m ≤ 5 m et hauteur + 0,5 m ≤ 4,2 m.
- Noms présents à l'identique : `hull`, `turret`, `gun` (et `gun_hull` pour la France), `hatch`,
  `tracks_left`, `tracks_right`, `wheels_left`, `wheels_right`, `barbotin_*`, `roue_folle_*`,
  `galet_*` ou `galets_*`, `fx_muzzle`, `fx_smoke`, `fx_poussiere`.
- `phares` présent ; moins de 1 200 triangles.
