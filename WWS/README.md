# WorldWarSim

Jeu de stratégie web asynchrone sur une carte du monde réel. Saison de 48 h à 7 jours, wipe complet
à la fin, 2 à 8 joueurs. Chaque joueur prend une nation avec un pouvoir qui casse une règle du jeu.

**État actuel : design. Aucune ligne de code de jeu n'est écrite, et c'est délibéré.**

## Par où commencer

| Tu veux… | Va voir |
|---|---|
| comprendre le jeu en 5 minutes | [docs/design/01-vision-et-format.md](docs/design/01-vision-et-format.md) |
| comprendre *pourquoi* c'est comme ça | [docs/adr/](docs/adr/README.md) |
| voir la carte tourner | [prototypes/carte-3d.html](prototypes/carte-3d.html) |
| savoir ce qui n'est pas tranché | [QUESTIONS.md](QUESTIONS.md) |
| lancer une passe de design | [docs/design/11-brief-ui.md](docs/design/11-brief-ui.md) |
| peupler des maquettes | [simulation/ETAT-REFERENCE.md](simulation/ETAT-REFERENCE.md) |
| savoir ce qui va faire mal à coder | [docs/technique/risques.md](docs/technique/risques.md) |
| voir ce que la simulation a mesuré | [docs/technique/rapport-simulation.md](docs/technique/rapport-simulation.md) |

## Le pitch en trois lignes

Ce n'est pas un jeu de « faire une grosse armée ». C'est un jeu de **projection de force sur une
planète où l'information est chère et où tout engagement est irréversible pendant N minutes**.

Tu ne vois pas les mouvements adverses. Tu paies pour les voir. Et quand ton armée est en route,
elle ne défend plus rien.

## Ce que le projet n'est pas

Une clarification qui a coûté une discussion entière, gardée ici pour ne pas y revenir :

- **Ce n'est pas un RTS.** Aucun contrôle d'unité en temps réel, aucune boucle de jeu serveur.
- **Ce n'est pas Advance Wars.** Pas de couche tactique sur grille. C'est un skin, pas un genre.
- **Ce n'est pas Rise of Kingdoms.** Pas de free-to-play, pas de timers monétisés, pas de guilde.

C'est, structurellement, **un Ogame/Travian sur carte du monde, avec du brouillard de guerre**.
Assumer cette phrase permet de couper 80 % du travail sans rien perdre du plaisir visé.

## Arborescence

```
docs/design/      les systèmes de jeu, une fiche par système
docs/adr/         les décisions structurantes et leur justification
docs/technique/   architecture, points chauds, registre de risques
prototypes/       ce qui tourne déjà
simulation/       le simulateur de saison et ses résultats
QUESTIONS.md      ce qui n'est pas tranché
CONTEXT.md        le vocabulaire du domaine
```

## Stack visée

React + three.js en front (prototype carte déjà validé), Convex en backend, VPS perso.
Rien n'est engagé côté backend tant que la simulation d'équilibrage n'a pas tourné.
