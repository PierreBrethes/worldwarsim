# ADR 0042 — Des bots faciles, en local, par la porte d'un joueur

**Statut :** acceptée (21/11/2026). Demande de Pierre : lancer en local une Mondiale contre une ou
plusieurs « IA » faciles qui produisent, bâtissent, ravitaillent, avancent sur les régions voisines
et défendent leur QG ; son go sur le plan du 21/11 (« Vas-y, lance le plan »). **Mondiale seule.**

**Révise** ADR 0027 (« aucun bot en Mondiale ») : des bots en local, jamais sur un backend distant.

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
