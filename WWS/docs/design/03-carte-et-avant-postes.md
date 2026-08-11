# 03 — Carte et avant-postes

## La carte

Carte du monde réel, rendue en WebGL, caméra orbitale bridée, plan incliné à courbure de faux
horizon plutôt que globe. Le raisonnement complet est dans
[ADR 0002](../adr/0002-plan-incline-plutot-que-globe.md) et
[ADR 0003](../adr/0003-courbure-cpu.md).

Le prototype [prototypes/carte-3d.html](../../prototypes/carte-3d.html) valide déjà : 163 pays
extrudés, orbite bridée, courbure réglable, picking correct sous courbure, arcs animés.

**Granularité : le pays, pas la province.** Un découpage admin-1 représente ~4000 entités à filtrer,
10× le travail de données et d'UI, et noierait 5 joueurs. Cf.
[ADR 0004](../adr/0004-avant-postes-plutot-que-conquete.md).

## L'asymétrie géographique est un problème, pas un détail

Rise of Kingdoms fonctionne parce que sa carte est procédurale et symétrique : mêmes voisins, mêmes
distances pour tout le monde. Le monde réel, non. La Russie a 14 frontières, l'Australie zéro. La
France est à 8 minutes de l'Allemagne et à 3 heures du Brésil.

Traitement retenu : **géographie réelle conservée, compensation paramétrable**. Les nations isolées
reçoivent des bonus (production navale et aérienne, revenu de base) proportionnels au curseur de
compensation fixé à la création de saison.

## L'enroulement est-ouest

Le monde est un **cylindre** : la longitude s'enroule, la latitude non. Un trajet dont l'écart de
longitude dépasse 180° passe par l'antiméridien — la Nouvelle-Zélande vers l'Amérique traverse le
Pacifique au lieu de contourner l'Eurasie.

**Ce n'est pas un effet visuel, c'est un levier d'équilibrage.** Sur le prototype, Nouvelle-Zélande →
États-Unis passe de 294 à 150 unités : l'enroulement **divise par deux** la distance entre
l'Asie-Océanie et les Amériques.

Conséquences directes sur le design :

- Le Pacifique devient une autoroute, pas une barrière. Le Japon, l'Australie et la
  Nouvelle-Zélande cessent d'être des culs-de-sac.
- Cela **réduit mécaniquement l'asymétrie géographique** décrite plus haut, donc le curseur de
  compensation doit être recalibré une fois l'enroulement en place.
- Les nations centrées sur l'Eurasie perdent une partie de leur avantage de centralité.

Ce qui reste ouvert : les **pôles**. Aujourd'hui, ils sont des murs. Un passage arctique
(Russie ↔ Canada par le nord) serait historiquement juste et tactiquement intéressant, mais il
casserait la topologie cylindrique et rendrait les distances beaucoup plus dures à lire.

## Avant-postes

Un avant-poste est un **point** : `{ lon, lat, propriétaire, niveau, spécialisation }`. Jamais un
polygone. C'est ce qui donne une couche territoriale contestée sans jamais toucher au découpage
administratif — la carte se colore, le front avance, et le coût en données reste nul.

### Spécialisation unique, choisie à la construction, irréversible

| Spécialisation | Effet |
|---|---|
| **Relais logistique** | les convois passant dans son rayon accélèrent |
| **Extraction** | produit de l'acier, débit fonction de la richesse du pays hôte |
| **Écoute** | révèle les arcs ennemis passant dans son rayon |

Le relais logistique est le porteur des trois. C'est le seul qui interagit avec le cœur du jeu — le
temps de déplacement — et il crée immédiatement l'arbitrage central : est-ce que j'investis dans une
armée, ou dans ma capacité à la projeter ?

### Règles

- **On peut stationner des troupes sur n'importe quelle spécialisation.** Réserver la garnison aux
  relais rendait les extractions indéfendables, donc la doctrine Hégémonie annulable par n'importe
  qui pour le prix d'un petit raid.
- **Un raid désactive temporairement**, puis laisse une fenêtre d'immunité. Un avant-poste ne change
  jamais de propriétaire ; il peut être **détruit** après plusieurs raids, ce qui libère
  l'emplacement.
- **La richesse des pays est tirée par la graine de saison.** Si le Golfe est toujours le Golfe, les
  trois meilleures cases sont connues avant le début, la première heure décide des 47 suivantes, et
  toutes les saisons se ressemblent.
- **Rendement décroissant par joueur sur un même pays hôte.** Le 3ᵉ avant-poste rapporte nettement
  moins que le 1ᵉʳ. Force l'étalement, donc l'exposition.

## Pays neutres (PNJ)

Les pays non joués proposent commerce, mercenaires et droits de passage.

**Garde-fou obligatoire : capacité d'échange finie par pays, et relation par joueur.** Deux joueurs
qui commercent avec le même pays se gênent mutuellement.

Sans ce garde-fou, la stratégie optimale devient « ignorer les autres joueurs et farmer les PNJ », et
le jeu de guerre devient un jeu de gestion solo. **Aucune nation ne doit y être immunisée** — c'était
le défaut du pouvoir indien en v0, appliqué précisément à la doctrine qui est un farm PNJ.

Un pays saturé d'avant-postes voit sa relation chuter et peut expulser, ou se laisser retourner par
un adversaire qui surenchérit.
