# ADR 0006 — Slots de mouvement comme régulateur central

> **Révisée par l'[ADR 0030](0030-le-qg-batit-la-recherche-transmet.md)** (source des slots) : ils ne viennent plus du niveau du centre logistique ni du QG, mais de la recherche (deux au départ, +1 par carte Transmissions). Le régulateur reste ; la formule `1 + niveau` ci-dessous est historique.

**Statut :** acceptée

## Contexte

Le convoi leurre — un mouvement à zéro unité, indiscernable d'un vrai pour l'espionnage — était
initialement facturé au coût du trajet, lui-même fonction de la cargaison.

Un audit adversarial a relevé l'évidence : cargaison vide, donc coût nul, donc spam illimité.
Conséquences en cascade : espionnage noyé sous le bruit, condition de victoire « suprématie de
renseignement » vidée de son sens, et écritures serveur non bornées.

## Décision

Introduire un **nombre de mouvements simultanés**, `slots = 1 + niveau du centre logistique`.

Attaquer, ravitailler, raider, feinter et poser un agent consomment tous un slot du même stock.
Le leurre coûte en plus un **forfait fixe**, indépendant de la cargaison.

## Justification

Un seul mécanisme règle trois problèmes de nature différente :

**Design.** Feinter se paie en attaques qu'on ne lancera pas. Le leurre devient une décision au lieu
d'un réflexe gratuit, ce qui est exactement ce qu'on voulait de lui.

**Économie de jeu.** Le slot devient la ressource la plus rare, donc l'arbitrage le plus fréquent de
la journée d'un joueur. C'est une décision structurante offerte par une seule variable.

**Technique.** Le nombre de mouvements en vol est borné par construction, donc la charge serveur et
le fan-out du brouillard le sont aussi. On ne peut pas nous faire exploser la facture Convex.

Accessoirement, cela donne au centre logistique une seconde raison d'exister : il ne fait plus
seulement gagner du temps, il élargit le champ des possibles.

## Conséquences

- Le pouvoir allemand se redéfinit naturellement contre cette règle (enchaîner deux mouvements sans
  respecter le cooldown de slot) — un pouvoir qui casse une règle plutôt qu'un pourcentage.
- Le pouvoir japonais coûte un slot supplémentaire, ce qui le ramène à un arbitrage.
- Il faut une UI claire sur les slots disponibles : c'est l'information la plus consultée du jeu.
- Un slot occupé par un mouvement lent est un coût d'opportunité réel — à surveiller en simulation,
  ça peut rendre les longues distances non compétitives.
