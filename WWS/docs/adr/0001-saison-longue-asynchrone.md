# ADR 0001 — Saison longue asynchrone plutôt que parties de 30 minutes

**Statut :** acceptée — **révisée par l'[ADR 0027](0027-la-mondiale-au-centre.md)** (17/10/2026) :
deux modes, dont une Blitz de 1 à 2 h, et une Mondiale dont la durée est un réglage du salon.

## Contexte

Deux formats étaient envisagés : des parties de 20-30 minutes, ou des saisons d'une semaine avec
wipe. Le premier évoque un RTS, le second un Ogame/Travian.

## Décision

Saison longue asynchrone, de 48 h (test) à 7 jours (saison réelle).

## Justification

**Amorçage.** Une partie courte multijoueur exige un matchmaking, donc une base de joueurs connectés
simultanément. Le projet vise un groupe d'amis : cette base n'existera jamais. Le jeu serait
injouable le jour de son lancement, et le resterait.

**Contrainte technique.** Le temps réel serveur-autoritatif demande une boucle de jeu persistante,
du WebSocket et une latence maîtrisée. Convex n'a pas de boucle persistante, facture à l'appel, et
présente une latence de mutation de l'ordre de 100 ms. Ce serait le mauvais outil.

**Le format asynchrone rend l'accumulation gratuite.** On stocke `lastUpdate` et `rate`, on calcule
au moment de la lecture. Pas de cron d'accumulation, pas de scaling à gérer. C'est exactement ce
pour quoi Convex est bon.

## Conséquences

- Le jeu est structurellement un Ogame/Travian sur carte du monde, pas un RTS. Il faut l'assumer
  dans toute la communication du projet.
- L'animation des mouvements est de l'interpolation client pure, dérivée de `departedAt` /
  `arrivesAt`. Le serveur n'émet rien pendant le trajet.
- Nouveau problème introduit : **le joueur qui dort**. Une saison de sept jours signifie des attaques
  nocturnes. Traité par la plage de repos, cf. design/07.
- Autre problème : sans notifications, les joueurs oublient le jeu au bout de deux jours.

## Ce qu'on abandonne

Le contrôle d'unités en temps réel, et toute couche tactique façon Advance Wars. Advance Wars reste
une référence **visuelle**, pas une référence de genre.
