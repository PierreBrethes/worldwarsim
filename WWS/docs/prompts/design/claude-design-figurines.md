# Prompts Claude Design — figurines

Une conversation Claude Design par rôle et par nation ; joindre la planche à chaque fois
(`src/emblems/units/<nation>/<rôle>.webp`). Le gabarit est ce qui empêche le style de dériver
(ADR 0026 §2) : ne pas en changer le repère, l'échelle ni les noms. L'export GLB se dépose dans
`src/emblems/figurines/<nation>/`, nommé comme sa planche, puis s'inscrit dans
`src/emblems/figurines/manifest.ts` ; `glb.test.ts` le tient au plafond et aux noms ci-dessous.

## Gabarit — véhicules, avions, navires

```text
Même projet que le char et le soldat : « La Manchette », 1940, figurines peintes de wargame. Nouvelle figurine : [NOM], d'après la planche jointe.

Même livrable : page three.js autonome, OrbitControls, bouton « Exporter en GLB » (GLTFExporter), la planche de référence, une vue de dessus et une vue de profil.

Même style : low-poly fidèle à la planche, pas réaliste ; ombrage plat ; peinture et marquages sur une texture générée sur canvas, aucune texture externe ; couleurs prises sur la planche.

Repère : y vers le haut, l'avant vers +z, origine au sol au centre de l'emprise (pour un avion : au centre de gravité, train rentré, en vol). Longueur : [LONGUEUR] unités. Moins de [BUDGET] triangles.

Pièces nommées, chacune avec son pivot à son axe de rotation : [PIÈCES].

Ajoute aussi des repères vides (Object3D sans géométrie), placés là où le jeu fera apparaître ses effets : « fx_smoke » (fumée : cheminée, moteur ou point d'impact sur la caisse) et « fx_muzzle » (le bout de l'arme principale).

Lumière : un soleil doux, un peu jaune, incliné, qui projette les ombres, plus une ambiance faible.
```

| Rôle | Longueur | Budget | Pièces |
|---|---|---|---|
| armor | 2,6 (léger) à 3,2 (lourd) | 3 000 | hull, turret, gun, tracks_left, tracks_right, fx_smoke, fx_muzzle |
| landTransport | 3,0 | 2 500 | body, wheels_left, wheels_right (chaque roue sur son moyeu), fx_smoke |
| fighter | 2,8 | 2 500 | fuselage, prop (axe z), fx_smoke |
| bomber | 3,6 | 3 500 | fuselage, prop_left, prop_right, fx_smoke |
| airTransport | 3,8 | 3 500 | fuselage, prop_* (un par moteur), fx_smoke |
| escort | 5,0 | 4 000 | hull, turret_1…n, fx_smoke |
| cargo | 5,5 | 4 000 | hull, fx_smoke |
| carrier | 6,5 | 4 000 | hull, fx_smoke |

Les navires sont volontairement comprimés. Une hélice s'appelle `prop…` : le moteur fait tourner
tout ce qui porte ce nom autour de son axe z.

## Infanterie

```text
Même projet que le char : « La Manchette », jeu de stratégie en 1940, esthétique presse illustrée. Sur la carte, chaque unité est une figurine peinte. Je veux maintenant un fantassin : [LE SOLDAT DE LA NATION], d'après la planche jointe.

Livrable : une page HTML autonome en three.js, avec OrbitControls et un bouton « Exporter en GLB » (GLTFExporter), comme pour le char. Mets aussi la planche de référence, une vue de face et une vue de profil.

Le modèle :
- Low-poly fidèle à la planche, pas réaliste : une figurine de wargame peinte. Ombrage plat, aucune texture externe ; si tu veux un effet peint, une texture générée sur canvas. Volumes adoucis comme sur le char, un nez et des oreilles esquissés, des mains en moufle avec le pouce séparé.
- Ce qui doit se reconnaître : [LE CASQUE, LA TENUE, L'ÉQUIPEMENT, L'ARME — le casque d'abord, c'est le signe qui distingue la nation en silhouette]. Proportions d'un adulte, pas de grosse tête.
- Couleurs prises sur la planche.
- Repère : y vers le haut, le soldat regarde vers +z, origine au sol entre ses pieds. Hauteur environ 1,8 unité, casque compris.
- Moins de 2 500 triangles : il y en aura trois par troupe et une soixantaine sur la carte.

Il doit pouvoir être posé en code, sans squelette : une hiérarchie de groupes nommés, chacun avec son pivot à l'articulation.
- « body » (torse et capote), « head » (tête et casque) ;
- « arm_left » et « arm_right » au niveau de l'épaule, chacun avec un sous-groupe « forearm_* » au coude ;
- « leg_left » et « leg_right » à la hanche, chacun avec un sous-groupe « shin_* » au genou ;
- « rifle », un groupe séparé dont l'origine est la crosse.
« left » est la gauche du soldat (vers +x, puisqu'il regarde vers +z).

Montre ensuite trois poses obtenues uniquement en tournant ces groupes, côte à côte :
1. la pose de la planche ;
2. en marche, l'arme sur l'épaule ;
3. un genou à terre.

Lumière : un soleil doux, un peu jaune, incliné, qui projette les ombres au sol, plus une ambiance faible.
```

Le fantassin français MK1 a été validé le 12/10 après une passe sur le casque (« un Adrian M26 :
bombe arrondie, bord étroit sur les côtés mais allongé en visière devant et en couvre-nuque
derrière, cimier marqué, insigne rond sur le devant »).
