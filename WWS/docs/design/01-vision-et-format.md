# 01 — Vision et format de saison

## Le principe directeur

> Le jeu n'est pas « faire une grosse armée ». Le jeu est **projeter de la force sur une planète où
> l'information est chère et où tout engagement est irréversible pendant N minutes**.

Trois règles qui découlent de cette phrase et qui s'appliquent partout ailleurs dans le design :

1. Les bonus **cassent une règle**, ils ne modifient jamais un pourcentage.
2. Ce qui est joli à l'écran (les arcs) est une **ressource qu'on achète**, pas une décoration.
3. Un joueur écrasé reste **nuisible**, jamais éliminé.

Toute proposition future se teste contre ces trois règles avant d'être discutée.

## Format

| Paramètre | Valeur | Note |
|---|---|---|
| Durée | 48 h (test) / 7 j (saison) | wipe complet à la fin |
| Joueurs | 2 à 8 | noté `n` dans tout le design |
| Région jouable | fonction de `n` | 2-3 → Europe · 4-6 → Europe + Méditerranée + Moyen-Orient · 7-8 → monde |
| Compensation géographique | curseur `0.0 → 1.0` | 0 = géographie brute, 1 = nations isolées fortement compensées |
| Graine de saison | aléatoire | détermine la richesse des pays neutres |

**La région jouable est le seul levier d'échelle.** À 2 joueurs sur la carte du monde, personne ne se
rencontre jamais ; le problème n'est pas le nombre de règles, c'est la taille du terrain.

**Un seul jeu, des paramètres.** Pas de « mode équilibré » et « mode brut » : deux modes, c'est deux
problèmes d'équilibrage sur lesquels on n'a aucune donnée, et personne ne joue le second deux fois.
Le curseur de compensation couvre tout le spectre avec un seul système à régler.

## Pourquoi une saison longue et non des parties de 30 minutes

Deux raisons dures, détaillées dans [ADR 0001](../adr/0001-saison-longue-asynchrone.md) :

- **Amorçage.** Une partie courte exige un matchmaking, donc des joueurs connectés simultanément.
  Entre amis, ça n'existe pas. Le jeu serait injouable le jour de son lancement.
- **Technique.** Le temps réel serveur-autoritatif demande une boucle de jeu persistante. Convex n'en
  a pas. Le format asynchrone rend au contraire l'accumulation paresseuse triviale.

## Ce que le projet n'est pas

Pas un RTS. Pas une couche tactique façon Advance Wars. Pas un free-to-play à timers.
Structurellement : **un Ogame/Travian sur carte du monde, avec du brouillard de guerre.**
