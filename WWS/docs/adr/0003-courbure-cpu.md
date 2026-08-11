# ADR 0003 — Courbure appliquée CPU et non dans le vertex shader

**Statut :** acceptée

## Contexte

La courbure de faux horizon (ADR 0002) peut s'appliquer de deux manières : dans un vertex shader,
ou en modifiant les positions de la géométrie côté CPU.

Le shader est le réflexe naturel — c'est plus rapide et c'est ce que fait la littérature.

## Décision

Appliquer la courbure **côté CPU**, sur les positions de la géométrie, en conservant le `Y` plat
d'origine dans un `Float32Array` pour pouvoir recalculer à la volée quand le curseur bouge.

## Justification

Le raycasting de three.js s'exécute sur la géométrie CPU. Si le GPU courbe la carte et que le CPU
continue à picker sur une géométrie plate, **les deux divergent** : le joueur clique visuellement sur
un pays et en sélectionne un autre. Le décalage croît avec la distance au centre, donc l'erreur est
faible au milieu de l'écran et grossière sur les bords — le pire cas de bug, difficile à reproduire.

La carte est statique et ne se recentre jamais : rien ne justifie le coût du shader.

## Conséquences

- **Tout point placé sur la carte doit passer par la même fonction de courbure** : extrémités
  d'arcs, marqueurs, avant-postes, labels. Une fonction `toWorld(lon, lat, h)` partagée.
- Le maillage ne doit subir **aucune transformation après coup** — pas de `mesh.position`, tout est
  cuit dans la géométrie, sinon la divergence revient par une autre porte.
- Changer la courbure impose de reparcourir tous les vertices et de reconstruire les arcs. Sur
  ~108 000 vertices, c'est instantané et ça n'arrive qu'au déplacement d'un curseur.

## Vérification

Test automatisé sur le prototype : un rayon vertical tiré sur le point représentatif de chaque pays.

| Courbure | Pays correctement pickés |
|---|---|
| 0.0 | 162 / 163 |
| 0.6 | **163 / 163** |
| 1.5 | **163 / 163** |

La courbure ne dégrade pas le picking. La divergence attendue avec une approche shader ne se produit
pas.
