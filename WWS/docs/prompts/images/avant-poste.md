---
type: prompt
statut: validé
maj: 2026-10-02
code: [src/emblems/buildings/manifest.ts, WWS/sprites/README.md]
decisions: [12a-2026-08-18]
voir: [batiments.md]
---
# Prompt d'image — la planche de l'avant-poste

**En bref.** Prompt d'image de la planche unique et neutre de l'avant-poste (tour d'observation, mât nu) et note d'affichage. Prêt à donner : aucune planche produite à ce jour ; variantes de spécialisation volontairement reportées.

À ranger avec `batiments.md` — même gabarit, mêmes règles (fond #4a7060 détouré, base entière
et fermée, `nettoyer-ombres.py`, contrôle sur fond clair). Une seule planche neutre : comme les
bâtiments, l'avant-poste **ne prend jamais l'encre nationale** — c'est un pion militaire, son
propriétaire se lit au libellé et à l'encre du texte, pas au toit.

**Ce qui le distingue des quinze bâtiments, et que la silhouette doit dire** : un avant-poste
n'est pas une construction, c'est un **campement planté** — démontable, provisoire, posé plutôt
que bâti. À quarante pixels, il doit se lire « présence », jamais « usine ». Silhouette clé :
la tour d'observation, qu'aucun des quinze n'a.

```
Sprite de jeu de stratégie, vue de dessus 3/4 (angle ~60°), orienté vers sud-ouest.
Sujet : avant-poste militaire de campagne, années 1940 — tour d'observation en bois à plateforme
couverte, deux tentes militaires en toile kaki, palissade basse de sacs de sable et piquets
formant un périmètre ouvert, un mât de drapeau NU (sans drapeau), une caisse et un tonneau.
Style : prérendu type RTS fin des années 90 (Sudden Strike, Blitzkrieg), détaillé mais net,
sans flou, sans effet de particules.
Éclairage : soleil haut légèrement à gauche, ombres courtes et douces, aucun reflet spéculaire fort.
Couleurs : matériaux ternes et désaturés — bois brut, toile kaki, sacs de jute, terre. Jamais saturé.
FOND : uni vert neutre #4a7060, PAS de décor, PAS de sol, PAS d'ombre portée — le sprite sera détouré.
Cadrage : campement seul, centré, occupe ~80 % de l'image, format carré 1024×1024.
Le campement est POSÉ, vu depuis l'extérieur, entier, avec sa base visible — pas de coupe.
Aucun texte, aucun logo, aucun véhicule, aucun personnage, un seul campement.
```

Le **mât nu** est délibéré : un drapeau générique mentirait (l'avant-poste a un propriétaire) et
un drapeau national coûterait huit planches — la règle des bâtiments s'applique.

## Les variantes de spécialisation — plus tard, pas maintenant

Relais et écoute pourraient se distinguer un jour (un sémaphore, des antennes). **Ne pas les
générer tant que les spécialisations sont des coquilles** : une planche par état est le genre de
dette d'art qu'on paie trois fois. La planche unique + le libellé suffisent au test. Idem pour
les niveaux : une planche, comme les bâtiments.

## Affichage (note pour le prompt Code qui la branchera)

Comme les bâtiments : la planche est la **vignette d'un jalon**, le pied du mât désigne le point.
La garnison s'affiche **à côté du jalon** — les planches d'unités déjà existantes, en petit,
avec l'effectif — parce qu'une garnison est une information de la fiche 03 (l'avant-poste
« expose l'effectif de sa garnison »), pas un décor. C'est l'adresse rendue visible, jamais des
troupes posées librement (décision 12a).
