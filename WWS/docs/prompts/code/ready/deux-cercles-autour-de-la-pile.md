# deux-cercles-autour-de-la-pile — la détection et le contact, une encre, deux traits

Lis `CLAUDE.md`, `CONVENTIONS.md`, l'ADR 0021 §6 (la portée est lisible chez soi seulement),
`src/map/engine/reach.ts` (`ReachRing` — **l'anneau existant**, ambre, `Line2`, 96 segments, et
le commentaire qui dit pourquoi jamais une encre de nation), `src/map/engine/index.ts`
(`showReach`), `src/map/WorldMap.tsx` (`hoveredReach ?? reach`), `src/domain/labels.ts` (`Reach`),
`convex/constants.ts` (`ARRIVAL_RADIUS_KM`, `DETECTION_RANGE_KM`). Ne commit pas, ne push pas.
Rendu seul, aucune règle ne change. Un chantier, un commit.

> **Décisions 4a et 3a du 16/09** : `ARRIVAL_RADIUS_KM` est la *portée de contact* (une seule
> constante) ; autour de la pile sélectionnée, deux cercles de la même encre — **plein** pour le
> contact, **tireté** pour la détection.

## La règle

Quand la carte dessine la portée d'une pile à soi (sélection ou survol, comme aujourd'hui),
elle dessine **deux** anneaux concentriques : la détection (l'anneau actuel, qui devient
**tireté**) et le contact (`ARRIVAL_RADIUS_KM`, **plein**, même épaisseur, même ambre). Un
avant-poste ou une station d'écoute gardent un seul anneau (ils ne combattent pas) — l'anneau
de contact ne se dessine que pour une **pile de troupes**. Le contact ne se lit qu'aux zooms
région et pays : sous le zoom monde, 25 km font moins d'un pixel — ne le dessine pas quand son
rayon à l'écran passe sous un seuil lisible (à fixer au banc, ~6 px), plutôt qu'un point.

## Ce qu'il faut

- `Reach` (`labels.ts`) porte les deux rayons (`detectionKm`, `contactKm | null`), servis par ce
  qui construit déjà `reach` / `hoveredReach` dans `WorldMap.tsx` — `contactKm` vaut
  `ARRIVAL_RADIUS_KM` pour une pile, `null` pour un point ou une station.
- `ReachRing` dessine un ou deux anneaux ; le tireté par `LineMaterial` (`dashed`, `dashSize`,
  `gapSize` en unités monde ajustées à la courbure — vérifie que `Line2` le rend, sinon un
  second anneau en segments alternés).
- La fiche `?` : une ligne — « trait plein : contact ; tireté : ce que la pile voit ».
- L'abaque-catalogue (`GunneryWindow`) : la ligne de portée dit « détection » ; ajoute « contact :
  25 km » une fois, en tête, pas par rôle.

## Cas d'acceptation

1. Pile sélectionnée au zoom région : deux anneaux, plein dedans, tireté dehors, même encre.
2. Avant-poste survolé : un seul anneau, inchangé.
3. Zoom monde : le tireté seul ; le plein n'apparaît pas (seuil).
4. Bureau et 386 px : rien ne change hors carte (stash avant/après sur une fenêtre).
5. Vérifieur vert ; captures aux trois zooms dans le compte rendu.

## Hors périmètre

Toute portée adverse (ADR 0021 §6). La portée de tir d'une future artillerie (Registre 28).
