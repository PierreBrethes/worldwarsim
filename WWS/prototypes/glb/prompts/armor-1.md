# Char léger — armor-1.glb

Le char léger de chaque nation en 1940 (première marque des blindés), sculpté comme une figurine
de wargame peinte. Dans « La Manchette » (stratégie, presse illustrée de 1940), il sort de la
remise de la caserne, roule chenilles tournantes, pivote sa tourelle, tire, et au repos son chef
ouvre l'écoutille.

**Nation de cette conversation : ______** — ne lis que son paragraphe dans « Par nation ».
La planche de la nation est jointe : silhouette, camouflage et marquages s'y prennent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; l'avant vers +z. Origine au sol (y = 0), au
centre de l'emprise (milieu des chenilles). Rien sous y = 0 : le bas des chenilles touche y = 0.
« Left » = côté +x (la gauche du pilote), « right » = −x.

- **Longueur de caisse, largeur, hauteur** : celles du char de la nation (« Par nation »), canon
  non compté dans la longueur. Le jeu mesure le char sur sa longueur réelle.
- Chenilles d'un seul tenant par côté, posées au sol, garde-boue au-dessus.

## Pièces nommées

Les noms anglais existants se gardent. Chaque pièce qui bouge est un nœud à part, son origine où
elle tourne. Aucun autre nom pour une pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `hull` | centre de la caisse au niveau des moyeux de galets | la caisse suspendue : le jeu la fait tanguer au départ et à l'arrêt | caisse sans chenilles |
| `turret` | **centre de la couronne de tourelle**, sur le toit de caisse | enfant de `hull` ; tourne autour de y, 360° | — |
| `gun` | **aux tourillons** du canon, dans le masque | enfant de `turret` ; hausse autour de x (−8° à +20°) ; recul le long de son axe (−z local), 0,1 à 0,3 m | tube jusqu'à la bouche |
| `hatch` | gond de l'écoutille du chef, sur le toit de tourelle (ou de la coupole) | enfant de `turret` ; s'ouvre de 110° autour de son arête | Ø ou côté de l'écoutille |
| `tracks_left`, `tracks_right` | centre de chaque chenille | chenille d'un seul tenant, **UV déroulées dans la longueur** (v le long de la chenille, motif de patins répété) : le jeu fait défiler la texture | longueur de chenille |
| `wheels_left`, `wheels_right` | — | groupes des roues de chaque côté | — |
| `barbotin_left`, `barbotin_right` | moyeu du barbotin (roue motrice) | enfants de `wheels_*` ; tournent autour de x | — |
| `roue_folle_left`, `roue_folle_right` | moyeu de la roue de tension | enfants de `wheels_*` ; tournent autour de x | — |
| `galet_left_1`… `galet_left_N`, `galet_right_1`… | moyeu de chaque galet visible | enfants de `wheels_*` ; tournent autour de x. Les galets cachés par un blindage ou un bogie se fusionnent en `galets_left` / `galets_right` (fixes) | Ø du galet |

Un char sans tourelle (la chenillette italienne) nomme `turret` l'affût de ses mitrailleuses :
voir « Par nation ».

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_muzzle` | enfant de `gun`, à la bouche du tube | le long du tube, vers l'avant |
| `fx_smoke` | à la sortie de l'échappement | vers l'arrière ou le haut, selon le pot |
| `fx_poussiere` | au sol, derrière les chenilles, au milieu | −z |

Un seul `fx_muzzle` et un seul `fx_smoke`.

## Matériaux et texture

- Matériaux nommés par matière (`peinture`, `chenille`, `acier`…), une seule texture atlas de
  1 024 px au plus, peinte sur canvas, aucune texture externe ; camouflage et marquages d'après
  la planche, **sans symbole de régime** (ni croix gammée, ni faisceau ; les cocardes et les
  croix d'arme se gardent).
- `phares` : les verres des phares.
- Figurine peinte, contours nets, couleurs d'époque désaturées.
- Lisible de haut à 30° sous la verticale, de 20 à 120 px : tourelle et canon d'abord.
- **Moins de 1 200 triangles.**

## Ce que le modèle doit permettre

- Il sort de la remise de la caserne (baie de 5 × 4,2 m) tout droit, vire et va au rang : les
  chenilles défilent, barbotin, roue folle et galets tournent à la distance, la poussière monte.
- Au combat, la tourelle pivote vers la cible, le tube se lève, tire (éclair à `fx_muzzle`), recule.
- Au repos, l'écoutille s'ouvre ; au premier ordre, elle se referme.
- La nuit, ses phares s'allument ; usé, il fume par `fx_smoke`.

## Par nation

Couleurs et marquages cités ici sont indicatifs : en cas d’écart, la planche jointe fait foi.

Longueur de caisse × largeur × hauteur, en mètres réels.

- **France — Renault R35** : caisse d'acier moulé aux formes arrondies, tourelle APX-R ronde à
  coupole, canon court de 37 mm SA18, petits galets en bogies, queue de franchissement à
  l'arrière. 4,02 × 1,87 × 2,13. Vert armée à taches brunes.
- **Royaume-Uni — Vickers Light Tank Mk VI** : petite caisse rivetée, tourelle à deux hommes
  avec mitrailleuse lourde (le `gun`) et coaxiale, deux bogies Horstmann par côté. 3,96 × 2,08 ×
  2,26. Vert de service, bandes de camouflage.
- **États-Unis — M5 Stuart** : caisse à glacis incliné, tourelle à canon de 37 mm, galets en
  bogies verticaux, garde-boue. 4,84 × 2,29 × 2,30. Olive drab, étoile blanche.
- **URSS — BT-7** : caisse basse en coin, grandes roues Christie (quatre par côté, Ø 0,83 m),
  tourelle conique à canon de 45 mm. 5,66 × 2,29 × 2,42. Vert 4BO, marques de la planche.
- **Allemagne — Panzer II** : caisse rivetée étroite, tourelle décalée à gauche avec canon de
  20 mm, cinq galets par côté, coupole. 4,81 × 2,28 × 2,15. Gris panzer, croix d'arme blanche
  bordée de noir.
- **Japon — Type 95 Ha-Go** : caisse rivetée à superstructure, tourelle décalée à gauche avec
  canon de 37 mm, suspension à bras coudés. 4,38 × 2,06 × 2,18. Camouflage trois tons japonais.
- **Italie — chenillette L3/35** : sans tourelle ; casemate avant avec deux mitrailleuses
  jumelées. Ici `turret` est la plaque d'affût des mitrailleuses (origine sur son pivot vertical,
  rotation limitée à ±12°), `gun` les deux mitrailleuses (origine à leur axe, hausse), `hatch`
  le volet du chef sur la casemate. 3,17 × 1,42 × 1,28. Sable ou grigio-verde selon la planche.
- **Chine — Vickers 6-Ton type B** : caisse rivetée, tourelle unique à canon court de 47 mm,
  galets en bogies à lames. 4,88 × 2,41 × 2,16. Vert-gris terne.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de profil, de dessus et de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page : la tourelle qui tourne, le tube qui se lève et recule, l'écoutille qui s'ouvre,
  les chenilles dont la texture défile.
- 1 unité = 1 m ; longueur de caisse de la nation ± 5 % ; chenilles sur y = 0 ; avant vers +z.
- Noms présents à l'identique : `hull`, `turret`, `gun`, `hatch`, `tracks_left`, `tracks_right`,
  `wheels_left`, `wheels_right`, `barbotin_*`, `roue_folle_*`, `galet_*` ou `galets_*`,
  `fx_muzzle`, `fx_smoke`, `fx_poussiere`.
- La tourelle tourne sur sa couronne sans se décaler ; `phares` présent ; moins de 1 200 triangles.
