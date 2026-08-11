# Prototypes

## carte-3d.html

Prototype de carte, autonome. Ouvrir dans Chrome — si three.js ne se charge pas depuis le CDN en
`file://`, lancer `npx serve` dans ce dossier.

**Ce qu'il valide :**

- 163 pays extrudés depuis Natural Earth, projection Natural Earth 1, découpe correcte à
  l'antiméridien
- orbite bridée (polaire 17°–66°, azimut libre, zoom clampé)
- courbure de faux horizon réglable en direct — **le curseur est le vrai livrable** : c'est ce qui
  permet de trancher globe vs plan incliné à l'œil
- survol, sélection, label suivant le curseur
- arcs de trajet animés, avec panneau d'opérations en cours
- **limite du monde** dessinée sur le contour réel de la sphère projetée, et **enroulement
  est-ouest** des trajets : la Nouvelle-Zélande vers l'Amérique passe par le Pacifique, pas par
  l'Eurasie

**Ce qu'il prouve techniquement :**

- le picking reste correct sous courbure (163/163, vérifié automatiquement) — cf.
  [ADR 0003](../docs/adr/0003-courbure-cpu.md)
- l'animation d'un mouvement est dérivée uniquement de `departedAt` / `arrivesAt`, donc pure
  interpolation client, zéro coût serveur pendant le trajet

**Sur l'enroulement.** Le monde est un **cylindre**, pas un tore : la longitude s'enroule, la
latitude non. On ne passe pas par le pôle nord pour ressortir en Antarctique. La limite dessinée est
le contour de la sphère projetée — les deux bords gauche et droit sont le même méridien, le 180ᵉ.

Un trajet s'enroule uniquement si c'est **plus court**. Le point de sortie et le point de rentrée
sont à la même latitude, calculés sur le contour, et le tout est vérifié automatiquement (8 cas,
dont Nouvelle-Zélande → États-Unis à 294 u en direct contre 150 u par le Pacifique).

⚠️ **Ce n'est pas cosmétique, c'est un levier d'équilibrage** : l'enroulement divise par deux la
distance entre l'Asie-Océanie et les Amériques. Cf. `docs/design/03-carte-et-avant-postes.md`.

**Ce qu'il ne fait pas :** ce sont des pays, pas des provinces. Pas de brouillard, pas de LOD, pas de
textures, pas d'avant-postes. Les données sont embarquées dans le fichier (~146 Ko).

**Usage : clic** sur un pays = origine, **clic** sur un second = envoi. **Glisser** pour orbiter.

## Généré comment

Les données viennent de `world-atlas` (countries-110m), projetées en Node avec `d3-geo-projection`
(`geoProject` traverse le stream d3, ce qui découpe correctement l'antiméridien — projeter point par
point produit une Russie qui traverse toute la carte).

Point représentatif de chaque pays calculé par pôle d'inaccessibilité approché, **pas** par centroïde
arithmétique : le centroïde place la France en Espagne (la Guyane tire la moyenne) et le Japon en
pleine mer. Environ 10 % des pays sont concernés.
