# 08-sante-du-serveur — `internal.ops.health` dit en une lecture si le temps du jeu tourne : travaux en échec ou en retard, chaîne de presse, lignes échues

Série outillage : lis d'abord `WWS/docs/prompts/code/ready/outillage/README.md`.
**Suppose :** rien.

**À lire :** `convex/dev.ts` (`relaunchPress` ~115-144), `convex/press.ts` (en-tête ~9-19, arrêt
~91, `endsAt` ~115), `convex/press.test.ts` (~247, ~296-318), `convex/season-partition.test.ts`
(scan ~229-265), les index de `convex/schema.ts`, `node_modules/convex-test/dist/index.js`
~1142-1205 (un travail qui lève passe `failed`, sans `error`), `deploiement/README.md` ~38-57.

## Pourquoi

Tout le temps du jeu passe par le planificateur : 24 appels `runAt`/`runAfter` hors tests, 18
fichiers, 16 cibles (l'audit en comptait 22 : `outposts.ts` ~85 et `production.ts` ~132 sont
chaînés sur deux lignes). Ni `crons.ts`, ni `console.*` serveur, ni requête de santé. La presse est
morte en silence le 12/09, un `writeEditionJob` en échec reste muet (press.ts ~84), et le seul
symptôme documenté, « la page Presse figée » (README ~56), ce sont les joueurs qui le voient.

## Ce qui change

1. `convex/schema.ts` : `seasons` gagne `.index('byStatus', ['status'])` — un index, pas un champ,
   donc ni wipe ni migration. Sans lui, trouver les saisons lancées balaie la table.
2. `convex/ops.ts` (à créer). En-tête : les cinq codes, et la lecture seule — « il n'existe aucune
   horloge dans ce jeu » (press.ts ~9-10), la réparation reste `dev:relaunchPress`. Exports :
   - `jobName(raw)` : `press.js:publish` (prod) → `press:publish` (convex-test) ;
   - `classifyJobs(jobs, now)`, pure, sur des `DocumentByName<SystemDataModel, '_scheduled_functions'>` :
     les `failed` terminés depuis moins de 24 h par nom (`completedTime`, optionnel au type, à défaut
     `scheduledTime` ; `count`, `lastAt`, `lastError` tronqué à 200 ou `null`), les `pending` en
     retard de plus de 5 min par nom (`count`, `oldestScheduledTime`) ;
   - `pressChainsAlive(ctx, jobs)` → `Set<Id<'seasons'>>`, extraite **telle quelle** de
     `relaunchPress`, qui lui passe sa lecture entière, restée dans `dev.ts` ;
   - `health`, `internalQuery({ args: { now: v.number() } })` : **`now` en argument, jamais
     `Date.now()`**, Convex gardant une query en cache tant que ses lectures ne bougent pas.
3. `health` ne lit que par index :
   - (a)(b) `_scheduled_functions` **une fois**, `withIndex('by_creation_time')` sur 8 jours (7 de
     travaux terminés gardés : presque toute la table) ; `details.jobsRead` en donne le volume
     (plafonds d'une transaction, doc Convex du 23/09 : 16 Mio, 32 000 documents) ;
   - (c) les saisons `launched` par `byStatus` ; chaîne **attendue** si `endsAt === null` ou
     `now + PRESS_EDITION_HOURS h <= endsAt` (`endsAt` exportée de press.ts) ; dernière édition
     par `editions.bySeasonAt`, `.order('desc').first()` ;
   - (d) par saison lancée, les lignes échues de plus de 5 min : `movements.bySeason`
     (`arrivesAt`), `outposts.bySeason` (`standsAt`), `constructions` et `recruitments` par siège
     (`byPlayer`, `finishesAt` non nul). Une saison conclue garde ses lignes à jamais : ignorée.
4. Réponse `{ ok, problems, details }`, `ok` = `problems.length === 0`. Codes sans doublon :
   `FAILED_JOBS`, `OVERDUE_JOBS`, `PRESS_CHAIN_DEAD` (attendue, absente), `STALE_EDITION`
   (attendue, dernière édition — à défaut `launchedAt` — plus vieille que `PRESS_EDITION_HOURS`
   + 5 min), `OVERDUE_ROWS`. `details` : `now`, `jobsRead`, `failedJobs`, `overdueJobs`, `seasons`
   (`code`, ses propres `problems` — 09 nomme les saisons d'un code sans refaire un seuil —,
   `pressChainExpected`, `pressChainAlive`, `lastEditionAt`, `overdueRows` par table). Noms de
   travaux en listes, jamais en clés ; aucune phrase (ADR 0016).
5. `npx convex dev --once` (backend local) régénère `convex/_generated` ; à défaut, `ops` à la main
   dans `api.d.ts` comme pour C2 (README ~75), et le dire. README ~56 : le symptôme renvoie à `ops:health`.

## Ce que ce prompt ne fait pas

- Aucun appelant (09, 57, 61, 60) ; ni réparation, ni `crons.ts`, ni journalisation ; la liste
  blanche du scan reste `dev.ts` seul ; les aides de test restent locales (56).

## Cas d'acceptation (tests d'abord)

`convex/ops.test.ts` (à créer), avant `ops.ts`, horloge factice comme `press.test.ts` :

1. Saison lancée, avancée de `PRESS_EDITION_HOURS` : `ok: true`, `pressChainAlive: true`.
2. Un travail refusé par son validateur (id casté d'une autre table ; sinon un corps qui lève)
   passe `failed` : `FAILED_JOBS`, `{ name, count: 1 }` ; à `now` + 25 h, plus compté.
3. Horloge immobile, `now` = échéance du `press:publish` + 6 min : `OVERDUE_JOBS` (et `STALE_EDITION`).
4. `press:publish` annulé (comme `press.test.ts` ~305) : `PRESS_CHAIN_DEAD`, puis `STALE_EDITION`
   `PRESS_EDITION_HOURS` et 6 min plus tard.
5. Saison de 48 h sans travail, `now` au-delà de `endsAt − PRESS_EDITION_HOURS` : aucun des deux.
6. Mouvement par le chemin réel (`season-partition.test.ts` ~198-224 : `raise`, `form` recopiées,
   `attacking` de `seats.fixture.ts`), `movements:arrive` annulé, horloge avancée à `arrivesAt` +
   6 min, travaux dus vidés : `OVERDUE_ROWS`, `movements: 1`, **sans** `OVERDUE_JOBS` : (d) voit
   ce que (b) ne voit pas. Le même dans une saison passée `concluded` (par `t.run`) : `ok: true`.
7. `classifyJobs` seul : deux formes de nom ensemble, `success`/`canceled` ignorés, bornes exactes.
8. `press.test.ts` et `season-partition.test.ts` passent sans retouche, `ops.ts` compris au scan.

## Vérifications

- `npx vitest run convex/ops.test.ts convex/press.test.ts convex/season-partition.test.ts` : vert.
- Backend local, permis (`.env.local` doit viser 127.0.0.1:3210) : `npx convex dev --once`, puis
  `time npx convex run ops:health "{\"now\":$(date +%s)000}"` rend un JSON (preuve que le vrai
  backend accepte `by_creation_time` sur une table système, ce que convex-test ne prouve pas).
- `npm run verifier` : vert.

## Rapport attendu

Format commun (README de la série), plus : la réponse locale de `ops:health`, sa durée, `jobsRead`,
les noms de travaux écrits par le backend, `state.error` rempli ou non ; deux commits, le rangement
d'abord (`jobName`, `pressChainsAlive`, export d'`endsAt`) ; en « À trancher », un mouvement qui
garderait légitimement un `arrivesAt` passé, un `jobsRead` élevé.
