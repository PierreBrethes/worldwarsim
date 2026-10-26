# Fantassin d'appui — infantry-2.glb

Le fantassin d'appui de chaque nation en 1940 (arme antichar, mitrailleuse ou lance-grenades),
sculpté comme une figurine de wargame peinte. Dans « La Manchette » (stratégie, presse illustrée de
1940), c'est la deuxième marque de l'infanterie : trois par escouade, posés par le jeu en tournant
leurs articulations, sans squelette.

**Nation de cette conversation : ______** — ne lis que son paragraphe dans « Par nation ».
La planche de la nation est jointe ; le fantassin de la marque 1 de la même nation, s'il est fait,
donne l'uniforme et le style.

## Dimensions (mètres réels)

**Repère.** 1 unité = 1 mètre réel. y vers le haut ; le soldat regarde +z. Origine au sol, entre
ses pieds (ou sous son genou à terre). Rien sous y = 0. « Left » = la gauche du soldat, côté +x.

- **L'homme mesure 1,75 m debout, casque compris** (le jeu l'agrandit ×1,5 ; ne pas le faire ici).
  Épaules à 1,45 m, hanches à 0,95 m, genoux à 0,5 m.
- **Pose de sculpture** : celle que donne la nation (« Par nation ») — à genou derrière son arme
  pour un tube ou une arme sur bipied, debout pour un fusil.
- Arme à sa taille réelle.

## Pièces nommées

Les noms existent déjà et se gardent à l'identique. Chaque articulation a son origine au centre
de l'articulation. Aucun autre nom pour une pièce qui bouge.

| Nœud | Origine (pivot) | Axe et mouvement | Taille |
|---|---|---|---|
| `body` | bassin | torse et équipement ; parent des autres groupes | — |
| `head` | base du cou | enfant de `body` | — |
| `arm_left`, `arm_right` | centre de l'épaule | enfants de `body` | bras |
| `forearm_left`, `forearm_right` | centre du coude | enfants de leur bras | avant-bras et main |
| `leg_left`, `leg_right` | centre de la hanche | enfants de `body` | cuisse |
| `shin_left`, `shin_right` | centre du genou | enfants de leur jambe | jambe et chaussure |
| `rifle` **ou** `weapon` | dans la paume droite, au point de prise | l'arme, **enfant de `forearm_right`** ; `rifle` pour un fusil (antichar compris), `weapon` pour un tube ou une mitrailleuse | longueur de l'arme |

Exception, le Japon (une pièce et son servant) : voir « Par nation ».

## Repères vides

| Repère | Position | Orientation |
|---|---|---|
| `fx_muzzle` | enfant de l'arme, à sa bouche | le long du tube, vers l'avant du tir |
| `fx_smoke` | pour un tube lance-roquettes : à l'arrière du tube (le souffle) ; sinon absent | vers l'arrière du tube |

Un seul `fx_muzzle` et au plus un `fx_smoke` dans le fichier.

## Matériaux et texture

- Matériaux nommés par matière, une seule texture atlas de 512 à 1 024 px, peinte sur canvas.
- Figurine peinte, contours nets, couleurs d'époque désaturées d'après la planche. **Aucun
  symbole de régime** : ni croix gammée, ni aigle, ni faisceau ; les autres marques suivent la planche.
- Lisible de haut à 30° sous la verticale, de 20 à 60 px : le casque, puis l'arme.
- **Moins de 800 triangles** (Japon : 1 200 pour la pièce et son servant).

## Ce que le modèle doit permettre

- Dans l'escouade, il marche s'il porte un fusil ; derrière un tube ou une arme sur bipied, il
  garde sa pose et la pile se déplace sans balancer ses jambes.
- Au combat, il tire : l'éclair part de `fx_muzzle`, le souffle de `fx_smoke`, l'arme recule.
- Il monte en camion par le hayon et s'efface dans le noir de la bâche.

## Par nation

Couleurs et marquages cités ici sont indicatifs : en cas d’écart, la planche jointe fait foi.

- **France — lance-roquettes** (le « bazooka » du jeu) : tube de 1,37 m, Ø 0,06 m, porté sur
  l'épaule droite ; l'homme à genou (genou droit à terre), uniforme de la marque 1 (casque Adrian,
  capote kaki moutarde). Nom de l'arme : `weapon`. `fx_smoke` à l'arrière du tube.
- **Royaume-Uni — fusil antichar Boys** : 1,57 m, chargeur dessus, monopied ; l'homme à genou,
  l'arme sur son monopied (casque Brodie, battledress). `rifle`.
- **États-Unis — bazooka M1** : tube de 1,37 m à poignées et viseur, sur l'épaule droite, homme à
  genou (casque M1). `weapon`, `fx_smoke` à l'arrière du tube.
- **URSS — fusil antichar PTRS-41** : 2,14 m, bipied, frein de bouche ; l'homme à genou, l'arme sur
  son bipied (casque SSh-40). `rifle`.
- **Allemagne — Kar98k à tromblon** (Schießbecher) : le fusil de 1,11 m coiffé d'un tromblon de
  0,25 m et d'une grenade ; l'homme debout, en joue, le fusil incliné vers le haut. `rifle`.
- **Italie — fusil antichar Solothurn S-18/100** : 1,76 m, bipied, chargeur latéral ; l'homme à
  genou, l'arme sur bipied (casque M33). `rifle`.
- **Chine — mitrailleuse Type 24** (Maxim) : arme de 1,1 m à manchon de refroidissement, sur
  affût-trépied bas, bande de cartouches, caisse de munitions ; l'homme à genou derrière les
  poignées (casque M35 sans insigne). `weapon`, ses pieds fixes au sol.
- **Japon — canon antichar Type 1 de 47 mm et son servant** : pièce de ≈ 4,5 m flèches fermées,
  1,7 m de voie, 1,1 m au bouclier ; tube de 2,5 m, roues à pneus, bouclier, deux flèches.
  Le servant, à genou derrière le bouclier, a les dix groupes de l'homme (sans `rifle`). La
  pièce a ses propres groupes : `gun` (tube et berceau, origine aux tourillons, hausse autour de
  x, recul le long du tube), `wheels_left`, `wheels_right` (origine au moyeu, autour de x),
  `trail_left`, `trail_right` (origine à leur charnière, autour de y). `fx_muzzle` à la bouche
  du tube, `fx_smoke` à la culasse ; le servant n'a aucun repère. 1 200 triangles en tout.

## À vérifier avant de livrer

- Livrable : page three.js autonome (OrbitControls, vues de face, de profil, de trois quarts
  haute), bouton « Exporter en GLB » (GLTFExporter, binaire), le seul groupe du modèle : ni
  lumière, ni caméra, ni sol. Ni meshopt, ni quantification. Texture en WebP si possible, sinon PNG.
- Dans la page, la pose de sculpture et une pose de tir obtenues seulement en tournant les
  groupes ; l'arme suit la main.
- 1 unité = 1 m ; l'homme fait 1,75 m debout ; rien sous y = 0 ; regard vers +z ; left = +x.
- Les dix groupes de l'homme et le nom de l'arme présents à l'identique ; un seul `fx_muzzle` ;
  moins de 800 triangles (Japon 1 200).
