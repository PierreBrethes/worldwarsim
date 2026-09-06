# Le classement — barème et mécanique (spécification, 06/09/2026)

> **Révision du 06/09 au soir (décision 80, sur maquette).** Le score général des autres est
> **exact**, plus en tranche — ⚠ révise la décision 43 du 31/08 et le principe du 29/08 (« pour
> les autres, un ordre de grandeur »), en connaissance de cause : ce que le brouillard protège,
> c'est *où* est la force, jamais *combien* (ADR 0020 §4 : le score est public, la carte ne
> l'est pas). Ce qu'un score exact laisse filtrer entre deux éditions — « quelqu'un a dépensé
> 95 d'alliage », « quelqu'un a perdu un blindé » — est une **rumeur**, pas un relevé : elle
> dit qu'il s'est passé quelque chose, jamais où ni à qui. C'est la « dépêche publique
> anonyme » que l'audit du 25/08 réclamait, obtenue gratuitement. Cadence portée à **3 h**
> (`PRESS_EDITION_HOURS = 3`) ; l'heure du relevé s'imprime en manchette. Industrie et militaire
> restent **privés** (servis pour soi seulement) : le général se lit, il ne se décompose pas.

Précise [[page-de-presse-et-scores]] (29/08, ajustée le 31/08 — décision 43 : édition toutes
les 2 h, territoire public et exact, industrie et militaire en tranches pour les autres, faits
d'armes publics et exacts). Ne relitige rien : la victoire reste territoriale (ADR 0020 §9), le
classement raconte. Ce document fixe **ce qui se compte, avec quels poids, quand, et ce que
chacun voit** — assez pour un prompt code.

## 1. Le principe du barème : l'alliage investi, aucune table nouvelle

Trois catégories chiffrées + le territoire. Les trois se mesurent **en alliage payé**, lu dans
les tables qui existent (`BUILDING_SPEC` × `LEVEL_COST_FACTOR`, `COST_BY_ROLE`, `TIER_2_FACTOR`).
Pas de grille de points par bâtiment ni par rôle : une seconde table d'équilibrage dériverait de
la première et se désaccorderait. « Ce qui coûte compte » — le joueur lit le classement avec les
chiffres qu'il connaît déjà (l'abaque, la rose).

| Catégorie | Mesure | Source | Précision pour les autres |
|---|---|---|---|
| **Territoire** | part du théâtre, en % : régions tenues ÷ **total des régions tenues par quelqu'un** (ADR 0020 §2 — les parts somment à 100) | `control.held` → `heldRegions` | **exacte** (§4) |
| **Industrie** | Σ sur les bâtiments debout de Σ(alliage de `buildCost(key, l)` pour l = 1..niveau) | `buildings`, `buildCost` | **jamais servie** (soi seulement) |
| **Puissance militaire** | Σ sur les troupes (posées, en garnison, en mouvement — la file non) de `COST_BY_ROLE[role].alloy × (tier 2 ? TIER_2_FACTOR : 1) × currentStrength ÷ nominalStrength` | `troops` | **jamais servie** (soi seulement) |
| **Faits d'armes** | nombre d'engagements où le joueur était attaquant ou défendeur, cumulatif, jamais décrémenté | `engagements` | **exact** (activité, pas renseignement) |

Un bâtiment **désactivé** (avant-poste désactivé, ADR 0020 §7) compte à zéro tant qu'il l'est ;
l'avant-poste lui-même ne compte pas (il n'a pas de coût en `BUILDING_SPEC`, il a un entretien).
Une troupe en déroute compte à sa force courante — elle rentre (règle 3). Les sommes s'arrondissent à l'entier après addition.

**Score général** (le seul chiffre servi aux autres, avec le territoire — **exact**, décision 80) :
`général = industrie + militaire` — en alliage, sans coefficient. Les faits d'armes n'y entrent
pas (un compteur d'activité additionné à de l'alliage n'a pas d'unité) ; le territoire non plus
(il est déjà public et exact à côté, et c'est le but, pas un ingrédient).

## 2. ~~Les tranches~~ — abandonnées le 06/09 (décision 80)

*Conservé pour mémoire ; rien de ceci ne se code.*

Les autres lisent industrie, militaire et général **en tranche**, jamais en valeur. Tranche =
**puissance de deux de l'alliage**, bornes en clair : `< 250 · 250-500 · 500-1 000 · 1 000-2 000 ·
2 000-4 000 · 4 000-8 000 · > 8 000`. Pourquoi géométrique : au lancement (500 de dotation) une
tranche vaut une fondation, en fin de saison elle vaut une armée — l'incertitude reste
proportionnelle, l'écoute et le relevé gardent leur valeur à tous les stades. `@a-mesurer`
(largeur : le facteur 2 est une hypothèse).

Habillage presse (fr) : « estimations de nos correspondants — entre 1 000 et 2 000 » ; pour
soi : « selon nos propres registres — 1 340 ». Les libellés sont des clés `fr.press.*`.

## 3. L'édition

- Un job planifié serveur, **toutes les `PRESS_EDITION_HOURS = 3`** depuis `launchedAt`, replanifié
  par lui-même (comme `resumeQueues`), gardé par `seasonStillPlays`. La première édition paraît à
  `launchedAt + 3 h` — pas au lancement (rien à dire).
- Chaque édition **écrit une ligne par joueur** dans une table `editions`
  (`seasonId, playerId, at, territory, industry, military, deeds, general`) — les valeurs
  exactes, jamais les tranches (la tranche est une lecture). Table par saison, purgée par
  `destroy` (comme `GAME_TABLES`). Index `bySeasonAt`.
- Le calcul est une fonction pure `src/domain/standings.ts` : `(buildings, troops, engagements,
  held) → scores` — testable sans base. Le job ne fait que lire et écrire.
- **Jamais en direct** : `playerView` sert la **dernière édition** seulement, pas un recalcul.
  Entre deux éditions, le classement ne bouge pas — c'est le point du §1 de la proposition.
- Volume : 8 joueurs × 8 éditions/jour × 7 j = 448 lignes. Rien à borner.

## 4. Ce que chacun lit

**Fenêtre Nation (soi)** — les quatre chiffres exacts + le général, et **la variation depuis
l'édition précédente** (« +120 depuis 14 h »). C'est le seul endroit où le détail existe.

**Page de presse (tous)** — une liste ordonnée par **territoire** (le but), le premier en haut :
`rang · drapeau · nation · territoire % · général (exact) · faits d'armes`. Pas de colonne
industrie/militaire pour les autres — le général suffit et ne se décompose pas
(garde-fou de la proposition). Manchette : **« scores relevés à HH:MM:SS »** et la prochaine. Un joueur défait
(observateur) figure, marqué. Une édition = une dépêche de journal `editionPublished`
(gravité routine, « édition de 14 h — vous êtes 3ᵉ ») : c'est le rendez-vous collectif que
l'audit du 25/08 réclamait, à coût nul.

**Ce qui ne se sert jamais** : la composition, les lieux, l'industrie et le militaire d'un autre
joueur. `playerView` sert pour les autres `{ territory, general, deeds }` — `industry`/`military`
d'autrui **ne sortent pas du serveur**.

## 5. Fin de saison

À la conclusion (`concludeSeason`), une **édition finale** est écrite immédiatement, hors cadence,
marquée `final: true`. C'est le classement de l'écran de fin (chantier à part : la page de
presse en tient lieu en attendant). Le vainqueur est celui de la victoire territoriale, pas le
premier du général — les deux peuvent différer, et c'est une histoire à raconter.

## 6. Ce qui reste à trancher

1. Le général inclut-il les faits d'armes ? (ici : non — unité.)
2. L'ordre de la page de presse : territoire (ici) ou général ?
3. Les bâtiments **nationaux offerts** au lancement (la fondation, ADR 0017) comptent-ils dans
   l'industrie ? Ici : **oui** — c'est du bâti debout, et le retirer demanderait de les marquer.
   Conséquence : les nations riches partent devant, ce qui est vrai.

## Garde-fous repris

- Le score général des autres ne se décompose jamais.
- Le classement montre l'adversité, il ne la crée pas ([[objectifs-neutres]], pillage).
- Aucune constante nouvelle hors `PRESS_EDITION_HOURS`.
