# Objectifs neutres — le PVE qui fabrique du PVP (proposition, 29/08/2026)

**Idée de Pierre (29/08)** : des régions tirées au hasard sur les pays non-joueurs portent des
objectifs — capturer un site, réduire une garnison locale — dont la récompense sert le PVP.
Constat partagé : le jeu ne pousse pas à l'adversité — attaquer ne rapporte rien tant que le
pillage (QG 4) n'existe pas.

## Pourquoi c'est mieux que ça en a l'air

1. **Le moteur existe déjà.** Une « troupe PNJ », c'est une force posée qui défend son sol et
   n'ordonne jamais rien — la définition mot pour mot de l'ADR 0019 §3. Zéro IA : une
   garnison neutre posée à la génération, le combat séquentiel (ADR 0014) fait le reste.
   Coût de code minimal pour un système qui a l'air gros.
2. **C'est le pillage sans la politique.** « Que devient un QG frappé » (🟠) bloque le pillage
   entre joueurs. Un dépôt neutre, lui, se pille sans poser la question : l'objectif neutre
   est le **banc d'essai de la boucle « attaquer rapporte »**, mesurable au skirmish suivant,
   avant d'ouvrir le front joueur-contre-joueur.
3. **Le PVE ne crée de l'adversité que s'il est rare et disputé.** Le piège (Rise of Kingdoms) :
   des barbares partout et les joueurs s'évitent en farmant chacun son coin. Garde-fous :
   **peu d'objectifs** (2-3 par saison à 4 joueurs), **annoncés publiquement** (dépêche à
   l'apparition — tout le monde sait, tout le monde peut converger), placés **entre** les
   joueurs (la génération vise l'équidistance, pas le hasard pur), et la récompense doit
   compter **contre les joueurs** — sinon le détour ne vaut pas le risque de croiser quelqu'un.

## Les objets, au plus simple

- **La garnison locale** : une force neutre posée sur une région non-joueur. La réduire =
  l'objectif « tuer une troupe pnj ». Elle défend (initiative au posé), ne bouge jamais.
- **Le dépôt** : un stock (alliage, munitions, pétrole) sur la région, pris par le vainqueur —
  ramené par la colonne, comme un vrai pillage.
- **La capture** : tenir la région X heures (le pattern « seuil tenu » déjà en file pour la
  victoire) pour un effet durable — à trancher : gisement bonus tant qu'on le tient (se lit
  comme l'extraction à l'étranger existante, pillable comme elle), plutôt qu'un buff de stats
  (« les bonus cassent une règle » — un gisement est une règle existante, pas un bonus).

## Contraintes de corpus

- Récompenses en **ressources et positions**, jamais en multiplicateurs de combat.
- Aucune quantité en régions (ADR 0015) : le dépôt est un stock posé, la capture un gisement.
- Vocabulaire : *garnison locale*, *dépôt*, jamais « camp de barbares » ; habillage 1940
  (« forces irrégulières », « réserves abandonnées »).
- Brouillard : l'objectif est public (dépêche), la garnison qui le tient ne l'est pas — on
  sait où aller, pas ce qu'on y trouvera. L'écoute garde sa valeur jusque sur le PVE.

## Séquence proposée

1. Design fin après les mesures du prochain test (tailles de garnison → simulateur, dépôts →
   `@a-mesurer`).
2. Lot 1 : garnison + dépôt (la boucle « réduire → ramener »). Lot 2 : capture au seuil tenu.
3. Le pillage entre joueurs (QG 4) hérite des chiffres mesurés ici.
