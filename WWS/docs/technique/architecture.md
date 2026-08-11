# Architecture

**Rien n'est engagé côté backend.** Ce document décrit l'intention et les contraintes connues, pas
un schéma. Le schéma est une conséquence du design, pas un préalable — l'écrire avant que la
simulation d'équilibrage ait tourné, c'est le réécrire deux fois.

## Stack

| Couche | Choix | Justification |
|---|---|---|
| Rendu carte | three.js (react-three-fiber) | validé par le prototype |
| Front | React + Vite | stack connue, R3F s'y intègre nativement |
| Backend | Convex | réactif, transactionnel, scheduler intégré |
| Hébergement | VPS perso | pas de contrainte d'échelle : 8 joueurs max |

## Ce que Convex fait très bien ici

**L'accumulation paresseuse.** On stocke `lastUpdate` et `rate`, on calcule au moment de la lecture.
Aucune tâche périodique pour faire monter les ressources, quel que soit le nombre de joueurs.

**La réactivité.** Les requêtes se réabonnent seules : le panneau de ressources et la carte se
mettent à jour sans code de synchronisation. C'est le vrai gain par rapport à une API REST.

## Correction : « aucun tick serveur » est faux

Formulation initiale trop optimiste, corrigée ici pour ne pas induire en erreur plus tard.

L'accumulation reste paresseuse, ça c'est acquis. Mais **cinq mécaniques ont besoin d'une exécution
datée** :

- la résolution d'un mouvement à son arrivée,
- la fin d'une sonde,
- la fin d'un embargo,
- la fin d'un gel d'exposition,
- l'attrition d'occupation.

La formulation correcte est : **pas de boucle globale, mais un job planifié par événement**
(`scheduler.runAt(arrivesAt, ...)`). Le coût scale avec le nombre de mouvements — lui-même borné par
les slots (ADR 0006) — et non avec le temps écoulé. C'est bon marché, mais ce n'est pas zéro, et ça
change la façon de penser le modèle.

## Trois points chauds

**Le brouillard.** Le gros morceau. Détaillé dans
[brouillard-et-fanout.md](brouillard-et-fanout.md).

**Le routage.** Un mouvement n'est pas « un point A vers un point B ». Terre/mer, droits de passage
des pays neutres, portée des unités : c'est un graphe de navigation à construire, à équilibrer et à
déboguer. Après le brouillard, c'est le plus gros poste technique restant — très au-dessus de la
modélisation des données.

**L'autorité serveur.** Le client ne doit jamais recevoir ce qu'il n'a pas le droit de voir. Un
filtrage côté client se contourne en trois lignes de console. Entre amis, ça reste une faille qui
tue le jeu le jour où quelqu'un ouvre les devtools par curiosité.

## Ordre de construction proposé

1. Figer le modèle de combat jouet (design/08).
2. Simuler une saison de 48 h hors ligne, sans backend.
3. Seulement ensuite, écrire le schéma Convex.
