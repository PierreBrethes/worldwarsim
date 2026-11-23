# ADR 0042 — Des bots faciles, en local, par la porte d'un joueur

**Statut :** acceptée (21/11/2026). Demande de Pierre : lancer en local une Mondiale contre une ou
plusieurs « IA » faciles qui produisent, bâtissent, ravitaillent, avancent sur les régions voisines
et défendent leur QG ; son go sur le plan du 21/11 (« Vas-y, lance le plan »). **Mondiale seule.**

**Révise** ADR 0027 (« aucun bot en Mondiale ») : des bots en local, jamais sur un backend distant.

> **Précisée le 23/11/2026 (#625).** Le bot prend aussi les points stratégiques neutres : une envie
> `WANT_POINT` envoie toute une escouade d'au moins `BOT_POINT_COLUMN` infanteries (de quoi battre la
> garnison de l'ADR 0043), par `movements.capture` et la porte `captureOrderRefusalOf`. Une
> nation insulaire (Royaume-Uni, Japon) n'a aucune route à pied vers un point ni une région
> étrangère : elle restait immobile jusqu'à #631 (ci-dessous). L'armée qui compte contre la cible de
> recrutement exclut la garnison des avant-postes. Un camp perdu de vue ne retient plus rien : le bot
> ne réagit pas à ce qu'il ne voit plus. Tant qu'un point neutre est joignable et que l'armée libre
> n'a pas atteint sa cible, l'avance laisse les escouades de moins de neuf former la colonne.

> **Précisée le 23/11/2026 (#631) : le bot insulaire prend la mer, aller simple.** Une nation est
> insulaire quand aucune des cinq régions étrangères les plus proches de son QG ne se joint à pied
> (`isInsular`) ; elle prend la mer tant qu'un point neutre est visible. Chaîne, chaque maillon par
> les refus du joueur : un port (la côte nationale, jusqu'à 300 km du QG, dont la route de mer
> vers un point neutre est la plus courte, car le plein du cargo, six crans de 500 km, borne la
> traversée), un cargo formé au port, la colonne de `BOT_POINT_COLUMN` fantassins qui y monte
> (`movements.board`), le cargo qui part (`movements.marchTo`) vers la plage la plus proche du point
> que la route de mer et le plein acceptent, puis `movements.disembark` ; la colonne prend ensuite le
> point comme les autres, à pied. Sans escorte, retour ni ravitaillement par mer : le cargo reste sur
> la plage, et le bot en forme un autre pour une seconde traversée. Ce qui manque se dit dans le
> journal du script (`seaWaiting`) et le bot attend ; il ne construit ni ne recrute que ce que le bot
> facile fait déjà (port, cargo), jamais de recherche. Un point que la grille noie (Hong Kong) se
> prend d'une plage voisine, sans route à pied. Rien ne change pour un bot continental.

## Contexte

Aucun bot n'existe. Le simulateur d'ouverture, qui jouait contre un modèle et non contre Convex,
est retiré depuis le 17/10 (`WWS/simulation/README.md`). Le registre (15/09, points 6 à 8) notait
déjà qu'un bot est un client qui pose des mutations, et que des niveaux d'IA sont prématurés tant
qu'aucun bot ne tient une saison.

Trois familles éprouvées pour un adversaire simple :

- **Règles par priorités** (script, petite machine à états) : simple, prévisible, se débogue en
  lisant la liste ; défaut connu, ses habitudes se lisent.
- **Arbre de comportement** : range de nombreuses transitions, mais un grand arbre se maintient mal.
- **IA utilitaire** (Dave Mark, IAUS) : chaque action notée de 0 à 1, la meilleure gagne ;
  souple, mais longue à régler et ses comportements émergents se déboguent mal.

## Décision

1. **Un bot est un joueur.** Il a un compte (`Bot1`…`BotN`), une session, une place ; il lit sa
   `PlayerView` (`api.view.playerView`) et passe ses ordres par les mutations publiques, donc par
   `playerOf` puis `requirePlayable`. Il ne lit jamais `GameState`, n'a ni `internal*` ni `dev:*`
   pendant la partie, et le serveur ne sait pas qu'il joue contre un bot.
2. **Règles par priorités, notées.** Chaque passage, des règles simples rendent chacune une
   **envie** (0 rien, jusqu'à 100 normal, au-delà urgence, à la manière des *want* de Freeciv) et
   un ordre candidat ; le bot joue les plus fortes. Défendre un QG menacé passe en urgence.
3. **Aucune règle à part.** Le décideur est une fonction pure de `src/domain/` qui ne propose
   qu'un ordre que le `*RefusalOf` du domaine accepte sur la même vue ; un ordre que le serveur
   refuse quand même est oublié, jamais réessayé en boucle.
4. **En local seulement.** Le pilote est un script Node (`scripts/`) qui refuse tout backend non
   local, comme `scripts/demo-mondiale.mjs`. Rien n'en part en pré-prod ni en prod.
5. **Facile par le rythme.** Un bot facile joue peu de coups par passage et peu souvent ; la
   difficulté n'est pas un réglage de règle. Un seul niveau.

## Conséquences

- Une Mondiale de test se joue seul, et le bot sert de banc fonctionnel : un ordre refusé qu'il
  croyait légal montre un écart entre le domaine et le serveur.
- Le bot ne lit que ce qu'un joueur voit : il ne peut pas tricher, et son jeu reste pauvre.
- Chaque nouvelle mutation de jeu est un geste que le bot ignore tant qu'une règle ne la joue pas.

## Ce qu'on abandonne

- L'arbre de comportement et l'IA utilitaire à courbes : trop pour un bot facile ; les envies
  notées s'y prêtent plus tard sans réécriture.
- Un bot côté serveur (action planifiée) : il échapperait à la porte d'un joueur.
- Les bots en ligne, le remplacement d'un joueur absent et les niveaux d'IA : chantiers à part.
