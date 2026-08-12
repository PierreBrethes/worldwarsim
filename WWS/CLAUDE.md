# WorldWarSim — contexte global

À lire en premier, par un humain qui reprend le projet comme par un assistant qui y intervient.
Il donne l'état, ce qui est verrouillé, et où trouver le reste.

---

## Le projet

Jeu de stratégie **web, asynchrone**, sur une carte du monde réel, esthétique **presse illustrée
1940**. Saison de 48 h à 7 jours puis remise à zéro complète. **2 à 8 joueurs, entre amis** — pas de
grand public, pas de monétisation, pas de contrainte d'échelle.

> Le jeu n'est pas « faire une grosse armée ». Le jeu est **projeter de la force sur une planète où
> l'information est chère et où tout engagement est irréversible pendant N minutes**.

**Développeur solo**, à l'aise en full stack web. Front React + three.js, backend Convex visé, VPS
personnel.

---

## Où en est le projet

| | État |
|---|---|
| Design | **complet et audité**, 11 fiches |
| Carte 3D | **prototype fonctionnel**, vérifié automatiquement |
| Équilibrage | **mesuré** sur 2 000 saisons simulées |
| Direction artistique | **validée en prototype**, typographie à faire |
| Brief UI | **prêt à transmettre** |
| Surfaces 4.1 à 4.4 | **implémentées sur Convex**, `src/` à la racine du dépôt ; le fixture de démonstration a été retiré |
| Surface 4.6 — Production | **implémentée sur Convex** : file de recrutement, annulation remboursée, paliers MK1/MK2 |
| Sprites d'unités | **France dessinée** (10 WebP, 240 Ko) ; sept nations à générer — pipeline dans `sprites/README.md` |
| Schéma de données | hors-saison et état de nation (ADR 0010) ; **première tranche du schéma de jeu écrite** (`unites`, `recrutements`) |
| Code de jeu serveur | accueil/salon/lancement, ressources **et production** servis par Convex ; mouvements et combat : rien |

**Le schéma s'écrit par tranches, dans l'ordre où le design se fige.** Le hors-saison et l'état de
nation sont gravés (fiche 12, ADR 0009-0010) : leur schéma existe. Le schéma de **jeu** — mouvements,
combat, occupation, revenus — reste une conséquence du design : il ne s'écrit qu'après la correction
du dernier 🔴 de `QUESTIONS.md`. Trois fois au cours du projet, l'écrire tôt aurait produit du
travail à jeter.

> **Entorse assumée, août 2026.** La production d'unités (`unites`, `recrutements`) a été écrite
> **avant** la fermeture du 🔴, sur décision explicite. Le pari : le recrutement touche à la
> *dépense*, pas au revenu de base, donc l'avantage d'isolement géographique ne devrait pas le
> remettre en cause. Si le 🔴 se résout en indexant le revenu sur la distance, **relire
> `convex/constantes.ts`** — c'est là que le pari se paie. Aucun ADR n'a été rédigé pour cette
> tranche : c'est la dette de documentation la plus visible du dépôt.

---

## Les trois règles qui gouvernent tout

Toute proposition se teste contre elles avant d'être discutée.

1. **Les bonus cassent une règle**, ils ne modifient jamais un pourcentage.
   « +15 % de dégâts » ne change aucune décision ; « je réoriente mes troupes en vol » change la
   carte mentale du joueur.
2. **Ce qui est joli à l'écran est une ressource qu'on achète.** Les arcs de mouvement sont
   invisibles par défaut. Le rendu 3D est un résultat, pas un décor.
3. **Un joueur écrasé reste nuisible, jamais éliminé.** Le risque n°1 du format long, c'est le
   joueur battu mardi qui a cinq jours de rien devant lui.

---

## Décisions verrouillées — ne pas relitiger sans lire l'ADR

| Décision | Pourquoi, en une ligne | ADR |
|---|---|---|
| Saison longue asynchrone, pas de parties courtes | pas de matchmaking possible entre amis, et Convex n'a pas de boucle de jeu | [0001](docs/adr/0001-saison-longue-asynchrone.md) |
| Plan incliné à faux horizon, pas de globe | sur un globe, la moitié du monde est cachée en permanence | [0002](docs/adr/0002-plan-incline-plutot-que-globe.md) |
| Courbure appliquée CPU, pas dans un shader | sinon le raycasting diverge de ce qu'on voit | [0003](docs/adr/0003-courbure-cpu.md) |
| Avant-postes ponctuels, pas de conquête de provinces | 10× le travail de données pour moins de décisions | [0004](docs/adr/0004-avant-postes-plutot-que-conquete.md) |
| Brouillard de guerre par défaut | rend l'espionnage central et le rendu monnayable | [0005](docs/adr/0005-brouillard-par-defaut.md) |
| Slots de mouvement comme ressource rare | règle d'un coup le spam, l'arbitrage et la charge serveur | [0006](docs/adr/0006-slots-de-mouvement.md) |
| Époque 1940 | le matériel moderne est générique, celui de 1940 est iconique | [0007](docs/adr/0007-epoque-1940.md) |
| Combat par interception + rejeu, jamais de tour par tour | un combat interactif exige les deux joueurs présents : impossible en asynchrone | [0008](docs/adr/0008-combat-par-interception.md) |

**Deux idées gardées en réserve, explicitement** : l'auto-battler à plans (option B du combat) et
l'unité spéciale par nation. Les deux sont documentées, aucune n'est engagée.

---

## Ce que la simulation a prouvé

Détail : [rapport de simulation](docs/technique/rapport-simulation.md).

- **Les outils de soustraction sont vitaux.** Sans embargo, exposition et raid, la Domination gagne
  **72 %** des saisons ; avec, **33 %**. Aucun des trois n'est retirable pour simplifier.
- **Le temps de trajet décide tout, le temps de construction presque rien.** La question du « ratio »
  était mal posée. Réglage retenu : **14 min pour 1 000 km**.
- **Ce n'est pas une salle d'attente** : 1,19 décision par joueur et par heure, et le vainqueur ne
  prend définitivement la tête qu'à 90 % de la saison.
- **Les États-Unis sont cassés** : 20,8 % des victoires pour 12,5 % attendus, uniquement à cause de
  leur isolement géographique. C'est le seul 🔴 restant.

---

## Carte des fichiers

```
CLAUDE.md          ce fichier — l'état et les verrous
CONTEXT.md         le glossaire du domaine, et les termes bannis
QUESTIONS.md       ce qui n'est pas tranché, priorisé 🔴🟠🟡
README.md          point d'entrée orienté navigation

docs/design/       11 fiches, une par système ; 11 est le brief UI
docs/adr/          8 décisions structurantes et leur justification
docs/technique/    architecture, fan-out du brouillard, risques, rapport de simulation
prototypes/        carte-3d.html — autonome, s'ouvre dans un navigateur
simulation/        instrument de mesure, `node run.mjs`, sans dépendance
```

---

## Conventions

**Le vocabulaire est imposé** et listé dans `CONTEXT.md`. Dire *mouvement*, pas convoi. *Passe de
résolution*, pas tour de combat. Avant-poste *désactivé* ou *détruit*, jamais *pris*. Sont bannis :
tick, temps réel, micro, base, rush.

**Toute décision structurante devient un ADR**, avec sa section « ce qu'on abandonne ». C'est celle
qu'on oublie d'écrire et celle qui sert le plus.

**Aucun fichier vide.** Pas de `schema.md` en attente, pas de `TODO.md`. Une arborescence de coquilles
donne l'illusion d'avancer et se périme aussitôt.

**Les chiffres du design sont des placeholders** tant qu'ils n'ont pas été simulés. Les fiches le
disent explicitement ; ne pas les traiter comme des décisions.

---

## Pièges connus

**Ne jamais afficher ce que le joueur n'a pas le droit de voir.** Un mouvement adverse ne révèle ni
son type ni sa composition — sinon le leurre, le sabotage et l'espionnage perdent tout intérêt. Un
filtrage côté client se contourne en trois lignes de console.

**« Aucun tick serveur » est faux.** L'accumulation de ressources est bien paresseuse, mais cinq
mécaniques ont besoin d'une exécution datée. La formulation correcte : *pas de boucle globale, mais
un job planifié par événement*.

**Le brouillard est un problème serveur avant d'être un problème de rendu.** Une requête réactive
naïve se recalcule pour tous les joueurs à chaque mouvement. Il faut dénormaliser les fenêtres de
révélation à la création du mouvement.

**Le budget de contraste appartient à la couche de jeu.** Le plateau est désaturé exprès.

---

## Décalages connus entre les documents et le code

À jour au dernier passage, à corriger avant d'exploiter le simulateur pour de l'équilibrage fin :

- **`simulation/sim.mjs` reflète l'état d'avant la révision 1940.** Il fait jouer l'Italie avec un
  multiplicateur sur la ligne Escorte, alors que la fiche 06 lui donne désormais *Reconnaissance
  aérienne*. Le pouvoir italien actuel n'a donc **jamais été simulé** — et il touche au brouillard,
  que le simulateur ne modélise pas.
- Le simulateur ne modélise ni le brouillard, ni l'interception en vol, ni le Revanchisme. Ses
  limites sont listées dans `simulation/README.md` et ses mesures d'équilibre sont **optimistes**.

---

## Prochaine étape

Corriger l'avantage d'isolement géographique — le dernier 🔴. Piste notée : indexer le revenu de base
sur la distance moyenne aux autres joueurs, à l'inverse de ce que fait le curseur de compensation
aujourd'hui. **Un joueur que personne ne peut atteindre doit produire moins, pas plus.**

Ensuite seulement : le schéma de données, puis le code.
