# Claude Design — ce qui reste à sculpter (20/10)

Une conversation par élément. On colle le gabarit de son rôle (`claude-design-figurines.md`, ou celui
du bâtiment ci-dessous), on remplace `[NOM]` par la phrase de l'élément, puis on joint deux images :

- **la planche**, si elle existe : `src/emblems/units/<nation>/<rôle>.webp`, ou `src/emblems/buildings/<clé>.svg` ;
- **une figurine déjà faite de la même nation**, en capture. Aucun de ces éléments n'a de planche, sauf
  le Centre de recherche : c'est cette figurine qui tient le style.

Dépôt : `src/emblems/figurines/<nation>/<rôle>.glb`, ou `src/emblems/buildings/<clé>.glb`. Puis WebP
(`npx @gltf-transform/cli webp in.glb out.glb --quality 90`, hors du dépôt) et inscription au
manifeste. `glb.test.ts` et `maquettes.test.ts` vérifient budget et noms.

## Ajout au gabarit des véhicules : l'artillerie

| Rôle | Longueur | Budget | Pièces |
|---|---|---|---|
| artillery | 2,4, flèches fermées | 3 000 | carriage, barrel, shield, wheels_left, wheels_right, trail_left, trail_right, fx_muzzle, fx_smoke |

Le canon est posé en batterie, flèches ouvertes, et l'avant (la bouche) regarde vers +z. `barrel`
pivote à ses tourillons, pour la hausse. Une pièce à flèche unique ou en caisson garde deux pièces
`trail_left` et `trail_right` : ce sont ses deux longerons. `fx_muzzle` est placé à la bouche,
`fx_smoke` à la culasse.

## Gabarit — bâtiment (maquette)

```text
Même projet que les autres maquettes : « La Manchette », 1940, maquettes peintes de wargame posées sur une carte d'état-major. Nouvelle maquette : [NOM], d'après la planche jointe ; la capture du quartier général jointe donne le style.

Même livrable : page three.js autonome, OrbitControls, bouton « Exporter en GLB » (GLTFExporter), la planche de référence, une vue de dessus et une vue de trois quarts.

Même style : low-poly fidèle à la planche, pas réaliste ; ombrage plat ; matériaux et détails peints sur une texture générée sur canvas, aucune texture externe ; couleurs prises sur la planche. La maquette est la même pour toutes les nations : aucun drapeau, aucun insigne national.

Repère : y vers le haut, la façade principale vers +z, origine au sol au centre de l'emprise. Emprise d'environ 3 × 3 unités, hauteur de 1,5 à 2,5. Moins de 3 500 triangles. Chaque matériau est un vrai matériau (pas de couleur par sommet).

Ajoute un repère vide (Object3D sans géométrie) nommé « fx_smoke », là où une fumée sortirait (cheminée, ou toit).

Lumière : un soleil doux, un peu jaune, incliné, qui projette les ombres, plus une ambiance faible.
```

## Les éléments

### Artillerie (gabarit véhicules et ligne ci-dessus), une par nation

- **uk/artillery** (à faire en premier : il fixe le modèle commun). L'Ordnance QF 25-pounder
  britannique : tube court et épais, bouclier à pans coupés, roues pleines à pneus, flèche en
  caisson, et la plateforme de tir ronde sous les roues. Vert kaki britannique.
- **france/artillery**. Le canon de 75 mle 1897, « le 75 » : tube long et fin, grandes roues à
  rayons en bois cerclées d'acier, bouclier droit, flèche unique. Kaki français.
- **germany/artillery**. L'obusier de 10,5 cm leFH 18 : tube moyen, bouclier haut à bord droit,
  roues en acier à bandage plein, flèches ouvertes. Gris panzer.
- **ussr/artillery**. Le canon divisionnaire de 76 mm modèle 1939 (USV) : tube long, bouclier bas
  à bord supérieur coudé, roues à pneus, flèches ouvertes. Vert soviétique 4BO.
- **usa/artillery**. L'obusier de 105 mm M2A1 : tube moyen et lisse, petit bouclier, roues à
  pneus, longues flèches ouvertes en V. Olive drab.
- **japan/artillery**. Le canon de 75 mm Type 90 : tube long avec frein de bouche, roues à rayons,
  bouclier, flèches ouvertes. Kaki japonais, vert-brun.
- **italy/artillery**. Le Cannone da 75/27 modello 1911 : roues à rayons en bois, bouclier plat,
  tube court, flèches ouvertes. Grigio-verde.
- **china/artillery**. Le canon de montagne Bofors de 75 mm, acheté à la Suède dans les années
  1930 : pièce légère et basse, roues à rayons, petit bouclier, flèche unique. Vert-gris terne.

### Troupes manquantes (gabarit véhicules)

- **france/armor-1**. Le Renault R35, char léger : caisse en acier moulé aux formes arrondies,
  tourelle APX-R ronde avec sa coupole, canon court de 37 mm, chenilles à petits galets, et la
  queue de franchissement à l'arrière. Vert armée, camouflage à taches brunes. Longueur 2,6.
- **france/cargo**. Un cargo français de 1940, du genre des Messageries maritimes : coque noire,
  château blanc au milieu, mâts de charge à l'avant et à l'arrière, une cheminée chamois à
  manchette noire. Longueur 5,5.
- **germany/airTransport**. Le Junkers Ju 52/3m, trimoteur : aile basse épaisse, revêtement en
  tôle ondulée, train fixe caréné, trois hélices (`prop_left`, `prop_center`, `prop_right`). Vert
  foncé dessus, bleu clair dessous, croix d'aile seulement : aucun symbole de régime sur la
  dérive. Longueur 3,8.
- **japan/airTransport**. Le Mitsubishi Ki-57, bimoteur de transport : aile basse, fuselage rond
  à hublots, train rentrant, deux hélices (`prop_left`, `prop_right`). Gris-vert clair, disques
  rouges hinomaru. Longueur 3,8.
- **italy/carrier**. Le porte-avions *Aquila*, tiré du paquebot *Roma* : pont d'envol continu,
  îlot à tribord avec une grande cheminée, coque de paquebot élancée. Gris clair. Longueur 6,5.
- **ussr/carrier**. Un porte-avions d'invention, d'après le « projet 71 » des années 1930 : coque
  de croiseur, pont d'envol court, petit îlot à tribord. Gris-bleu soviétique. Longueur 6,5.
- **china/carrier**. Un porte-avions d'invention : un cargo converti, avec un pont d'envol plat
  posé sur une coque marchande, un îlot minuscule à tribord et des hangars ouverts sous le pont.
  Gris terne, coque rouillée. Longueur 6,5.

### Bâtiment (gabarit bâtiment)

- **researchCenter**. Le Centre de recherche : un pavillon de laboratoire en brique claire, à un
  étage, avec des fenêtres hautes. Sur son toit, une coupole d'observatoire grise ouverte par une
  fente, d'où sort une lunette. Une cheminée de laboratoire, et une antenne en treillis. Planche :
  `src/emblems/buildings/researchCenter.svg`.

Un seul `fx_smoke` et un seul `fx_muzzle` par figurine. Une pièce servie par un fantassin ne
donne pas ces noms aux repères de son servant : le moteur les cherche par leur nom, et
`baked.test.ts` refuse les doublons. L'infanterie japonaise MK2, branchée le 20/10, en avait :
ceux du servant ont été renommés `fx_smoke_crew` et `fx_muzzle_rifle`.
