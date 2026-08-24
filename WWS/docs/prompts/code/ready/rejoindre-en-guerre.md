# Prompt Claude Code — rejoindre une saison lancée (l'entrée en guerre)

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`. Ne commit pas, ne push pas.

## Pourquoi

Le jeu est asynchrone, mais le salon exige aujourd'hui que tout le monde soit là avant le
lancement : `seasons.join` refuse une saison `launched`. Entre amis, c'est la vraie friction —
et thématiquement, une nation qui entre en guerre en retard est du pur 1940-41.

Décisions de Pierre (24/08) : **on peut rejoindre à tout moment** tant que la saison n'est pas
conclue — aucun booléen, aucune fenêtre ; c'est un choix de phase de test, à revoir avant
d'ouvrir au-delà du cercle d'amis (le dire dans un commentaire au point d'entrée, pas dans une
option). Le retardataire reçoit **le kit de lancement tel quel** — pas de compensation, la
mesure viendra d'un cas réel. Le compte de la victoire **se recalcule** et l'entrée se lit
dans le journal.

## 1 — `seasons.join` accepte une saison lancée

`convex/seasons.ts` : `join` refuse `concluded` mais accepte `launched`. Le retardataire est
créé comme en salon (pseudo, token, ni nation ni doctrine), **sans être doté** : la dotation
attend son entrée en guerre (§3). `playableRegion` est **figée au lancement** et ne bouge
pas — un retardataire ne redessine pas le théâtre.

## 2 — La dotation extraite de `launch`

La boucle de dotation par joueur de `launch` (kit `startingStock`, QG au niveau du format sur
la capitale 1940, et rien d'autre — la fondation reste due, c'est le socle placé de l'ADR
0017) devient une fonction partagée, appelée par `launch` pour chaque joueur présent et par
l'entrée en guerre pour le retardataire. Une seule écriture de la dotation : si elle évolue,
les deux chemins évoluent ensemble.

## 3 — L'entrée en guerre (serveur + salon)

Nouvelle mutation (`enterWar` ou intégrée au flux existant) : le joueur d'une saison
`launched` qui a choisi nation et doctrine est doté (§2) et entre au plateau. Pas de
« prêt », pas de relance : le lancement a déjà eu lieu.

Côté client, `src/routes/salon.tsx` : sur une saison `launched`, un joueur **non doté** voit
le salon en mode « entrée en guerre » — choix parmi les nations libres **du théâtre figé**,
choix de doctrine, un bouton « entrer en guerre » à la place de « lancer ». S'il n'y a plus
de nation libre dans le théâtre, `join` refuse dès le départ avec une erreur claire, plutôt
qu'un salon sans choix possible. Un joueur déjà doté qui revient sur `/salon` d'une saison
lancée est renvoyé au plateau (comportement actuel conservé).

## 4 — La victoire recompte, le journal annonce

`convex/victory.ts` lit déjà les joueurs de la saison à l'évaluation — vérifie que le seuil
⌈(n−1)/2⌉ et la domination recomptent bien **au moment de l'évaluation** et non depuis un
n mémorisé au lancement. Un test le grave : une saison à 3 joueurs, un quatrième entre en
guerre, le seuil de scalps passe de 1 à 2.

À l'entrée en guerre, une manchette dans le journal de **tous** les joueurs : le pseudo, la
nation, l'heure — le style presse du journal existant. Un joueur qui ouvre son journal doit
apprendre qu'un nouveau belligérant est entré, sans autre canal.

## Vérifications

Tests sur : join accepté sur `launched`, refusé sur `concluded` ; dotation du retardataire
identique à celle du lancement (mêmes tables, mêmes montants, fondation due) ; plus de
nation libre dans le théâtre → refus au join ; seuil de victoire recompté. `npm run
verifier` complet.
