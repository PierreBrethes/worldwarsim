# Fantassin — infantry-1.glb

Le fantassin de chaque nation en 1940, avec son fusil réglementaire, sculpté comme une figurine
de wargame peinte. Dans « La Manchette » (stratégie, presse illustrée de 1940), trois de ces
hommes font une escouade : ils sortent de la caserne, marchent, montent en camion, se mettent à
genou et tirent ; le jeu les pose en tournant leurs articulations, sans squelette.

**Nation de cette conversation : ______** — ne lis que son paragraphe dans « Par nation ».
La planche de la nation est jointe : l'uniforme, le casque et les couleurs s'y prennent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; le soldat regarde +z. Origine au sol, entre
ses deux pieds. Rien sous y = 0. « Left » = la gauche du soldat, côté +x.

- **Hauteur : 1,75 m, casque compris** (le jeu l'agrandit lui-même ×1,5 ; ne pas le faire ici).
  Proportions d'un adulte, pas de grosse tête : épaules à 1,45 m, hanches à 0,95 m, genoux à
  0,5 m ; largeur aux épaules 0,48 m.
- **Pose de sculpture** : debout, l'arme au pied — le fusil tenu de la main droite par le fût, à
  la verticale, la crosse au sol contre le pied droit ; le bras gauche le long du corps.
- Fusil à sa longueur réelle (« Par nation »).
- Mains en moufle avec le pouce séparé, nez et oreilles esquissés, volumes adoucis.

## Pièces nommées

Les noms existent déjà et se gardent à l'identique. Chaque articulation est un groupe à part, son
origine **au centre de l'articulation**. Aucun autre nom pour une pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `body` | bassin, à 0,95 m | torse, capote, équipement ; parent des autres groupes | — |
| `head` | base du cou, à 1,5 m | enfant de `body` ; tête et casque ; tourne en y, s'incline en x | — |
| `arm_left`, `arm_right` | centre de l'épaule (x = ±0,2 ; y = 1,42) | enfants de `body` ; rotation libre (balancer en x, écarter en z) | bras |
| `forearm_left`, `forearm_right` | centre du coude | enfants de leur bras ; plier en x (0 à −140°) | avant-bras et main |
| `leg_left`, `leg_right` | centre de la hanche (x = ±0,1 ; y = 0,92) | enfants de `body` ; balancer en x, écarter en z | cuisse |
| `shin_left`, `shin_right` | centre du genou, à 0,5 m | enfants de leur jambe ; plier en x (0 à +140°) | jambe et chaussure |
| `rifle` | **dans la paume droite**, au point de prise sur le fût | **enfant de `forearm_right`** : le fusil suit la main dans toutes les poses (en marche sur l'épaule, en joue, à genou) | longueur du fusil |

Le jeu pose lui-même : marche (bras et jambes alternés), saut, assis, à genou, en joue, chute,
déroute. Le fusil rattaché à la main suffit pour toutes ces poses.

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_muzzle` | enfant de `rifle`, à la bouche du canon | le long du canon, vers l'avant du tir |

Aucun `fx_smoke` sur l'homme.

## Matériaux et texture

- Matériaux nommés par matière (`drap`, `cuir`, `peau`, `acier`, `bois_fusil`…), une seule
  texture atlas de 512 à 1 024 px, peinte sur canvas, aucune texture externe.
- Figurine peinte, contours nets, couleurs d'époque désaturées d'après la planche. **Aucun
  symbole de régime** : ni croix gammée, ni aigle, ni faisceau, ni brassard ; les autres marques suivent la planche, un casque sans insigne
  ou à insigne d'arme.
- Lisible de haut à 30° sous la verticale, de 20 à 60 px à l'écran : **le casque d'abord** (c'est
  lui qui dit la nation en silhouette), puis la couleur de l'uniforme, puis le fusil.
- **Entre 1 000 et 1 200 triangles** : jambes, bras et tête articulés gardés ; boutons, poches, bretelles
  et petits équipements peints, pas sculptés.

## Ce que le modèle doit permettre

- Trois hommes sortent de la caserne en file, descendent le perron et vont au rang : jambes et
  bras alternés, le fusil sur l'épaule (le bras droit plié, la main à l'épaule).
- À genou, en joue (le fusil à l'horizontale, la crosse à l'épaule droite, la main gauche sous le
  fût), il tire : l'éclair part de `fx_muzzle`.
- Il saute dans un camion par le hayon, s'assoit, saute à terre ; il chute, il fuit en déroute.
- Au repos, il met l'arme au pied et se relâche.

## Par nation

Couleurs et marquages cités ici sont indicatifs : en cas d’écart, la planche jointe fait foi.

- **France** — casque Adrian M26 (bombe arrondie, cimier marqué, bord étroit sur les côtés,
  allongé en visière et en couvre-nuque, petit insigne rond devant), capote modèle 1935 kaki
  moutarde aux pans relevés, bandes molletières, brodequins, cartouchières, musette. Fusil MAS 36,
  1,02 m.
- **Royaume-Uni** — casque Brodie Mk II (assiette plate à large bord), battledress de serge kaki,
  brelage 1937 à deux grandes cartouchières de poitrine, guêtres courtes, brodequins. Fusil
  Lee-Enfield n° 1 Mk III, 1,13 m.
- **États-Unis** — casque M1 (bombe ronde à bord égal), veste M1941 kaki clair, pantalon olive,
  jambières de toile, ceinture-cartouchière. Fusil M1 Garand, 1,10 m.
- **URSS** — casque SSh-40 (bombe haute et lisse), vareuse gymnastiorka kaki-vert,
  bottes, rouleau de capote en bandoulière, cartouchières de ceinture. Fusil Mosin-Nagant 91/30,
  1,23 m.
- **Allemagne** — casque M35 (bord évasé sur la nuque et les tempes) sans décalcomanie, vareuse
  M36 feldgrau, bottes de marche, brelage en Y, cartouchières, gamelle, pelle. Fusil Kar98k,
  1,11 m.
- **Japon** — casque Type 90 (bombe ronde, petit bord) avec couvre-nuque de toile, uniforme Type
  98 kaki-vert, bandes molletières, cartouchières de ceinture. Fusil Arisaka Type 38, 1,28 m, avec
  sa baïonnette.
- **Italie** — casque M33 (bombe ronde, bord court, sans insigne), uniforme M37 grigio-verde,
  bandes molletières, cartouchières M91 de poitrine. Fusil Carcano M91, 1,29 m.
- **Chine** — casque M35 de modèle allemand, sans insigne, uniforme de toile gris-bleu,
  molletières, chaussures de toile, ceinture de munitions en tissu en bandoulière, deux grenades
  à manche à la ceinture. Fusil Hanyang 88, 1,25 m.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de profil, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page, trois poses côte à côte obtenues **seulement** en tournant les groupes : arme au
  pied, en marche le fusil sur l'épaule, à genou en joue. Le fusil suit la main sans se décrocher.
- 1 unité = 1 m ; 1,75 m de haut ; pieds sur y = 0 ; regard vers +z ; left = +x.
- Les onze noms présents à l'identique ; `rifle` enfant de `forearm_right` ; un seul
  `fx_muzzle` ; entre 1 000 et 1 200 triangles.
