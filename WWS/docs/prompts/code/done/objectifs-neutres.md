# objectifs-neutres — lot 1 : la palette, les paliers, la répartition par joueur

Lis `CLAUDE.md`, `CONVENTIONS.md`, `WWS/CONTEXT.md`, **`propositions/objectifs-neutres.md`**
(l'idée, les garde-fous), l'ADR 0019 §3 (une force posée qui défend et n'ordonne jamais rien),
l'ADR 0014 révisée le 16/09 (résolution simultanée), l'ADR 0024 (l'attaque ne vise qu'un objet
relevé — **sauf** l'objectif, public par nature, voir §3), `convex/seasons.ts` (`launch`,
`endow`), `convex/movement/forces.ts` (`defenceOf`, `postedForces`), `convex/movement/orders.ts`
(`aimOf`, la branche `camp`), `src/domain/movement-orders.ts` (`refusalOf`, `nothingToAttack`),
`convex/regions.ts` (`regionFacts`, `capitalRegionOf`), `convex/regionGeometry.ts`,
`src/domain/loot.ts` et `convex/plunder.ts` (le butin, le retour chargé), `src/domain/labels.ts`
(`LabelPictogram`), `src/emblems/buildings/manifest.ts` (le modèle d'un manifeste de planches
neutres), `convex/press.ts` (ce qui compte un joueur). Ne commit pas, ne push pas. Un chantier,
un commit.

> **Réécrit le 17/09** sur les décisions de Pierre (16-17/09) : plusieurs objectifs, partout,
> répartis par joueur ; des **paliers** de garnison (blindés compris) avec une récompense qui
> suit ; une **palette** d'archétypes dont chaque saison tire une partie ; un **pictogramme par
> archétype**. La règle « 2 à 3 par saison, à moins de 1 500 km de deux QG » de la version du
> 06/09 est abandonnée : simulée sur les 4 589 régions, elle ne plaçait rien hors d'Europe.

## La règle

Au lancement, la saison pose des **objectifs** sur des régions de **pays sans siège**. Un
objectif = un **archétype** (sa garnison, son dépôt, son pictogramme, son nom 1940) posé sur une
région. La garnison est une force neutre posée qui **défend et ne bouge jamais** ; le dépôt est
un stock posé (alliage, munitions, pétrole) que **le premier qui réduit la garnison** emporte —
borné par la capacité de sa colonne, le reste **reste au sol** pour le suivant. L'objectif est
**public** (dépêche à tous au lancement, marqueur sur la carte pour tous, dépôt restant lisible) ;
**la garnison ne l'est pas** (on sait où aller, pas ce qu'on y trouvera — un relevé la révèle
comme toute troupe posée). Elle ne se renforce jamais, ne se déroute pas, ne mange pas.
Récompense en ressources seulement — jamais un multiplicateur (piliers).

### La palette (données, pas code)

`OBJECTIVE_ARCHETYPES` dans `convex/constants.ts`, **quatre entrées en V1**, toutes `@a-mesurer`
(mesure nommée : par archétype, combien réduits au jour 7, et combien ont vu deux joueurs en
24 h) :

| clé | nom 1940 (`fr.objectives.*`) | palier | garnison | dépôt |
|---|---|---|---|---|
| `abandonedStores` | réserves abandonnées | facile | 2 × infanterie MK1 | 60 alliage |
| `stalledConvoy` | convoi immobilisé | moyen | 3 × infanterie MK1 | 150 alliage · 40 munitions |
| `fuelDump` | dépôt de carburant | moyen | 3 × infanterie MK1 | 150 alliage · 60 pétrole |
| `irregularArsenal` | arsenal irrégulier | dur | 2 × infanterie MK1 + 1 × blindé MK1 | 300 alliage · 80 munitions |

Le code ne connaît que la forme (`{ key, tier: 'easy' | 'medium' | 'hard', garrison:
ReadonlyArray<{ role, tier }>, depot: Costs }`) : ajouter un archétype est une ligne de table
et une planche, jamais une branche.

### La répartition (§ « peu et disputés », révisé : peu de *durs*, et disputés)

Pour chaque siège : **2 objectifs proches** — régions de pays sans siège à moins de
`OBJECTIVE_NEAR_KM` (1 000, `@a-mesurer`) de son QG, tirées parmi les archétypes *facile* et
*moyen*, à plus de `OBJECTIVE_SPREAD_KM` (300) l'une de l'autre. Puis **1 objectif dur par paire
de voisins** (les deux QG les plus proches l'un de l'autre, chaque siège au plus dans deux
paires, plafond `OBJECTIVE_HARD_MAX` = 4) : la région de pays sans siège qui **minimise la plus
grande des deux distances** aux deux QG, avec `d₁ ≥ 0,75·d₂` (équitable) et `d₁ ≥ 800 km`
(un détour, pas un sprint). Distances **de route sur la grille** (`convex/routes.ts`), pas à vol
d'oiseau — si aucune route terrestre n'existe entre les deux QG (un océan), la paire n'a pas
d'objectif dur et la dépêche de lancement le dit (« aucune réserve signalée entre X et Y »).
Le calcul de route au lancement (un Dijkstra par QG, multi-cibles) peut dépasser le budget
d'une mutation : si c'est le cas, `launch` planifie la pose dans un job immédiat
(`objectives.place`), et la saison est jouable avant que les dépêches tombent.
Aucun objectif sur le sol d'un siège, jamais deux sur la même région, jamais sur la région
d'une capitale. À 4 joueurs : 8 proches + jusqu'à 4 durs.

## Ce qui change

1. **Le siège irrégulier** : un `players` par saison avec `irregular: true` (nation `null`, le
   validateur l'admet pour ce seul cas), créé au `launch`, **exclu** de `previews`, `lobby`,
   `standingsOf`, `press`, `freeNations`, de la dominance, du doyen (`fondateur-absent`) et de
   l'entretien (`upkeep` l'ignore). Ses troupes sont des `troops` ordinaires posées sur le point
   de l'objectif (`stationedAt: point`), composées par l'archétype, munitions dotées, sans
   ravitaillement : réduites, elles disparaissent.
2. **Table `objectives`** `{ seasonId, key, regionId, point, depot: Costs, status: 'standing' |
   'taken', takenAt }` dans `GAME_TABLES`, index `bySeason`. Le point est le pôle de la région
   (`regionFacts`), comme tout ce qui se pose sur une région.
3. **Prendre** : cible `{ kind: 'objective'; objectiveId; lon; lat; hostCountry }` dans
   `MovementAim`, acceptée par `refusalOf('attack')` **sans relevé** (l'objectif est public —
   c'est l'exception nommée à l'ADR 0024 §4, à écrire en bannière dans l'ADR), réservée à une
   colonne qui compte de l'infanterie (elle porte) ; branche `aimOf` à côté de `camp` ; la rose
   offre « attaquer » sur le marqueur, avec et sans pile armée (sans pile : le motif « une
   colonne doit y marcher »). L'arrivée engage la garnison (`engageAt`, ce qui se tient à
   `ARRIVAL_RADIUS_KM` du point). Gagné → le dépôt entre dans `loot` (écrêté par la capacité),
   `objectives.depot` décrémenté, retour créé vers mon territoire (mécanique du pillage) ;
   `status: 'taken'` quand le dépôt est vide. Perdu → la garnison reste, moins ses pertes.
4. **Public** : `playerView.objectives[]` pour tous : `{ id, key, regionId, point, status, depot
   restant }` — jamais la garnison. Dépêches : `objectiveRevealed` à tous au lancement, une par
   objectif (« <nom 1940> signalé en <pays> »), `objectiveTaken` à tous quand le dépôt est vide
   (sans nommer le preneur), plus les dépêches de butin existantes pour le preneur.
5. **Carte** : un marqueur par objectif, **planche par archétype** (`src/emblems/objectives/
   manifest.ts` sur le modèle des bâtiments, `null` tant que la planche manque → cadre pointillé
   avec le nom, jamais une image cassée), encre neutre, `LabelPictogram` gagne `'objective'` ;
   popin : nom 1940, palier (le mot, jamais la composition), dépôt restant, état. Le pictogramme
   se pose au bout d'un mât comme un bâtiment.
6. **Textes** `fr.objectives.*` : les quatre noms, les paliers (« forces irrégulières légères /
   organisées / retranchées »), les dépêches. Jamais « barbares ».

## Ce que ce prompt ne fait pas

Pas de capture au seuil tenu (lot 2). Pas de renfort ni de génération en cours de saison. Pas
d'objectif mobile. Rien dans le simulateur. Les planches elles-mêmes viennent par
`prompts/images/objectifs.md` — le manifeste les attend à `null`.

## Cas d'acceptation (tests d'abord)

1. `launch` à 4 sièges (France, UK, Allemagne, URSS) : 8 objectifs proches (2 par siège, ≤ 1 000
   km de route de son QG, ≥ 300 km entre eux, jamais sur un sol de siège ni une capitale) + ≤ 4
   durs, chacun à `d₁ ≥ 800`, `d₁ ≥ 0,75·d₂` ; à 2 sièges séparés par un océan (Japon, USA) :
   4 proches, 0 dur, dépêche « aucune réserve signalée entre … ».
2. Le siège irrégulier n'apparaît ni dans `previews`, ni dans la presse, ni dans `standingsOf`,
   ni dans `freeNations` ; `upkeep` ne lui débite rien ; `fondateur-absent` l'ignore.
3. Colonne sans infanterie → refus lisible ; avec 3 infanteries contre *réserves abandonnées*
   (2 inf) → gagné, `loot` = min(60, capacité) ; contre *arsenal irrégulier* sans blindé ni MK2
   → perdu, la garnison reste moins ses pertes ; un second joueur une heure après trouve la
   garnison réduite et le dépôt entamé.
4. `playerView.objectives` ne contient aucune troupe ; un relevé révèle la garnison comme une
   troupe posée ordinaire, sans nation (vérifie la phrase de `fr.journal`).
5. La rose sur un marqueur d'objectif : « attaquer » avec une pile armée ; le motif sans.
6. `destroy` purge `objectives` ; `OBJECTIVE_ARCHETYPES` a un test d'invariant (clés uniques,
   dépôt > 0, garnison non vide, une planche ou `null` par clé).
7. `npm run verifier` vert. `a-mesurer.md` régénéré. `CLAUDE.md`, `CONTEXT.md` (objectif,
   archétype, garnison locale, dépôt), `RESTE-A-CODER.md` (11 livré, lot 1), ADR 0024 (bannière
   de l'exception « objectif public »).
