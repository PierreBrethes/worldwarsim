# avant-poste-tient-sa-region — un avant-poste tient la région où il se tient, et sa garnison a une porte

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, l'ADR 0020 §1 et §3, l'ADR 0019 §3.
Ne commit pas, ne push pas. Suppose `port-sur-la-cote` et `debarquement-sur-la-cote` livrés.
Un chantier, un commit.

## Le constat (partie de test, 04/09 — Japon, avant-poste en Extrême-Orient soviétique)

1. **L'avant-poste ne colore rien.** `heldRegions` et `coveredRegions` (`src/domain/control.ts`)
   ne tiennent une région que si **son centroïde** est à moins de `outpostReachKm(level)` du
   point de l'avant-poste — 120 km au niveau 1. Une région sibérienne a son centroïde à 200 ou
   400 km de sa côte : l'avant-poste posé dedans ne tient **même pas la région où il se tient**.
   L'ADR 0020 §3 dit « une région en Sibérie » ; le code dit zéro. Même cause pour la pose :
   `OUT_OF_OUTPOST_REACH` (`constructions.ts:322`) lit la même distance au centroïde — le puits
   de pétrole de la région même de l'avant-poste peut être refusé.
2. **La garnison d'un avant-poste n'a aucune porte.** Seules les piles posées sur un *point* ont
   un marqueur cliquable (`postedStacks`, `plateau.tsx`) ; le marqueur d'avant-poste porte
   `station: null` (`labels.ts:295`). Le mât d'un bâtiment ouvre sa garnison depuis le hotfix
   du 01/09 ; le mât d'un avant-poste n'ouvre rien. Troisième régression de la famille
   `758c27d` (le widget de troupes supprimé était la porte).
3. Pierre croyait qu'un avant-poste « occupe » sa région pour la bâtisse : faux, un avant-poste
   n'est pas un bâtiment et `REGION_TAKEN` ne le compte pas. Rien à changer, mais le cas
   d'acceptation 5 le verrouille, et la carte de survol de la région doit le laisser lire.

## La règle (précision de l'ADR 0020 §1, pas une révision)

**Un avant-poste tient, couvre et atteint toujours la région où il se tient**, quelle que soit
sa taille — puis les régions dont le centroïde tombe dans son rayon, comme aujourd'hui. Le
rayon reste métrique (§3) ; on ajoute l'évidence qu'il oubliait. Grave le paragraphe dans
l'ADR 0020 sous « Précision du 04/09 ».

## 1. Serveur

- `outposts.regionId?: v.string()` — écrit à la fondation : `foundOutpostHere` reçoit
  `regionId` du client (la région sous le point, `regionAtPoint` — le serveur n'a pas les
  polygones, même limite assumée que `port-sur-la-cote` ; il vérifie seulement que le pays de
  la région est `hostCountry`). Les avant-postes d'avant-wipe n'ont pas le champ : **repli** =
  la région du bon pays dont le centroïde est le plus proche du point (`nearestRegionOf`, une
  fonction, commentée comme repli jusqu'au wipe).
- Une seule fonction `regionOfOutpost(outpost)` (`convex/regions.ts`), lue par : `heldRegions`
  (la région propre est tenue avant tout calcul de distance), `coveredRegions` (couverte),
  `constructions` / `sites` (atteinte : le puits se pose dans la région de l'avant-poste), et
  `fileSurvey` (relevée). La vue sert `regionId` sur `me.outposts`.
- `control.held` change donc pour le joueur lui-même : sa couleur apparaît sur la région de
  l'avant-poste dès la fondation, sans attendre un relevé.

## 2. Client — la porte de la garnison

- Le marqueur d'avant-poste porte `station: { kind: 'outpost', outpostId }` ; le clic gauche
  sur son mât suit **la même porte qu'un bâtiment hors projection** (`openBuilding` → colonne
  → `GarrisonPanel`) : la garnison se coche, se compose, s'arme, jusqu'à la visée. Pas de
  modale de site pour un avant-poste (il ne forme rien).
- Garnison vide : le clic ouvre quand même le panneau (lecture : niveau, métier, « aucune
  troupe ») — une porte qui ne s'ouvre que parfois se lit comme une panne.
- Le clic droit sur le mât garde la rose actuelle (cible `outpost`).

## Cas d'acceptation

1. Étant donné un avant-poste fondé dans une région dont le centroïde est à 300 km du point,
   `control.held` tient cette région pour son joueur dès la fondation ; la carte la colore.
2. La même région accepte un puits de pétrole (dans le budget d'emplacements de l'avant-poste),
   sans `OUT_OF_OUTPOST_REACH`.
3. Un avant-poste d'avant-wipe sans `regionId` se lit par le repli et tient sa région la plus
   proche du bon pays.
4. Clic gauche sur le mât d'un avant-poste garni → `GarrisonPanel`, la troupe se coche et
   s'arme ; garnison vide → le panneau s'ouvre en lecture.
5. Un avant-poste n'empêche pas de bâtir dans sa région (`REGION_TAKEN` ne le compte pas) —
   test explicite.
6. Les régions hors rayon dont le centroïde est loin restent non tenues : la règle métrique
   ne change pas.
7. Observateur : le panneau s'ouvre en lecture, sans cases.

`npm run verifier` vert. Un commit, message qui décrit le chantier entier.
