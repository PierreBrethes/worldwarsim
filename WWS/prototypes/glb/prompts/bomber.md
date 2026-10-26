# Bombardier — bomber.glb

Le bombardier de chaque nation en 1940, sculpté comme une figurine de wargame peinte, train
d'atterrissage sorti. Dans « La Manchette » (stratégie, presse illustrée de 1940), il sort de son
hangar (baie de 32 m), roule queue basse, décolle d'une piste en terre, rentre son train et
atterrit sur trois points.

**Nation de cette conversation : ______** — ne lis que son paragraphe dans « Par nation ».
La planche de la nation est jointe : silhouette, peinture et cocardes s'y prennent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; le nez vers +z. « Left » = l'aile gauche du
pilote, côté +x ; « right » = −x.

- **Attitude de sculpture : fuselage à l'horizontale (ligne de vol), train sorti.**
- **Origine au sol (y = 0), au milieu entre les points de contact des roues principales.** Les
  roues principales touchent y = 0.
- **La roulette de queue** pend à la hauteur qui la pose au sol quand l'avion se cabre autour de
  l'origine de son angle au sol (« Par nation ») : bas de la roulette à y = d × tan(angle), d
  étant la distance en z entre roues principales et roulette.
- Envergure, longueur, hauteur : celles de la nation ; l'envergure passe la baie de 32 m du hangar.
  Rien sous y = 0.

## Pièces nommées

Les noms anglais existants se gardent. Chaque pièce qui bouge est un nœud à part, son origine où
elle tourne. Aucun autre nom pour une pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `fuselage` | origine du modèle | fuselage, ailes, fuseaux moteurs, empennage ; parent des autres | — |
| `prop_left`, `prop_right` (et `prop_center` pour un trimoteur, `prop_left_outer`, `prop_left_inner`, `prop_right_inner`, `prop_right_outer` pour un quadrimoteur, `prop` pour un monomoteur) | **moyeu de chaque hélice** | enfants de `fuselage` ; tournent autour de z | Ø de l'hélice |
| `gear_left`, `gear_right` | **articulation haute de chaque jambe**, dans le fuseau moteur ou l'aile | enfants de `fuselage` ; se replient autour de l'axe dit pour la nation, 85 à 95° ; 0° = sorti ; train fixe : jamais replié | jambe ≈ 1,5 à 2 m |
| `wheel_left`, `wheel_right` | moyeu de chaque roue | enfants de leur jambe ; tournent autour de x | Ø 0,9 à 1,2 m |
| `tailwheel` | articulation de la roulette | enfant de `fuselage` ; fixe ou repliée vers l'arrière | Ø 0,4 m |

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_muzzle` | à la bouche de la mitrailleuse du nez (ou dorsale, s'il n'y en a pas au nez) | le long de l'arme |
| `fx_smoke` | à l'échappement du moteur gauche | −z |

Un seul `fx_muzzle` et un seul `fx_smoke`.

## Matériaux et texture

- Matériaux nommés par matière, une seule texture atlas de 1 024 px au plus, peinte sur canvas,
  d'après la planche ; **sans symbole de régime** (ni croix gammée sur la dérive, ni faisceau).
- `vitres` : verrières et nez vitré. `feux` : feux de position — rouge au bout de l'aile gauche
  (+x), vert au bout de l'aile droite (−x), blanc à la queue.
- Figurine peinte, contours nets, couleurs d'époque désaturées.
- **Moins de 1 500 triangles.**

## Ce que le modèle doit permettre

- Il naît dans le noir de son hangar et roule dehors, hélices tournantes, roues qui tournent.
- À la course, la queue se lève, il quitte le sol, rentre son train et monte à son fil.
- À l'atterrissage, il sort son train, se pose sur trois points, freine jusqu'à sa porte.
- Au combat, il tire par `fx_muzzle` ; touché, il fume par `fx_smoke` ; la nuit, ses feux de
  position sont allumés.

## Par nation

Couleurs et marquages cités ici sont indicatifs : en cas d’écart, la planche jointe fait foi.

Envergure × longueur × hauteur (m) ; angle au sol ; hélices ; repli du train.

- **France — LeO 451** : bimoteur à aile médiane, double dérive, nez vitré. 22,52 × 17,17 × 5,24 ;
  11° ; `prop_left`, `prop_right` ; train replié vers l'arrière dans les fuseaux ; roulette fixe.
- **Royaume-Uni — Vickers Wellington Mk IC** : bimoteur à aile médiane, structure géodésique
  visible sous la toile, tourelles de nez et de queue. 26,26 × 19,69 × 5,31 ; 12° ; `prop_left`,
  `prop_right` ; train vers l'arrière dans les fuseaux ; roulette fixe.
- **États-Unis — Boeing B-17 Flying Fortress** : quadrimoteur à aile basse, grande dérive.
  31,62 × 22,66 × 5,82 ; 10° ; quatre hélices ; train replié vers l'avant dans les fuseaux
  intérieurs (roues à demi saillantes) ; roulette repliable. **Plus de 31,5 m : il passe la baie
  de 32 m à 0,2 m près de chaque côté.**
- **URSS — Iliouchine Il-2** : monomoteur blindé d'assaut à deux places. 14,6 × 11,6 × 4,2 ; 12° ;
  `prop` ; train replié vers l'arrière dans des carénages sous l'aile (roues saillantes) ; roulette
  fixe.
- **Allemagne — Junkers Ju 87 B « Stuka »** : monomoteur à aile en W, **train fixe caréné**
  (jambes à 0°, jamais repliées). 13,8 × 11,0 × 4,0 ; 12° ; `prop` ; roulette fixe.
- **Japon — Mitsubishi G3M « Nell »** : bimoteur à aile médiane, double dérive. 25,0 × 16,45 ×
  3,69 ; 11° ; `prop_left`, `prop_right` ; train vers l'arrière dans les fuseaux ; roulette fixe.
- **Italie — Savoia-Marchetti SM.79 Sparviero** : trimoteur à bosse dorsale. 21,2 × 16,2 × 4,1 ;
  12° ; `prop_left`, `prop_center`, `prop_right` ; train vers l'arrière dans les fuseaux latéraux ;
  roulette fixe.
- **Chine — Tupolev SB** : bimoteur effilé à aile médiane. 20,33 × 12,27 × 3,48 ; 11° ; `prop_left`,
  `prop_right` ; train vers l'arrière dans les fuseaux ; roulette repliable.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de profil, de dessus, de face), bouton
  « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni lumière, ni caméra, ni
  sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page : un curseur « train », les hélices qui tournent, et l'avion cabré de son angle
  au sol, roulette posée.
- 1 unité = 1 m ; envergure de la nation ± 5 % et ≤ 31,8 m ; roues principales sur y = 0 ; nez
  vers +z.
- Noms présents à l'identique : `fuselage`, les `prop*` de la nation, `gear_left`, `gear_right`,
  `wheel_left`, `wheel_right`, `tailwheel`, `fx_muzzle`, `fx_smoke`.
- `vitres` et `feux` présents ; moins de 1 500 triangles.
