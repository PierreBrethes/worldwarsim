# objectifs-neutres — lot 1 : la garnison locale et le dépôt

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, **`propositions/objectifs-neutres.md`**
(lot 1 seulement : garnison + dépôt ; la capture est le lot 2), l'ADR 0019 §3 (une force posée
qui défend et n'ordonne jamais rien), l'ADR 0014, `convex/seasons.ts` (`launch`, `endow`),
`convex/movement/forces.ts` (`defenceOf`, `postedForces`), `convex/movements.ts` (attaque sur
un point), `src/domain/world.ts` (régions, pôles, pays), `convex/schema.ts` (`players`,
`troops`), `convex/press.ts` (ce qui compte un joueur). **Suppose `pillage-et-butin` livré** —
le dépôt se ramène par `loot` et le retour. Ne commit pas, ne push pas. Un chantier, un commit.

## La règle

Au lancement, la saison pose **`OBJECTIVES_PER_SEASON`** objectifs (`@a-mesurer` : 2 à 3 joueurs,
3 au-delà) sur des régions de **pays sans siège**, choisies pour être **entre** les joueurs (parmi
les régions neutres, celles qui maximisent la distance au QG le plus proche tout en restant à
moins de `OBJECTIVE_MAX_KM` (`@a-mesurer`, 1 500) d'au moins deux QG). Chaque objectif = une
**garnison locale** (une force posée, neutre, qui défend et ne bouge jamais) + un **dépôt** (un
stock posé : alliage, munitions, pétrole — `OBJECTIVE_DEPOT`, `@a-mesurer`). L'objectif est
**public** (dépêche à tous au lancement, marqueur sur la carte pour tous) ; **la garnison qui le
tient ne l'est pas** (brouillard : on sait où aller, pas ce qu'on y trouvera — un relevé la
révèle comme toute troupe posée). Le premier qui **réduit** la garnison prend le dépôt : sa
colonne le porte (`loot`, capacité) et rentre (retour discret, même mécanique que le pillage).
Récompense en ressources et positions seulement — jamais un multiplicateur.

## Ce qui change

1. **Le siège neutre** : un `players` par saison avec `irregular: true` (nation `null` — le
   validateur l'admet pour ce seul cas), créé au `launch`, **exclu** de `previews`, `lobby`,
   `standingsOf`, `press`, `freeNations`, de la victoire et de `fondateur-absent`. Ses troupes
   sont des `troops` ordinaires posées sur le point de l'objectif (`stationedAt: point`),
   infanterie MK1 × `OBJECTIVE_GARRISON` (`@a-mesurer`, 3), munitions dotées, **sans
   entretien** (pas de nourriture à consommer — `upkeep` ignore le siège irrégulier). Elles ne
   se déroutent pas vers un ravitaillement : réduites, elles disparaissent.
2. **Table `objectives`** `{ seasonId, regionId, point, depot: Record<ResourceKey, number>,
   status: 'standing' | 'taken', takenBy, takenAt }`, dans `GAME_TABLES`. Index `bySeason`.
3. **Prendre** : un ordre **attaque** sur le point de l'objectif (cible `objective` dans la table
   des ordres, réservée à une colonne qui compte de l'infanterie — celle qui porte). L'arrivée
   engage la garnison locale comme toute défense (`defenceOf` la voit : c'est une force posée
   du siège irrégulier). Gagné → le dépôt entre dans `loot` (écrêté par la capacité, le reste
   **reste au sol** pour le suivant — `objectives.depot` décrémenté), retour créé vers mon
   territoire, `status: 'taken'` quand le dépôt est vide. Perdu → la garnison reste, moins ses
   pertes ; **elle ne se renforce jamais**.
4. **Public** : `playerView.objectives[]` pour tous : `{ regionId, point, status, depot restant
   par ressource }` — jamais la garnison. Dépêches : `objectiveRevealed` à tous au lancement
   (« réserves abandonnées signalées en <pays> »), `objectiveTaken` à tous quand le dépôt est
   vide (« les réserves de <pays> ont été enlevées » — sans nommer le preneur : la presse le
   dira par son score), plus les dépêches de butin existantes pour le preneur.
5. **Carte** : un marqueur d'objectif (pictogramme caisse, encre neutre), popin qui lit le dépôt
   restant et l'état ; la rose en visée offre « attaquer » comme sur toute troupe adverse
   relevée — pas de branche nouvelle si la cible est un point. Habillage : « forces
   irrégulières », « réserves abandonnées » (`fr.objectives.*`), jamais « barbares ».

## Ce que ce prompt ne fait pas

Pas de capture (lot 2 : tenir X heures pour un gisement). Pas de renforcement de la garnison.
Pas de génération en cours de saison. Rien dans le simulateur.

## Cas d'acceptation (tests d'abord)

1. `launch` à 2 joueurs crée 2 objectifs sur des régions de pays sans siège, chacune à moins de
   1 500 km de deux QG, jamais sur le sol d'un joueur ; à 4 joueurs, 3.
2. Le siège irrégulier n'apparaît ni dans `previews`, ni dans la presse, ni dans `standingsOf`,
   ni dans `freeNations` ; `fondateur-absent` l'ignore comme doyen.
3. Une colonne sans infanterie → refus lisible ; avec, l'attaque engage la garnison ; victoire →
   `loot` = min(dépôt, capacité), le reste au sol, dépêche à tous quand vide.
4. Deux joueurs qui arrivent à une heure d'écart : le second trouve la garnison réduite de ce
   que le premier a tué, et le dépôt de ce qu'il a emporté.
5. `playerView.objectives` ne contient aucune troupe ; un relevé révèle la garnison comme une
   troupe posée ordinaire (sans nation — le siège irrégulier n'en a pas : la phrase de relevé
   tient sans nation, vérifie `fr.journal`).
6. `upkeep` ne débite rien pour le siège irrégulier ; `destroy` purge `objectives`.

`npm run verifier` vert. `a-mesurer.md` régénéré. `CLAUDE.md`, `WWS/CONTEXT.md` (garnison
locale, dépôt, objectif), `RESTE-A-CODER.md` (10 livré, lot 1).
