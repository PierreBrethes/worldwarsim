# Chasseur — fighter.glb

Le chasseur monomoteur de chaque nation en 1940, sculpté comme une figurine de wargame peinte,
train d'atterrissage sorti. Dans « La Manchette » (stratégie, presse illustrée de 1940), il sort
de son hangar, roule queue basse, décolle d'une piste en terre, rentre son train, et atterrit sur
trois points.

**Nation de cette conversation : ______** — ne lis que son paragraphe dans « Par nation ».
La planche de la nation est jointe : silhouette, peinture et cocardes s'y prennent.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; le nez vers +z. « Left » = l'aile gauche du
pilote, côté +x ; « right » = −x.

- **Attitude de sculpture : fuselage à l'horizontale (ligne de vol), train sorti.**
- **Origine au sol (y = 0), au milieu entre les points de contact des deux roues principales.**
  Les roues principales touchent y = 0.
- **La roulette de queue** pend sous la queue à la hauteur qui la pose au sol quand l'avion se
  cabre autour de l'origine de l'angle au sol de la nation (« Par nation ») : bas de la roulette à
  y = d × tan(angle), d étant la distance en z entre les roues principales et la roulette. (Le jeu
  pose l'avion au sol en le cabrant de cet angle ; en vol il le remet à l'horizontale.)
- Envergure, longueur, hauteur : celles de la nation. Rien sous y = 0.

## Pièces nommées

Les noms anglais existants se gardent. Chaque pièce qui bouge est un nœud à part, son origine où
elle tourne. Aucun autre nom pour une pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `fuselage` | origine du modèle | fuselage, ailes, empennage, verrière ; parent des autres | — |
| `prop` | **moyeu de l'hélice** | enfant de `fuselage` ; tourne autour de z ; ses pales en enfants | Ø de l'hélice |
| `gear_left` | **articulation haute de la jambe gauche**, dans l'aile | enfant de `fuselage` ; se replie dans l'aile autour de l'axe dit pour la nation, 85 à 95° ; 0° = sorti | jambe ≈ 1,2 m |
| `gear_right` | articulation haute de la jambe droite | idem, en miroir | — |
| `wheel_left`, `wheel_right` | moyeu de chaque roue | enfants de leur jambe ; tournent autour de x au roulage | Ø 0,6 à 0,7 m |
| `tailwheel` | articulation de la roulette sous la queue | enfant de `fuselage` ; fixe ou repliée vers l'arrière selon la nation | Ø 0,3 m |

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_muzzle` | à la bouche de l'arme principale (canon de moyeu ou mitrailleuse d'aile gauche) | +z |
| `fx_smoke` | aux pipes d'échappement, côté gauche | −z |

Un seul `fx_muzzle` et un seul `fx_smoke`.

## Matériaux et texture

- Matériaux nommés par matière, une seule texture atlas de 1 024 px au plus, peinte sur canvas,
  d'après la planche : camouflage, cocardes de la nation, **sans symbole de régime** (ni croix
  gammée sur la dérive, ni faisceau ; la croix d'arme allemande et les cocardes se gardent).
- `vitres` : la verrière. `feux` : feux de position — rouge au bout de l'aile gauche (+x), vert
  au bout de l'aile droite (−x), blanc à la queue.
- Figurine peinte, contours nets, couleurs d'époque désaturées.
- Lisible de haut à 30° sous la verticale, de 20 à 120 px : la silhouette des ailes et les
  cocardes d'abord.
- **Plafond 2 500 triangles ; vise 1 000 à 1 200.**

## Ce que le modèle doit permettre

- Il naît dans le noir de son hangar, nez à la baie, et roule dehors queue basse ; ses roues
  tournent, son hélice tourne.
- À la course, la queue se lève (le jeu le fait tourner autour des roues principales), il quitte le
  sol, rentre son train et sa roulette, et prend son fil à trois envergures du sol.
- À l'atterrissage, il sort le train, se pose sur trois points, freine jusqu'à sa porte.
- Au combat, il tire par `fx_muzzle` ; la nuit, ses feux de position sont allumés.

## Par nation

Couleurs et marquages cités ici sont indicatifs : en cas d’écart, la planche jointe fait foi.

Envergure × longueur × hauteur (m) ; angle au sol ; repli du train.

- **France — Dewoitine D.520** : aile basse elliptique, long capot de moteur en ligne, canon de
  moyeu. 10,18 × 8,76 × 2,57 ; 11° ; train replié vers l'intérieur ; roulette fixe. Vert, brun et
  gris-bleu dessus, gris-bleu clair dessous ; cocardes tricolores, gouvernail tricolore.
- **Royaume-Uni — Supermarine Spitfire Mk I** : aile elliptique fine, radiateur sous l'aile droite.
  11,23 × 9,12 × 3,0 ; 11,5° ; train replié vers l'extérieur ; roulette fixe. Vert sombre et terre,
  dessous ciel ; cocardes RAF.
- **États-Unis — Curtiss P-40 Warhawk** : nez à grand radiateur ventral. 11,38 × 9,66 × 3,22 ;
  12° ; train replié vers l'arrière en pivotant à plat dans l'aile ; roulette repliable. Olive drab
  dessus, gris neutre dessous ; étoile blanche sur disque bleu.
- **URSS — Yakovlev Yak-1** : aile basse, moteur en ligne, verrière à dos plein. 10,0 × 8,48 ×
  2,64 ; 11° ; train replié vers l'intérieur ; roulette repliable. Vert et noir dessus, bleu clair
  dessous ; étoile rouge bordée de blanc.
- **Allemagne — Messerschmitt Bf 109 E** : aile basse droite à saumons carrés, verrière à
  montants. 9,87 × 8,64 × 2,6 ; 12° ; train étroit replié vers l'extérieur ; roulette fixe. Gris-vert
  dessus, bleu clair dessous ; croix d'arme, rien sur la dérive.
- **Japon — Mitsubishi A6M2 Zéro** : aile basse à grand allongement, capot rond de moteur en
  étoile. 12,0 × 9,06 × 3,05 ; 11° ; train replié vers l'intérieur ; roulette repliable. Gris-vert
  clair ; disques rouges hinomaru.
- **Italie — Macchi C.200 Saetta** : capot rond de moteur en étoile, poste ouvert en bosse.
  10,58 × 8,19 × 3,51 ; 11° ; train replié vers l'intérieur ; roulette repliable. Sable tacheté de
  vert ; cocardes tricolores italiennes d'aujourd'hui, croix blanche de gouvernail.
- **Chine — Polikarpov I-15** : biplan à aile haute en mouette, moteur en étoile. 9,75 × 6,10 ×
  2,20 ; 10° ; **train fixe** (gear à 0°, sans repli) ; béquille de queue fixe. Vert sombre, capot et bouts d'aile orangés ; marquages de la planche.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de profil, de dessus, de face), bouton
  « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni lumière, ni caméra, ni
  sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page : un curseur « train » (sorti → rentré), l'hélice qui tourne, et une vue de profil
  de l'avion cabré de son angle au sol, roulette posée.
- 1 unité = 1 m ; envergure de la nation ± 5 % ; roues principales sur y = 0 ; nez vers +z.
- Noms présents à l'identique : `fuselage`, `prop`, `gear_left`, `gear_right`, `wheel_left`,
  `wheel_right`, `tailwheel`, `fx_muzzle`, `fx_smoke`.
- `vitres` et `feux` présents ; moins de 2 500 triangles.
