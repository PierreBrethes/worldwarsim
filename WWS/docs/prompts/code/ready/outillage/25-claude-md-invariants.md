# 25-claude-md-invariants — CLAUDE.md devient un fichier d'instructions de 8 000 caractères au plus : consignes, commandes, invariants, une ligne par système, et où lire le reste

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** 24.

**À lire :** `CLAUDE.md` (entier), `WWS/docs/ETAT-DU-CODE.md` (d'où tirer la règle de chaque système,
sans recopier), `WWS/CONTEXT.md` (§ « Termes bannis » ~68-73), `WWS/docs/adr/README.md`, `AGENTS.md`
(quatre lignes qui doivent rester vraies), `convex/view.ts` (~330, « ce qui reste »).

## Pourquoi

Après 24, `CLAUDE.md` n'a plus ni récit ni les invariants que ce récit noyait jusqu'à se contredire
(« trois événements » de couleur, puis un « cinquième ») : une fonction dit la couleur, on règle les
stocks à l'ancienne couleur avant d'écrire, la rose et le serveur lisent la même fonction. Budget :
8 000 caractères (`wc -m`), contre 49 557 à 7bc3a69. Pas de `CLAUDE.md` imbriqué : sous `convex/`, il
se chargerait presque à chaque session (vérificateur de l'audit).

## Ce qui change

`CLAUDE.md` réécrit dans cet ordre, **chemins complets depuis la racine** :
1. Titre et introduction ; `## Instructions` **tel que 21 l'a écrit** ; `## Commandes`, bloc inchangé.
2. `## Architecture` : l'arborescence aux noms réels (la ligne `scripts/` cite `monde.json` : ce sont
   des `generate-*.mjs` qui écrivent `public/*.json`), puis cinq invariants : `PlayerView`, jamais
   `GameState` ; états d'arc en union discriminée ; le moteur de carte n'importe pas React
   (`src/map/WorldMap.tsx`, seule frontière) ; courbure côté CPU ; `src/domain/` en TS pur (sauf
   `src/i18n/fr.ts`, ADR 0016). Garder « n'importe pas React » et « TS pur », que le code cite.
3. `## Schéma Convex` : la règle `v.optional`, deux lignes. `## Conventions` : renvoi à
   `CONVENTIONS.md` (trois lignes au plus) et une ligne qui renvoie le vocabulaire à `WWS/CONTEXT.md`,
   seule liste. « Jamais pris » tient dans la ligne Avant-poste ; « pris » entre à `CONTEXT.md` au 40.
4. `## Systèmes` : une ligne par système, `règle → fichier:fonction → ADR §`. Obligatoires : couleur,
   événement de couleur, porte, brouillard, rose = serveur, et `RegionType` qu'aucune règle de jeu ne
   lit sans ADR (trois fiches le citent de `CLAUDE.md`) ; le reste selon le budget (table ci-dessous).
5. `## Où lire` : `WWS/docs/ETAT-DU-CODE.md` (le récit), `WWS/docs/adr/README.md`,
   `WWS/docs/RESTE-A-CODER.md` (la file), `WWS/QUESTIONS.md`, `WWS/CONTEXT.md`, `deploiement/README.md`,
   `WWS/docs/design/11-brief-ui.md` avant une surface (ses bandeaux « Périmée » de 23 nomment les
   remplaçants, dont `WWS/docs/design/contrats-de-vue/`). Puis la règle : « Un chantier écrit son récit
   dans `WWS/docs/ETAT-DU-CODE.md` ou l'ADR, et ne touche ce fichier que pour un invariant nouveau.
   Aucun décompte ici : ni nations, ni tests, ni lignes. »
6. Le reliquat de `## Ce qui reste` (premier paragraphe, « **Ni terrain, ni tenaille, ni soin.** »)
   part **tel quel** à la fin d'`ETAT-DU-CODE.md`, sous `## Ce qui reste` (26 le corrige) ; « Avant
   de coder une surface » devient la ligne de la fiche 11 ; `convex/view.ts` ~330 y renvoie.

Table de départ, vérifiée le 23/09 ; chaque nom se revérifie par `git grep -w`. **Le code contredit
le cahier** : `heldRegions` vit dans `src/domain/control.ts`, `convex/holding.ts` porte `heldOver`.

| Système | Où | ADR |
|---|---|---|
| Couleur | `heldRegions` (`src/domain/control.ts`), servie par `heldOver` (`convex/holding.ts`) ; `control.held` | 0020 §1 |
| Événement de couleur, relié | `settleBeforeChange` puis `reportChange` (`convex/production.ts`) ; `isLinked` (`src/domain/economy.ts`) | 0020 §6-7 |
| Porte | `playerOf`, `requirePlayable`, `seatsOf` (`convex/seasons.ts`) | 0022 |
| Brouillard | `sightings`, `campSightings`, `regionSightings` ; `seenSegment` (`src/domain/sighting-segment.ts`) | 0021, 0024 §1-2, 0020 §5 |
| Rose = serveur | `src/domain/movement-orders.ts` ; `outpostRaiseHold` (`src/domain/construction.ts`) — `foundationHold` et `upgradeHold` sont propres au client (39) | 0015 (24/08) |
| Combat | `resolveEngagement`, `drownedOf` (`src/domain/combat.ts`) ; `DAMAGE_TABLE` (`convex/constants.ts`) ; `engageAt` (`convex/movement/arrival.ts`) | 0014, 0024 §3 |
| Avant-poste | `isStanding` (`src/domain/outposts.ts`) ; désactivé, jamais pris | 0020 §10, 0004 |
| Bouton → rôle | `roleOf` (`src/map/engine/index.ts`) ; `src/domain/mouse-mapping.ts` | — |
| Grille | `buildGrid` (`src/domain/routing.ts`), jamais dans une query ; `public/grid.json` | 0012, 0023 |
| Textes | `src/i18n/fr.ts` ; le serveur ne rend que des codes (`convex/errors.ts`) | 0016 |

## Ce que ce prompt ne fait pas

Ni `CLAUDE.md` imbriqué ni `@import` ; ni `AGENTS.md`, ni `WWS/CLAUDE.md` (22), ni `WWS/CONTEXT.md`
(40). Aucune correction du récit (26), aucune règle nouvelle ; pas de budget vérifié par un outil (31 à 33).

## Cas d'acceptation (tests d'abord)

D'abord, dans le scratchpad, un vérificateur des noms entre backticks sans espace : un chemin existe ;
un identifiant (son dernier segment) sort de `git grep -q -w -F` sur `src convex scripts package.json`.
Au départ, il signale `WorldMap.tsx` et `consommation-continue.md` ; `monde.json`, hors backticks, relève du cas 4.

1. `wc -m < CLAUDE.md` rend 8 000 au plus. Le vérificateur ne rend que des exceptions, justifiées au
   rapport : `GameState` (absent exprès) et des noms de `## Instructions`, intouchable (`/mnt/c`…).
2. `grep '^## ' CLAUDE.md` rend dans l'ordre : Instructions, Commandes, Architecture, Schéma Convex,
   Conventions, Systèmes, Où lire ; `## Instructions` est identique à celle de HEAD (`diff` vide).
3. `git show HEAD:CLAUDE.md | awk '/^## Ce qui reste/{f=1;next} /^## /{f=0} f' | grep -v '^$' |
   grep -Fxvf WWS/docs/ETAT-DU-CODE.md` ne rend que les lignes de « Avant de coder une surface ».
4. `git grep -n "CLAUDE.md" -- src convex scripts` : six lignes, les cinq d'architecture et
   `convex/constants.ts` ~595 (`RegionType`) ; `grep -c RegionType CLAUDE.md` ≥ 1 ;
   `grep -nE "monde\.json|generer-|(cinq|six|huit|[0-9]+) (nations|tests)" CLAUDE.md` : rien ;
   `git ls-files '*CLAUDE.md'` et `git status -s -uall` : aucun `CLAUDE.md` hors racine et `WWS/`.
5. `git diff --stat` : `CLAUDE.md`, `WWS/docs/ETAT-DU-CODE.md`, `convex/view.ts`, rien d'autre.

## Vérifications

- Les cas 1 à 5. `npm run verifier` : vert (un commentaire de `convex/view.ts` touché).

## Rapport attendu

Format commun (README de la série), plus : `wc -m` avant, après et par section ; les systèmes laissés
au récit faute de budget ; les exceptions du vérificateur ; les prompts de `ready/` qui demandent
encore de mettre `CLAUDE.md` à jour (dont `fin-de-saison-au-seuil-tenu.md` ~91), sans y toucher (28).
