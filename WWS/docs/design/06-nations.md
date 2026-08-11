# 06 — Nations

**Statut : à équilibrer.** Aucun de ces pouvoirs n'a été simulé.

## La règle d'écriture

Un bon pouvoir asymétrique **brise une règle**, il ne modifie pas un nombre. La leçon vient de
Cosmic Encounter, la référence du genre.

- ❌ « +15 % de dégâts blindés » — ne change aucune décision, invisible en jeu, pénible à équilibrer.
- ✅ « je peux réorienter mes troupes en vol » — change ta carte mentale et se raconte après la partie.

Toutes les nations partagent **la même économie de base**. Le pouvoir est la seule différence.

## Les huit

| Nation | Pouvoir | Règle brisée |
|---|---|---|
| **France** | *Projection outre-mer* — avant-postes à n'importe quelle distance, coût croissant avec la distance | l'adjacence requise |
| **Royaume-Uni** | *Maîtrise des mers* — voit tous les arcs maritimes, mais sans origine, destination ni cargaison | le brouillard, partiellement |
| **États-Unis** | *Arsenal* — convertit ravitaillement → acier, un sens seulement, avec cooldown | la non-fongibilité des ressources |
| **URSS** | *Profondeur stratégique* — l'occupation ne réduit pas sa production, l'occupant subit de l'attrition mais prélève du butin | la pénalité d'occupation |
| **Allemagne** | *Guerre éclair* — enchaîne deux mouvements offensifs sans respecter le cooldown de slot | la rareté des slots |
| **Japon** | *Doctrine du porte-avions* — réoriente un mouvement en vol, avant mi-parcours, contre un slot supplémentaire | l'irréversibilité de l'engagement |
| **Italie** | *Reconnaissance aérienne* — voit la **composition** des piles qu'elle détecte, là où les autres ne voient qu'un arc | détecter révèle l'existence, pas le contenu |
| **Chine** | *Masse* — pas de plafond d'effectifs, mais entretien croissant en ravitaillement | le plafond d'effectifs |

> **Liste arrêtée sur 1940** ([ADR 0007](../adr/0007-epoque-1940.md)). L'Inde de 1940 est une colonie
> britannique et sort donc de la liste ; l'Italie entre. La Chine reste : la République de Chine
> combat le Japon depuis 1937.

## Historique des corrections

Quatre pouvoirs étaient dégénérés en v0. Gardé ici pour ne pas les réintroduire par inadvertance.

**France × Hégémonie était le combo n°1.** Extractions posées là où l'adjacence interdit aux autres
d'aller, sur des points qui ne changeaient jamais de main : aucun contre-jeu. Le coût croissant avec
la distance ramène le pouvoir à un arbitrage.

**Royaume-Uni × Influence** offrait une suprématie de renseignement gratuite et permanente sur toute
la moitié maritime, surtout à 7-8 joueurs sur carte monde. L'information partielle — on voit qu'un
arc existe, pas d'où il vient ni ce qu'il porte — garde la saveur sans donner la victoire.

**Chine** dépendait, pour son contrepoids, d'un système de combat explicitement non spécifié
(« pas d'accès aux unités de haut palier »). Un pouvoir non équilibrable est aussi un pouvoir non
simulable. L'entretien croissant en ravitaillement est un frein économique mesurable dès aujourd'hui.

**Russie** cassait une arête du triangle : occuper sa capitale ne rapportait rien et coûtait de
l'attrition, donc Domination ne battait plus Russie × Hégémonie. Le butin rétablit l'intérêt
d'attaquer.

**Inde** était immunisée au garde-fou anti-farm PNJ, sur la doctrine qui *est* un farm PNJ.
Auto-victoire. La nation a ensuite été retirée pour raison d'époque.

**France × Hégémonie est le couple le plus faible du jeu** (1,8 % de victoires mesurées pour 4,2 %
attendus) : le coût croissant avec la distance a sur-corrigé le combo n°1 et annule désormais le
pouvoir. À adoucir. Cf. [rapport de simulation](../technique/rapport-simulation.md).

## Sous surveillance

**Japon** reste le plus fort du lot : son pouvoir annule le levier de drame n°1, l'irréversibilité de
l'engagement. C'est assumé — c'est aussi le pouvoir le plus amusant — mais c'est le premier candidat
au nerf après la première saison test.

**Huit nations, c'est peut-être deux de trop** pour un dev solo sur une première saison. Six
suffiraient à couvrir les trois doctrines avec de la variété.
