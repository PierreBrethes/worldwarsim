---
type: index
statut: périmé
maj: 2026-10-02
code: []
decisions: [ADR 0001, ADR 0020]
voir: [INDEX.md, CLAUDE.md, QUESTIONS.md, docs/design/01-vision-et-format.md]
---

# WorldWarSim

**En bref.** Le pitch du jeu et ce qu'il n'est pas — ces deux sections font autorité. Pour
trouver une note, [INDEX.md](INDEX.md) ; pour l'état du code, le `CLAUDE.md` à la racine du dépôt.
Le tableau « Par où commencer » reste un raccourci.

**En retard** (vérifié le 02/10/2026) :
- « Saison de 48 h à 7 jours » — vrai : le format de saison a disparu (ADR 0020 §11).
- « Par où commencer » renvoie au [rapport de simulation](docs/technique/rapport-simulation.md)
  comme mesure vivante — vrai : il décrit le simulateur v1, mort le 06/09.
- « Stack visée » : « Rien n'est engagé côté backend tant que la simulation n'a pas tourné » —
  vrai : Convex tourne en production sur le VPS, et le jeu se joue.

Jeu de stratégie web asynchrone sur une carte du monde réel. Saison de 48 h à 7 jours, wipe complet
à la fin, 2 à 8 joueurs. Chaque joueur prend une nation avec un pouvoir qui casse une règle du jeu.

**État actuel** : celui du code est dans le `CLAUDE.md` à la racine du dépôt, celui de la doc dans [INDEX.md](INDEX.md).

## Par où commencer

| Tu veux… | Va voir |
|---|---|
| comprendre le jeu en 5 minutes | [docs/design/01-vision-et-format.md](docs/design/01-vision-et-format.md) |
| comprendre *pourquoi* c'est comme ça | [docs/adr/](docs/adr/README.md) |
| voir la carte tourner | [prototypes/carte-3d.html](prototypes/carte-3d.html) |
| savoir ce qui n'est pas tranché | [QUESTIONS.md](QUESTIONS.md) |
| lancer une passe de design | [docs/design/11-brief-ui.md](docs/design/11-brief-ui.md) |
| peupler des maquettes | [simulation/README.md](simulation/README.md) — l'état de référence s'exporte d'une vraie saison |
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

Elle est dans [INDEX.md](INDEX.md), une section par domaine et une ligne par note.

## Stack visée

React + three.js en front (prototype carte déjà validé), Convex en backend, VPS perso.
Rien n'est engagé côté backend tant que la simulation d'équilibrage n'a pas tourné.
