# ADR 0002 — Plan incliné à faux horizon plutôt que globe

**Statut :** acceptée

## Contexte

La demande était une carte mi-2D mi-3D, caméra orbitale libre, avec des trajets de troupes en arcs
courbes façon carte des lignes aériennes. Cette esthétique est celle d'un globe.

Une carte SVG était le choix initial, mais elle ne se tourne pas : dès qu'on veut orbiter, il faut
passer en WebGL.

## Décision

Plan plat en WebGL, caméra orbitale bridée, avec une **courbure de faux horizon** : la géométrie est
légèrement infléchie vers le bas en s'éloignant du centre (`y -= k·(x² + z²)`), ce qui donne
l'impression d'une planète tout en gardant une carte plane.

## Justification

Un vrai globe a deux défauts rédhibitoires pour un jeu de stratégie :

- **La moitié du monde est cachée en permanence.** Impossible de voir son territoire et la menace en
  même temps. Avec des joueurs répartis sur la planète, c'est invivable.
- **Le picking, les labels et les panneaux ancrés** se battent tous contre la sphère.

Rise of Kingdoms, la référence citée au départ, n'est **pas** un globe : c'est un plan plat avec une
caméra inclinée. C'est délibéré, et c'est la norme du genre sur mobile.

La courbure de faux horizon donne le ressenti du globe sans ses inconvénients. Elle est réglable par
un curseur dans le prototype, précisément pour que le choix se juge à l'œil.

## Conséquences

- Passage obligé à three.js / react-three-fiber. Le stack React est conservé.
- **L'orbite doit être bridée** : angle polaire entre ~17° et ~66°, azimut libre, zoom clampé. La
  caméra libre à 6 degrés de liberté est un piège UX — les joueurs se perdent et la carte devient
  illisible au ras du sol.
- **Tout texte ou icône doit faire face à la caméra en permanence.** À prévoir dès le départ, très
  pénible à ajouter après coup.
- Les provinces sont des `ExtrudeGeometry` issues de GeoJSON projeté ; le raycast fonctionne
  nativement.

## Ce qu'on abandonne

Le rendu SVG, et la vérité géographique d'un globe (les hautes latitudes restent déformées par la
projection Natural Earth 1).
